"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { FamilyGraphData, TreeNodeData } from "../types/graph.types";
import { InviteModal } from "@/features/invitations/components/invite-modal";
import { EditMemberModal } from "@/features/genealogy/components/edit-member-modal";
import { AddMemberModal } from "@/features/genealogy/components/add-member-modal";
import { TreeSearchModal } from "./tree-search-modal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  Clock,
  KeyRound,
  CheckCircle,
  Pencil,
  Compass,
  ArrowLeft,
  UserPlus,
  Eye,
  EyeOff,
  Search,
  Sparkles,
} from "lucide-react";

interface TreeCanvasProps {
  graph: FamilyGraphData;
}

export function TreeCanvas({ graph }: TreeCanvasProps) {
  const router = useRouter();
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [activeInviteMember, setActiveInviteMember] = useState<TreeNodeData | null>(null);
  const [activeEditMember, setActiveEditMember] = useState<TreeNodeData | null>(null);
  const [activeAddAnchor, setActiveAddAnchor] = useState<TreeNodeData | null>(null);

  // Modal de búsqueda / explorador de árboles (Cmd+K)
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Toggle de control de complejidad: Ocultar parejas de hermanos por defecto
  const [hideSiblingSpouses, setHideSiblingSpouses] = useState(true);

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

  const containerRef = useRef<HTMLDivElement>(null);

  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 120;

  // Centrar el grafo en la pantalla al montar
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        x: rect.width / 2,
        y: rect.height / 3.5,
      });
    }
  }, []);

  // Eventos de arrastre del lienzo (Pan)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest(".tree-node-card") ||
      (e.target as HTMLElement).closest(".tree-controls") ||
      (e.target as HTMLElement).closest("button") ||
      (e.target as HTMLElement).closest("select") ||
      (e.target as HTMLElement).closest("a")
    ) {
      return;
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom con la rueda del ratón
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
    if (newScale >= 0.4 && newScale <= 2.5) {
      setScale(newScale);
    }
  };

  const handleReset = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setScale(1);
      setPosition({
        x: rect.width / 2,
        y: rect.height / 3.5,
      });
    }
  };

  // Filtrado de nodos según el toggle de parejas de hermanos
  const filteredNodes = graph.nodes.filter((node) => {
    if (!hideSiblingSpouses) return true;
    // Si es pareja de un hermano y no es la pareja de la persona central, ocultar para despejar
    if (node.relationshipCategory === "spouse" && node.id !== graph.focusPerson.id) {
      const isDirectSpouseOfFocus = graph.edges.some(
        (e) =>
          e.type === "union" &&
          ((e.sourceId === graph.focusPerson.id && e.targetId === node.id) ||
            (e.targetId === graph.focusPerson.id && e.sourceId === node.id))
      );
      if (!isDirectSpouseOfFocus) return false;
    }
    return true;
  });

  const nodeMap = new Map<string, TreeNodeData>();
  filteredNodes.forEach((n) => nodeMap.set(n.id, n));

  // =========================================================================
  // AGRUPACIÓN PARA HORQUILLA GENEALÓGICA ENTRE HERMANOS (Pedigree Bus Bar)
  // =========================================================================
  const childToParentsMap = new Map<string, string[]>();
  graph.edges
    .filter((e) => e.type === "parent-child")
    .forEach((e) => {
      if (nodeMap.has(e.targetId) && nodeMap.has(e.sourceId)) {
        const pList = childToParentsMap.get(e.targetId) || [];
        if (!pList.includes(e.sourceId)) pList.push(e.sourceId);
        childToParentsMap.set(e.targetId, pList);
      }
    });

  const parentGroupToChildrenMap = new Map<string, string[]>();
  childToParentsMap.forEach((parents, childId) => {
    const parentKey = parents.sort().join("_");
    const cList = parentGroupToChildrenMap.get(parentKey) || [];
    if (!cList.includes(childId)) cList.push(childId);
    parentGroupToChildrenMap.set(parentKey, cList);
  });

  const availableAnchors = graph.availableMembers.map((m) => ({
    id: m.id,
    name: `${m.firstName} ${m.lastName}`,
  }));

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className={`relative w-full h-[780px] bg-neutral-950/90 border border-neutral-800 rounded-3xl overflow-hidden select-none cursor-grab active:cursor-grabbing ${
        isDragging ? "cursor-grabbing" : ""
      }`}
    >
      {/* Patrón de fondo (grilla de puntos sutiles) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "radial-gradient(#10b981 0.75px, transparent 0.75px)",
          backgroundSize: "24px 24px",
          backgroundPosition: `${position.x}px ${position.y}px`,
        }}
      />

      {/* Barra Superior: Perspectiva Activa & Modo Administrador */}
      <div className="tree-controls absolute top-4 left-4 right-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-900/90 border border-neutral-800 p-3 sm:px-5 sm:py-2.5 rounded-2xl shadow-xl backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">Perspectiva:</span>
              <span className="text-xs font-bold text-white">
                {graph.focusPerson.firstName} {graph.focusPerson.lastName}
              </span>
              {graph.focusPerson.isSelf ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                  Tú (Nodo Raíz)
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300">
                  Explorando Familiar
                </span>
              )}
            </div>
            {graph.isUserZero && (
              <span className="text-[10px] text-neutral-500 block">
                Modo Administrador: Puedes moverte entre árboles y editar las ramas de cualquiera
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {/* Volver a mi propio árbol si estamos en otra perspectiva */}
          {!graph.focusPerson.isSelf && (
            <Link
              href="/tree"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a mi árbol</span>
            </Link>
          )}

          {/* Botón de Explorador de Árboles y Búsqueda por Nombre o ID */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            title="Buscar familiar por nombre o ID exacto (Cmd+K)"
            className="flex items-center gap-2 bg-neutral-950 hover:bg-neutral-800 border border-neutral-700/80 hover:border-emerald-500/60 rounded-xl px-3 py-1.5 text-xs text-neutral-200 transition shadow-sm group"
          >
            <Search className="w-3.5 h-3.5 text-neutral-400 group-hover:text-emerald-400 transition" />
            <span>Explorar árbol...</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-neutral-900 border border-neutral-700 rounded text-neutral-400">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>

      {/* Contenedor Transformable (Pan & Zoom) */}
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          transition: isDragging ? "none" : "transform 0.1s ease-out",
        }}
        className="absolute top-0 left-0"
      >
        {/* Capa de Aristas SVG */}
        <svg className="overflow-visible pointer-events-none absolute top-0 left-0">
          <defs>
            <linearGradient id="unionGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Renderizado de Horquillas Genealógicas (Padres -> Hermanos) */}
          {Array.from(parentGroupToChildrenMap.entries()).map(([parentKey, childIds]) => {
            const parents = parentKey
              .split("_")
              .map((pId) => nodeMap.get(pId))
              .filter(Boolean) as TreeNodeData[];
            const children = childIds
              .map((cId) => nodeMap.get(cId))
              .filter(Boolean) as TreeNodeData[];

            if (parents.length === 0 || children.length === 0) return null;

            // Punto de salida de los padres
            let parentMidX = 0;
            let parentMaxY = 0;
            if (parents.length >= 2) {
              parentMidX = (parents[0].x! + parents[1].x! + NODE_WIDTH) / 2;
              parentMaxY = Math.max(parents[0].y!, parents[1].y!) + NODE_HEIGHT;
            } else {
              parentMidX = parents[0].x! + NODE_WIDTH / 2;
              parentMaxY = parents[0].y! + NODE_HEIGHT;
            }

            const firstChild = children[0];
            const busY = parentMaxY + (firstChild.y! - parentMaxY) / 2;

            if (children.length === 1) {
              // Hijo único: conexión vertical directa
              const childX = firstChild.x! + NODE_WIDTH / 2;
              const childY = firstChild.y!;
              return (
                <path
                  key={`pc-single-${parentKey}`}
                  d={`M ${parentMidX} ${parentMaxY} C ${parentMidX} ${busY}, ${childX} ${busY}, ${childX} ${childY}`}
                  fill="none"
                  stroke="#10b981"
                  strokeOpacity="0.85"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              );
            }

            // Dos o más hijos (HERMANOS): Horquilla clásica con bus bar horizontal
            const childXs = children.map((c) => c.x! + NODE_WIDTH / 2);
            const minChildX = Math.min(...childXs);
            const maxChildX = Math.max(...childXs);

            return (
              <g key={`pc-group-${parentKey}`}>
                {/* Bajada vertical desde los padres hacia la barra de hermanos */}
                <line
                  x1={parentMidX}
                  y1={parentMaxY}
                  x2={parentMidX}
                  y2={busY}
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx={parentMidX} cy={busY} r="3" fill="#10b981" />

                {/* Barra horizontal que agrupa y conecta a todos los hermanos */}
                <line
                  x1={minChildX}
                  y1={busY}
                  x2={maxChildX}
                  y2={busY}
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Trazos verticales hacia cada hermano */}
                {children.map((child) => {
                  const cX = child.x! + NODE_WIDTH / 2;
                  const cY = child.y!;
                  return (
                    <g key={`stub-${child.id}`}>
                      <line
                        x1={cX}
                        y1={busY}
                        x2={cX}
                        y2={cY}
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle cx={cX} cy={busY} r="2.5" fill="#10b981" />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Renderizado de Aristas de Unión Conyugal */}
          {graph.edges
            .filter((e) => e.type === "union")
            .map((edge) => {
              const source = nodeMap.get(edge.sourceId);
              const target = nodeMap.get(edge.targetId);

              if (!source || !target || source.x === undefined || target.x === undefined) {
                return null;
              }

              const isLeft = source.x < target.x;
              const x1 = isLeft ? source.x + NODE_WIDTH : source.x;
              const y1 = source.y! + NODE_HEIGHT / 2;
              const x2 = isLeft ? target.x : target.x + NODE_WIDTH;
              const y2 = target.y! + NODE_HEIGHT / 2;
              const midX = (x1 + x2) / 2;

              const isSeparatedOrDivorced = edge.unionType === "divorced" || edge.unionType === "separated";

              if (isSeparatedOrDivorced) {
                // Vínculo conyugal disuelto o separado
                return (
                  <g key={edge.id}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#71717a"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                    <circle cx={midX} cy={y1} r="9" fill="#18181b" stroke="#71717a" strokeWidth="1.5" />
                    <text
                      x={midX}
                      y={y1 + 4}
                      textAnchor="middle"
                      fill="#ef4444"
                      fontSize="12"
                      fontWeight="bold"
                    >
                      ≠
                    </text>
                  </g>
                );
              }

              return (
                <g key={edge.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="url(#unionGrad)"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  <circle cx={midX} cy={y1} r="9" fill="#0f172a" stroke="#ec4899" strokeWidth="1.5" />
                  <path
                    d={`M ${midX - 3.5} ${y1 - 1.5} a 2 2 0 0 1 3.5 -1.5 a 2 2 0 0 1 3.5 1.5 c 0 2 -3.5 4 -3.5 4 s -3.5 -2 -3.5 -4 z`}
                    fill="#ec4899"
                  />
                </g>
              );
            })}
        </svg>

        {/* Capa de Nodos HTML */}
        {filteredNodes.map((node) => {
          if (node.x === undefined || node.y === undefined) return null;

          const isCenter = node.id === graph.focusPerson.id;
          const isFemale = node.gender === "female";
          const isMale = node.gender === "male";
          const initials = `${node.firstName[0] || ""}${node.lastName[0] || ""}`.toUpperCase();

          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${NODE_WIDTH}px`,
                height: `${NODE_HEIGHT}px`,
              }}
              className={`tree-node-card group p-3 rounded-2xl border transition-all shadow-xl backdrop-blur-md flex flex-col justify-between cursor-default ${
                isCenter
                  ? "bg-gradient-to-br from-emerald-950/90 to-neutral-900 border-emerald-500/80 shadow-emerald-950/50 ring-2 ring-emerald-500/30"
                  : isFemale
                  ? "bg-neutral-900/90 border-neutral-800 hover:border-pink-500/50"
                  : isMale
                  ? "bg-neutral-900/90 border-neutral-800 hover:border-blue-500/50"
                  : "bg-neutral-900/90 border-neutral-800 hover:border-neutral-700"
              }`}
            >
              {/* Encabezado del Nodo */}
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div
                    className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 border relative ${
                      isFemale
                        ? "bg-gradient-to-tr from-pink-950 via-rose-900 to-pink-800 border-pink-500/50 text-pink-200"
                        : isMale
                        ? "bg-gradient-to-tr from-blue-950 via-indigo-900 to-blue-800 border-blue-500/50 text-blue-200"
                        : "bg-neutral-800 border-neutral-700 text-neutral-300"
                    }`}
                  >
                    {initials}
                  </div>

                  <div className="overflow-hidden">
                    <div className="flex items-center gap-1 truncate">
                      <h4 className="text-xs font-bold text-white truncate leading-tight">
                        {node.firstName} {node.lastName}
                      </h4>
                      {isFemale && (
                        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-pink-500/20 text-pink-400 font-bold text-[9px] shrink-0">
                          ♀
                        </span>
                      )}
                      {isMale && (
                        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-blue-500/20 text-blue-400 font-bold text-[9px] shrink-0">
                          ♂
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[10px] font-medium truncate block ${
                          isFemale ? "text-pink-400" : isMale ? "text-blue-400" : "text-emerald-400"
                        }`}
                        title={node.relationshipExplanation || node.relationshipLabel}
                      >
                        {node.relationshipLabel}
                      </span>
                      {node.relationshipExplanation && !isCenter && (
                        <span
                          title={`Parentesco inferido: ${node.relationshipExplanation}`}
                          className="cursor-help text-amber-400/80 hover:text-amber-300"
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isCenter && (
                    <span className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Centro
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveEditMember(node);
                    }}
                    title="Editar ficha"
                    className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Estado y Quorum */}
              <div className="my-auto pt-0.5">
                {node.isClaimed ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Reclamado</span>
                  </span>
                ) : !node.isLiving ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-400 bg-neutral-950 border border-neutral-800 px-2 py-0.5 rounded-full">
                    <span>Fallecido</span>
                  </span>
                ) : node.invitationStatus === "pending" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full">
                    <Clock className="w-2.5 h-2.5 text-amber-400" />
                    <span>Invitado</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-300 bg-teal-950/60 border border-teal-800/40 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-2.5 h-2.5 text-teal-400" />
                    <span>Ficha Preliminar</span>
                  </span>
                )}
              </div>

              {/* Botones de Acción inferior */}
              <div className="pt-1.5 border-t border-neutral-800/60 flex items-center justify-between">
                <span className="text-[10px] text-neutral-500 font-mono">
                  {node.birthDate ? node.birthDate.substring(0, 4) : "—"}
                </span>

                <div className="flex items-center gap-1">
                  {/* Si no es el centro, botón para centrar y explorar su propio árbol */}
                  {!isCenter && (
                    <button
                      onClick={() => {
                        router.push(`/tree?focus=${node.id}`);
                      }}
                      title="Explorar árbol desde este familiar"
                      className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white transition border border-neutral-700/60"
                    >
                      <Compass className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Ver árbol</span>
                    </button>
                  )}

                  {/* Botón para añadirle parientes directamente a este nodo */}
                  <button
                    onClick={() => setActiveAddAnchor(node)}
                    title={`Añadir pariente a ${node.firstName}`}
                    className="p-1 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 rounded transition"
                  >
                    <UserPlus className="w-3 h-3" />
                  </button>

                  {/* Invitar si está viva y sin reclamar */}
                  {node.isLiving && !node.isClaimed && (
                    <button
                      onClick={() => setActiveInviteMember(node)}
                      title="Generar invitación criptográfica"
                      className="p-1 text-neutral-400 hover:text-teal-400 hover:bg-neutral-800 rounded transition"
                    >
                      <KeyRound className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controles Flotantes de Navegación y Visualización */}
      <div className="tree-controls absolute bottom-6 right-6 flex items-center gap-1 bg-neutral-900/90 border border-neutral-800 p-1.5 rounded-2xl shadow-xl backdrop-blur-md z-10">
        {/* Toggle para ocultar parejas de hermanos */}
        <button
          onClick={() => setHideSiblingSpouses(!hideSiblingSpouses)}
          title={
            hideSiblingSpouses
              ? "Mostrar parejas de hermanos/colaterales"
              : "Ocultar parejas de hermanos (Modo Troncal)"
          }
          className={`p-2 rounded-xl transition ${
            !hideSiblingSpouses
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "text-neutral-400 hover:text-white hover:bg-neutral-800"
          }`}
        >
          {hideSiblingSpouses ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>

        <div className="w-[1px] h-5 bg-neutral-800 mx-1" />

        <button
          onClick={() => setScale((s) => Math.min(s * 1.2, 2.5))}
          title="Acercar (Zoom In)"
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setScale((s) => Math.max(s / 1.2, 0.4))}
          title="Alejar (Zoom Out)"
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleReset}
          title="Centrar Árbol"
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      {/* Leyenda en pie de lienzo */}
      <div className="tree-controls absolute bottom-6 left-6 hidden md:flex items-center gap-4 bg-neutral-900/80 border border-neutral-800 px-4 py-2 rounded-2xl text-xs text-neutral-400 backdrop-blur-sm z-10">
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-pink-500/20 text-pink-400 font-bold text-[10px] flex items-center justify-center">
            ♀
          </span>
          <span>Mujer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-blue-500/20 text-blue-400 font-bold text-[10px] flex items-center justify-center">
            ♂
          </span>
          <span>Hombre</span>
        </div>
        <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3">
          <span className="w-2.5 h-1 bg-emerald-400 inline-block rounded" />
          <span>Horquilla de Hermanos</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-red-400 font-bold">≠</span>
          <span>Separados / Divorciados</span>
        </div>
      </div>

      {/* Modal de Edición */}
      {activeEditMember && (
        <EditMemberModal
          member={activeEditMember}
          availableFamilyMembers={graph.nodes.map((n) => ({
            id: n.id,
            name: `${n.firstName} ${n.lastName}`,
          }))}
          isOpen={Boolean(activeEditMember)}
          onClose={() => setActiveEditMember(null)}
        />
      )}

      {/* Modal de Añadir Pariente Contextual (Anclado al nodo seleccionado) */}
      {activeAddAnchor && (
        <AddMemberModal
          defaultAnchorId={activeAddAnchor.id}
          defaultAnchorName={`${activeAddAnchor.firstName} ${activeAddAnchor.lastName}`}
          availableAnchors={availableAnchors}
          triggerButton={<span />}
        />
      )}

      {/* Modal de Invitación */}
      {activeInviteMember && (
        <InviteModal
          personId={activeInviteMember.id}
          personName={`${activeInviteMember.firstName} ${activeInviteMember.lastName}`}
          relationshipLabel={activeInviteMember.relationshipLabel}
          existingToken={activeInviteMember.invitationToken}
          isOpen={Boolean(activeInviteMember)}
          onClose={() => setActiveInviteMember(null)}
        />
      )}

      {/* Modal de Búsqueda y Explorador de Árboles (Cmd+K) */}
      <TreeSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        currentPersonId={graph.focusPerson.id}
        quickMembers={graph.availableMembers}
      />
    </div>
  );
}
