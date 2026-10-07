"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import type { FamilyGraphData, TreeNodeData } from "../types/graph.types";
import { formatFullName } from "../types";
import { InviteModal } from "@/features/invitations/components/invite-modal";
import { EditMemberModal } from "@/features/genealogy/components/edit-member-modal";
import { AddMemberModal } from "@/features/genealogy/components/add-member-modal";
import { TreeSearchModal } from "./tree-search-modal";
import { TREE_LAYOUT } from "../utils/tree-layout";
import { relativesOf } from "../utils/person-display";
import { DEFAULT_TREE_SCOPE, saveTreeScope, TREE_SCOPE_OPTIONS, type TreeScope } from "../utils/tree-scope";
import { buildTreeScene } from "../utils/tree-scene";
import { centerOn, fitToBounds, pinch, zoomAt, type View } from "../utils/viewport";
import { PersonCard } from "./person-card";
import { PersonDetailsPanel } from "./person-details-panel";
import { ExportPdfModal } from "./export-pdf-modal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ZoomIn,
  ZoomOut,
  Compass,
  ArrowLeft,
  UserPlus,
  Eye,
  EyeOff,
  Search,
  Maximize,
  LocateFixed,
  FileDown,
  Ellipsis,
  Info,
} from "lucide-react";

interface TreeCanvasProps {
  graph: FamilyGraphData;
}

// Movimiento mínimo (px) para que un toque se convierta en arrastre
const DRAG_THRESHOLD = 6;
// Por debajo de este ancho el árbol abre encuadrado completo y los controles se compactan
const MOBILE_WIDTH = 640;

type Gesture =
  | { mode: "none" }
  | { mode: "pending" | "pan"; startX: number; startY: number; view: View }
  | { mode: "pinch"; view: View; distance: number; midX: number; midY: number };

export function TreeCanvas({ graph }: TreeCanvasProps) {
  const router = useRouter();
  const { NODE_WIDTH, NODE_HEIGHT } = TREE_LAYOUT;

  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  // Animar solo los cambios de los botones; durante gestos y rueda la vista sigue al dedo sin retraso
  const [smooth, setSmooth] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const [activeInviteMember, setActiveInviteMember] = useState<TreeNodeData | null>(null);
  const [activeEditMember, setActiveEditMember] = useState<TreeNodeData | null>(null);
  const [activeAddAnchor, setActiveAddAnchor] = useState<TreeNodeData | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  // Alcance del árbol propio: se guarda en una cookie y el servidor vuelve a calcular el árbol
  const [isScopePending, startScopeTransition] = useTransition();
  const currentScope = graph.scope ?? DEFAULT_TREE_SCOPE;
  const changeScope = (scope: TreeScope) => {
    if (scope === currentScope) return;
    saveTreeScope(scope);
    const url = new URL(window.location.href);
    url.searchParams.delete("alcance");
    startScopeTransition(() => {
      router.replace(`${url.pathname}${url.search}`);
      router.refresh();
    });
  };

  // Persona abierta en el panel lateral de detalles
  const [detailsPersonId, setDetailsPersonId] = useState<string | null>(null);
  // Modal de búsqueda / explorador de árboles (Cmd+K)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Ocultar parejas de hermanos por defecto
  const [hideSiblingSpouses, setHideSiblingSpouses] = useState(true);
  // Familia resaltada: se activa tocando una tarjeta o un corazón y se quita tocando el fondo
  const [activeBranchKey, setActiveBranchKey] = useState<string | null>(null);

  const scene = buildTreeScene({ graph, hideSiblingSpouses, activeBranchKey });

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ mode: "none" });
  const suppressClick = useRef(false);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Atajo de teclado global Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const containerSize = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  };
  const focusView = (): View => {
    const { width, height } = containerSize();
    const focus = scene.nodes.find((n) => n.isCenter);
    if (!focus) return fitToBounds(scene.bounds, width, height);
    return centerOn(focus.x + NODE_WIDTH / 2, focus.y + NODE_HEIGHT / 2, width / 2, height / 2, 1);
  };
  const fitView = (): View => {
    const { width, height } = containerSize();
    return fitToBounds(scene.bounds, width, height, width < MOBILE_WIDTH ? 16 : 48);
  };

  // Vista inicial (y al cambiar de árbol o de alcance): en el celular todo el árbol encuadrado,
  // en pantallas grandes centrado en la persona central a tamaño real.
  const sceneKey = `${graph.focusPerson.id}|${graph.scope ?? ""}|${graph.nodes.length}`;
  // Se mide el contenedor en el siguiente cuadro; hasta entonces el árbol no se muestra (sin saltos).
  const [isViewReady, setIsViewReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const { width } = containerSize();
      setSmooth(false);
      setView(width < MOBILE_WIDTH ? fitView() : focusView());
      setIsViewReady(true);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);

  const animateTo = (next: View) => {
    setSmooth(true);
    setView(next);
  };
  const zoomBy = (factor: number) => {
    const { width, height } = containerSize();
    animateTo(zoomAt(viewRef.current, viewRef.current.scale * factor, width / 2, height / 2));
  };

  // Rueda / pellizco del trackpad: zoom hacia el cursor. Listener nativo no pasivo para poder
  // evitar que la página se desplace (React registra onWheel como pasivo).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setSmooth(false);
      setView((v) => zoomAt(v, v.scale * factor, e.clientX - rect.left, e.clientY - rect.top));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  // Gestos con eventos de puntero: mouse, dedo y lápiz con el mismo código.
  const localPoint = (e: React.PointerEvent) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    setIsMobileMenuOpen(false);
    setIsLegendOpen(false);
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      suppressClick.current = false;
      gesture.current = { mode: "pending", startX: p.x, startY: p.y, view: viewRef.current };
    } else if (pointers.current.size === 2) {
      // Segundo dedo: pellizco. Captura ambos punteros para seguirlos aunque salgan de una tarjeta.
      suppressClick.current = true;
      pointers.current.forEach((_, id) => stageRef.current?.setPointerCapture?.(id));
      gesture.current = { mode: "pinch", view: viewRef.current, ...pinchState() };
      setSmooth(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (g.mode === "pending" && Math.hypot(p.x - g.startX, p.y - g.startY) > DRAG_THRESHOLD) {
      // Se convierte en arrastre: el toque ya no cuenta como clic
      gesture.current = { ...g, mode: "pan" };
      suppressClick.current = true;
      stageRef.current?.setPointerCapture?.(e.pointerId);
      setIsPanning(true);
      setSmooth(false);
    }
    const current = gesture.current;
    if (current.mode === "pan") {
      setView({ ...current.view, x: current.view.x + p.x - current.startX, y: current.view.y + p.y - current.startY });
    } else if (current.mode === "pinch" && pointers.current.size >= 2) {
      setView(pinch(current, pinchState()));
    }
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      // Quedó un dedo tras pellizcar: sigue arrastrando desde donde está, sin saltos
      const [p] = [...pointers.current.values()];
      gesture.current = { mode: "pan", startX: p.x, startY: p.y, view: viewRef.current };
    } else if (pointers.current.size === 0) {
      gesture.current = { mode: "none" };
      setIsPanning(false);
    }
  };

  // Tras un arrastre o pellizco, el clic que dispara el navegador no debe abrir ni resaltar nada
  const handleClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
    }
  };
  // Un toque en el fondo quita el resaltado
  const handleStageClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest(".tree-node-card, .union-heart")) return;
    setActiveBranchKey(null);
  };

  const allNodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const detailsPerson = detailsPersonId ? allNodesById.get(detailsPersonId) ?? null : null;
  // Agregar familiares y editar: no en árboles ajenos ni en fichas reclamadas por otra cuenta
  // (User Zero sí puede, para soporte; cada quien puede con su propia ficha).
  const canChange = (n: TreeNodeData) =>
    !graph.isViewerGuest &&
    (!n.isClaimed || graph.isUserZero || n.id === graph.focusPerson.id || n.relationshipCategory === "self");

  const availableAnchors = graph.availableMembers
    .filter((m) => {
      const node = allNodesById.get(m.id);
      if (!node) return true;
      const isSelfNode = node.id === graph.focusPerson.id || node.relationshipCategory === "self";
      return !node.isClaimed || isSelfNode || graph.isUserZero;
    })
    .map((m) => ({ id: m.id, name: formatFullName(m) }));

  const focusNode = graph.nodes.find((n) => n.id === graph.focusPerson.id) || null;
  const iconButton = "p-2.5 sm:p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition";

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100dvh-5rem)] min-h-[420px] sm:h-[780px] bg-neutral-950/90 border border-neutral-800 rounded-3xl overflow-hidden select-none"
    >
      {/* Escenario: recibe arrastre, pellizco, rueda y toques. touch-action none evita que el
          navegador desplace o amplíe la página mientras se mueve el árbol. */}
      <div
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClickCapture={handleClickCapture}
        onClick={handleStageClick}
        className={`absolute inset-0 touch-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
      >
        {/* Patrón de fondo (grilla de puntos sutiles) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: "radial-gradient(#10b981 0.75px, transparent 0.75px)",
            backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        />

        {/* Contenedor transformable (pan y zoom) */}
        <div
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "0 0",
            transition: smooth ? "transform 0.18s ease-out" : "none",
            visibility: isViewReady ? "visible" : "hidden",
          }}
          className="absolute top-0 left-0"
        >
          <svg className="overflow-visible pointer-events-none absolute top-0 left-0">
            {/* Horquillas: unión (corazón) -> barra de hermanos -> hijos */}
            {scene.buses.map((bus) => {
              const labelWidth = bus.label ? bus.label.length * 6 + 16 : 0;
              // En el espacio libre entre las tarjetas y la barra: las tarjetas tapan las líneas
              const labelY = (bus.parentMaxY + bus.busY) / 2;
              return (
                <g key={`pc-group-${bus.key}`} opacity={bus.isDimmed ? 0.15 : 1} style={{ transition: "opacity 0.2s" }}>
                  <line x1={bus.parentMidX} y1={bus.dropStartY} x2={bus.parentMidX} y2={bus.busY} stroke={bus.color} strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx={bus.parentMidX} cy={bus.busY} r="3" fill={bus.color} />
                  <line x1={bus.busStartX} y1={bus.busY} x2={bus.busEndX} y2={bus.busY} stroke={bus.color} strokeWidth="2.5" strokeLinecap="round" />
                  {bus.children.map((child) => (
                    <g key={`stub-${child.id}`}>
                      <line x1={child.x} y1={bus.busY} x2={child.x} y2={child.topY} stroke={bus.color} strokeWidth="2.5" strokeLinecap="round" />
                      <circle cx={child.x} cy={bus.busY} r="2.5" fill={bus.color} />
                    </g>
                  ))}
                  {/* Etiqueta "con X" solo cuando alguien tiene hijos con varias parejas */}
                  {bus.label && (
                    <g>
                      <rect x={bus.parentMidX + 8} y={labelY - 10} width={labelWidth} height={20} rx={10} fill="#0a0a0a" stroke={bus.color} strokeOpacity={0.6} />
                      <text x={bus.parentMidX + 8 + labelWidth / 2} y={labelY + 4} textAnchor="middle" fill={bus.color} fontSize="11" fontWeight="500">
                        {bus.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Uniones: línea sólida tarjeta -> corazón -> tarjeta */}
            {scene.unions.map((u) => (
              <g key={u.id} opacity={u.isDimmed ? 0.15 : 1} style={{ transition: "opacity 0.2s" }}>
                <line
                  x1={u.x1}
                  y1={u.y1}
                  x2={u.x2}
                  y2={u.y2}
                  stroke={u.lineColor}
                  strokeOpacity={u.isEnded ? 1 : 0.85}
                  strokeWidth="2"
                  strokeDasharray={u.isEnded ? "4 4" : undefined}
                />
                <g
                  className={u.branchKey ? "union-heart cursor-pointer" : undefined}
                  style={u.branchKey ? { pointerEvents: "all" } : undefined}
                  role={u.branchKey ? "button" : undefined}
                  aria-label={u.branchKey ? "Resaltar la familia de esta unión" : undefined}
                  onClick={u.branchKey ? () => setActiveBranchKey(u.branchKey!) : undefined}
                >
                  {u.isEnded ? (
                    <>
                      <circle cx={u.midX} cy={u.y1} r="10" fill="#18181b" stroke={u.ringColor} strokeWidth="1.5" />
                      <text x={u.midX} y={u.y1 + 4} textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="bold">
                        ≠
                      </text>
                    </>
                  ) : (
                    <>
                      <circle cx={u.midX} cy={u.y1} r="10" fill="#0f172a" stroke={u.ringColor} strokeWidth="1.5" />
                      <path
                        d={`M ${u.midX - 3.5} ${u.y1 - 1.5} a 2 2 0 0 1 3.5 -1.5 a 2 2 0 0 1 3.5 1.5 c 0 2 -3.5 4 -3.5 4 s -3.5 -2 -3.5 -4 z`}
                        fill="#ec4899"
                      />
                    </>
                  )}
                  {u.isActive && <circle cx={u.midX} cy={u.y1} r="14" fill="none" stroke={u.ringColor} strokeWidth="1.5" strokeOpacity="0.6" />}
                </g>
              </g>
            ))}
          </svg>

          {/* Tarjetas tipo retrato */}
          {scene.nodes.map((s) => (
            <PersonCard
              key={s.node.id}
              person={s.node}
              stripeColor={s.stripeColor}
              isCenter={s.isCenter}
              isDimmed={s.isDimmed}
              isSelected={detailsPersonId === s.node.id}
              onOpenDetails={() => setDetailsPersonId(s.node.id)}
              onClick={s.branchKey ? () => setActiveBranchKey(s.branchKey!) : undefined}
              style={{
                position: "absolute",
                left: `${s.x}px`,
                top: `${s.y}px`,
                width: `${NODE_WIDTH}px`,
                height: `${NODE_HEIGHT}px`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Barra superior: perspectiva activa (compacta en el celular) */}
      <div className="tree-controls absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 flex items-center justify-between gap-2 sm:gap-3 bg-neutral-900/90 border border-neutral-800 px-3 py-2 sm:px-5 sm:py-2.5 rounded-2xl shadow-xl backdrop-blur-md z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden sm:inline text-xs text-neutral-400">Perspectiva:</span>
              <span className="text-xs font-bold text-white truncate">{formatFullName(graph.focusPerson)}</span>
              {graph.focusPerson.isSelf ? (
                <span className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                  <span className="sm:hidden">Tú</span>
                  <span className="hidden sm:inline">Tú (Nodo Raíz)</span>
                </span>
              ) : (
                <span className="hidden sm:inline shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300">
                  Explorando Familiar
                </span>
              )}
            </div>
            {graph.isUserZero && (
              <span className="hidden sm:block text-[10px] text-neutral-500">
                Modo Administrador: Puedes moverte entre árboles y editar las ramas de cualquiera
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!graph.focusPerson.isSelf && (
            <Link
              href="/tree"
              aria-label="Volver a mi árbol"
              className="flex items-center gap-1.5 text-xs font-semibold p-2.5 sm:px-3 sm:py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Volver a mi árbol</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            aria-label="Explorar árbol"
            title="Buscar familiar por nombre o ID exacto (Cmd+K)"
            className="flex items-center gap-2 bg-neutral-950 hover:bg-neutral-800 border border-neutral-700/80 hover:border-emerald-500/60 rounded-xl p-2.5 sm:px-3 sm:py-1.5 text-xs text-neutral-200 transition shadow-sm group"
          >
            <Search className="w-3.5 h-3.5 text-neutral-400 group-hover:text-emerald-400 transition" />
            <span className="hidden sm:inline">Explorar árbol...</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-neutral-900 border border-neutral-700 rounded text-neutral-400">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>

      {/* Estado vacío si no hay nodos */}
      {graph.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
          <div className="p-6 rounded-3xl bg-neutral-900/90 border border-neutral-800 text-neutral-400 max-w-md shadow-2xl backdrop-blur-md pointer-events-auto">
            <h3 className="text-base font-bold text-white mb-2">Árbol Familiar en Espera</h3>
            <p className="text-xs text-neutral-400 mb-5 leading-relaxed">
              No se encontraron registros genealógicos asociados a tu perfil. Puedes volver al directorio para consultar tus fichas o agregar a tus primeros parientes.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver al Directorio</span>
            </Link>
          </div>
        </div>
      )}

      {/* Menú "⋯" del celular: las opciones que no caben en la barra */}
      {isMobileMenuOpen && (
        <div className="tree-controls md:hidden absolute bottom-20 right-3 left-3 z-30 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-3 space-y-3">
          {!graph.isViewerGuest && (
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setActiveAddAnchor(focusNode);
              }}
              className="w-full flex items-center gap-2 px-3 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
            >
              <UserPlus className="w-4 h-4" />
              Añadir pariente
            </button>
          )}
          {!graph.isViewerGuest && (
            <div role="radiogroup" aria-label="Alcance del árbol" className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 px-1">Alcance</div>
              {TREE_SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={currentScope === option.value}
                  disabled={isScopePending}
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    changeScope(option.value);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition ${
                    currentScope === option.value
                      ? "border-emerald-600 bg-emerald-500/10 text-emerald-200"
                      : "border-neutral-800 text-neutral-300"
                  }`}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-[11px] text-neutral-500">{option.description}</div>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setHideSiblingSpouses(!hideSiblingSpouses)}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-neutral-800 text-sm text-neutral-200"
            >
              {hideSiblingSpouses ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {hideSiblingSpouses ? "Ver parejas" : "Ocultar parejas"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsExportOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-neutral-800 text-sm text-neutral-200"
            >
              <FileDown className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>
        </div>
      )}

      {/* Controles flotantes de navegación y visualización */}
      <div className="tree-controls absolute bottom-3 right-3 sm:bottom-6 sm:right-6 flex items-center gap-1 bg-neutral-900/90 border border-neutral-800 p-1.5 rounded-2xl shadow-xl backdrop-blur-md z-20">
        {!graph.isViewerGuest && (
          <>
            <button
              onClick={() => setActiveAddAnchor(focusNode)}
              title="Añadir familiar al árbol genealógico"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Añadir Pariente</span>
            </button>
            <div className="hidden md:block w-[1px] h-5 bg-neutral-800 mx-1" />

            {/* Alcance: qué tan extenso se ve el propio árbol */}
            <div
              role="radiogroup"
              aria-label="Alcance del árbol"
              className={`hidden md:flex items-center gap-0.5 p-0.5 rounded-xl bg-neutral-950 border border-neutral-800 ${
                isScopePending ? "opacity-60" : ""
              }`}
            >
              {TREE_SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={currentScope === option.value}
                  disabled={isScopePending}
                  onClick={() => changeScope(option.value)}
                  title={option.description}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                    currentScope === option.value ? "bg-emerald-500/20 text-emerald-300" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="hidden md:block w-[1px] h-5 bg-neutral-800 mx-1" />
          </>
        )}

        <button
          onClick={() => setHideSiblingSpouses(!hideSiblingSpouses)}
          title={hideSiblingSpouses ? "Mostrar parejas de hermanos/colaterales" : "Ocultar parejas de hermanos (Modo Troncal)"}
          className={`hidden md:block p-2 rounded-xl transition ${
            !hideSiblingSpouses
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "text-neutral-400 hover:text-white hover:bg-neutral-800"
          }`}
        >
          {hideSiblingSpouses ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button onClick={() => setIsExportOpen(true)} title="Exportar el árbol en PDF" aria-label="Exportar el árbol en PDF" className={`hidden md:block ${iconButton}`}>
          <FileDown className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setIsMobileMenuOpen(false);
            setIsLegendOpen((open) => !open);
          }}
          title="Leyenda"
          aria-label="Leyenda"
          aria-expanded={isLegendOpen}
          className={`${iconButton} ${isLegendOpen ? "bg-neutral-800 text-white" : ""}`}
        >
          <Info className="w-4 h-4" />
        </button>
        <div className="hidden md:block w-[1px] h-5 bg-neutral-800 mx-1" />

        <button onClick={() => animateTo(fitView())} title="Ver todo el árbol" aria-label="Ver todo el árbol" className={iconButton}>
          <Maximize className="w-4 h-4" />
        </button>
        <button onClick={() => zoomBy(1 / 1.25)} title="Alejar" aria-label="Alejar" className={iconButton}>
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={() => zoomBy(1.25)} title="Acercar" aria-label="Acercar" className={iconButton}>
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => animateTo(focusView())} title="Centrar en la persona central" aria-label="Centrar en la persona central" className={iconButton}>
          <LocateFixed className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setIsLegendOpen(false);
            setIsMobileMenuOpen((open) => !open);
          }}
          aria-label="Más opciones"
          aria-expanded={isMobileMenuOpen}
          className={`md:hidden ${iconButton} ${isMobileMenuOpen ? "bg-neutral-800 text-white" : ""}`}
        >
          <Ellipsis className="w-4 h-4" />
        </button>
      </div>

      {/* Leyenda: se abre desde la barra de controles para no encimarse con ella */}
      {isLegendOpen && (
        <div className="tree-controls absolute bottom-20 right-3 sm:bottom-24 sm:right-6 z-30 w-[min(20rem,calc(100%-1.5rem))] bg-neutral-900/95 border border-neutral-800 rounded-2xl shadow-2xl backdrop-blur-md p-4 space-y-2.5 text-xs text-neutral-300">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Leyenda</div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-md border border-pink-400/80" />
            <span>Mujer (el contorno se ilumina al pasar el mouse)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-md border border-blue-400/80" />
            <span>Hombre</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 bg-emerald-400 rounded" />
            <span>Tu línea directa</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex gap-0.5">
              <span className="w-2 h-1 bg-sky-400 rounded" />
              <span className="w-2 h-1 bg-amber-400 rounded" />
              <span className="w-2 h-1 bg-violet-400 rounded" />
            </span>
            <span>Otras familias: toca a alguien para resaltar la suya</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 text-center text-red-400 font-bold">≠</span>
            <span>Separados / divorciados</span>
          </div>
        </div>
      )}

      {/* Panel lateral de detalles */}
      {detailsPerson && (
        <PersonDetailsPanel
          key={detailsPerson.id}
          person={detailsPerson}
          family={relativesOf({
            personId: detailsPerson.id,
            nameOf: (id) => {
              const n = allNodesById.get(id);
              return n ? formatFullName(n) : undefined;
            },
            parentEdges: graph.edges
              .filter((e) => e.type === "parent-child")
              .map((e) => ({ parentId: e.sourceId, childId: e.targetId })),
            unions: graph.edges
              .filter((e) => e.type === "union")
              .map((e) => ({ personAId: e.sourceId, personBId: e.targetId, unionType: e.unionType })),
          })}
          onClose={() => setDetailsPersonId(null)}
          onSelectRelative={(id) => setDetailsPersonId(id)}
          onViewTree={detailsPerson.id !== graph.focusPerson.id ? () => router.push(`/tree?focus=${detailsPerson.id}`) : undefined}
          onAddRelative={canChange(detailsPerson) ? () => setActiveAddAnchor(detailsPerson) : undefined}
          onEdit={canChange(detailsPerson) ? () => setActiveEditMember(detailsPerson) : undefined}
          onInvite={
            !graph.isViewerGuest && detailsPerson.isLiving && !detailsPerson.isClaimed ? () => setActiveInviteMember(detailsPerson) : undefined
          }
        />
      )}

      {/* Exportar en PDF: vista previa con lo que se ve (alcance, parejas ocultas y resaltado) */}
      {isExportOpen && (
        <ExportPdfModal
          graph={graph}
          scene={scene}
          scopeLabel={TREE_SCOPE_OPTIONS.find((o) => o.value === currentScope)?.label}
          onClose={() => setIsExportOpen(false)}
        />
      )}

      {activeEditMember && (
        <EditMemberModal
          key={activeEditMember.id}
          member={activeEditMember}
          availableFamilyMembers={graph.nodes.map((n) => ({ id: n.id, name: formatFullName(n) }))}
          isUserZero={graph.isUserZero}
          isSelf={activeEditMember?.id === graph.focusPerson.id}
          isOpen={Boolean(activeEditMember)}
          onClose={() => setActiveEditMember(null)}
        />
      )}

      {activeAddAnchor && (
        <AddMemberModal
          key={activeAddAnchor.id}
          defaultAnchorId={activeAddAnchor.id}
          defaultAnchorName={formatFullName(activeAddAnchor)}
          availableAnchors={availableAnchors}
          isOpen={Boolean(activeAddAnchor)}
          onClose={() => setActiveAddAnchor(null)}
        />
      )}

      {activeInviteMember && (
        <InviteModal
          personId={activeInviteMember.id}
          personName={formatFullName(activeInviteMember)}
          relationshipLabel={activeInviteMember.relationshipLabel}
          existingToken={activeInviteMember.invitationToken}
          isOpen={Boolean(activeInviteMember)}
          onClose={() => setActiveInviteMember(null)}
        />
      )}

      <TreeSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        currentPersonId={graph.focusPerson.id}
        quickMembers={graph.availableMembers}
      />
    </div>
  );
}
