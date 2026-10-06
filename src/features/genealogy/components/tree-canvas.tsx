"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { FamilyGraphData, TreeNodeData } from "../types/graph.types";
import { formatFullName } from "../types";
import { InviteModal } from "@/features/invitations/components/invite-modal";
import { EditMemberModal } from "@/features/genealogy/components/edit-member-modal";
import { AddMemberModal } from "@/features/genealogy/components/add-member-modal";
import { TreeSearchModal } from "./tree-search-modal";
import {
  buildFamilyBranches,
  buildSiblingGroups,
  parentGroupKey,
  ROOT_STRIPE_COLOR,
  staggerBusRows,
} from "../utils/sibling-groups";
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

  // Rama resaltada (unión + descendientes). Se queda fija hasta pasar a otra rama
  // o hacer clic en el fondo; en móvil se activa con un toque.
  const [activeBranchKey, setActiveBranchKey] = useState<string | null>(null);
  const pointerDownAt = useRef({ x: 0, y: 0 });

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
    pointerDownAt.current = { x: e.clientX, y: e.clientY };
    if (
      (e.target as Element).closest(".union-heart") ||
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

  // Un clic en el fondo (sin arrastrar) quita el resaltado fijado
  const handleCanvasClick = (e: React.MouseEvent) => {
    const target = e.target as Element;
    if (target.closest(".tree-node-card, .union-heart, .tree-controls")) return;
    const moved = Math.hypot(e.clientX - pointerDownAt.current.x, e.clientY - pointerDownAt.current.y);
    if (moved < 5) setActiveBranchKey(null);
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
  // Cada grupo de hijos cuelga de su unión; si alguien tiene hijos con varias
  // parejas, cada grupo lleva su propio color y una etiqueta "con X".
  const visibleIds = new Set(nodeMap.keys());
  const parentChildPairs = graph.edges
    .filter((e) => e.type === "parent-child")
    .map((e) => ({ parentId: e.sourceId, childId: e.targetId }));
  const siblingGroups = buildSiblingGroups({
    focusId: graph.focusPerson.id,
    visibleIds,
    parentEdges: parentChildPairs,
    firstNameOf: (id) => nodeMap.get(id)?.firstName ?? "",
  });
  const groupByKey = new Map(siblingGroups.map((g) => [g.key, g]));
  const groupKeyOfChild = new Map<string, string>();
  siblingGroups.forEach((g) => g.childIds.forEach((c) => groupKeyOfChild.set(c, g.key)));

  const visibleUnionEdges = graph.edges.filter(
    (e) => e.type === "union" && nodeMap.has(e.sourceId) && nodeMap.has(e.targetId)
  );
  const unionPairKeys = new Set(visibleUnionEdges.map((e) => parentGroupKey([e.sourceId, e.targetId])));

  // Ramas: cada unión multi-pareja con sus hijos, nietos y demás descendientes visibles.
  const { membersByKey, branchOfPerson } = buildFamilyBranches({
    groups: siblingGroups,
    parentEdges: parentChildPairs,
    unions: visibleUnionEdges.map((e) => ({ personAId: e.sourceId, personBId: e.targetId })),
    visibleIds,
  });
  const highlightedIds = activeBranchKey ? membersByKey.get(activeBranchKey) ?? null : null;
  const branchOfGroup = (key: string) =>
    membersByKey.has(key) ? key : branchOfPerson.get(groupByKey.get(key)?.childIds[0] ?? "");

  const buses = staggerBusRows(
    siblingGroups.flatMap((group) => {
      const parents = group.parentIds.map((id) => nodeMap.get(id)!).filter((n) => n.x !== undefined);
      const children = group.childIds.map((id) => nodeMap.get(id)!).filter((n) => n.x !== undefined);
      if (parents.length === 0 || children.length === 0) return [];

      const parentMidX =
        parents.length >= 2
          ? (parents[0].x! + parents[1].x! + NODE_WIDTH) / 2
          : parents[0].x! + NODE_WIDTH / 2;
      const parentMaxY = Math.max(...parents.map((p) => p.y!)) + NODE_HEIGHT;
      // Con unión dibujada, la bajada nace justo debajo del corazón.
      const startsAtHeart =
        parents.length === 2 && parents[0].y === parents[1].y && unionPairKeys.has(group.key);
      const dropStartY = startsAtHeart ? parents[0].y! + NODE_HEIGHT / 2 + 10 : parentMaxY;

      const childY = Math.min(...children.map((c) => c.y!));
      const busY = childY > parentMaxY ? parentMaxY + (childY - parentMaxY) / 2 : parentMaxY + 30;
      const childXs = children.map((c) => c.x! + NODE_WIDTH / 2);
      return [
        {
          group,
          children,
          parentMidX,
          dropStartY,
          busY,
          busStartX: Math.min(...childXs, parentMidX),
          busEndX: Math.max(...childXs, parentMidX),
        },
      ];
    })
  );

  const availableAnchors = graph.availableMembers
    .filter((m) => {
      const node = nodeMap.get(m.id);
      if (!node) return true;
      const isSelfNode = node.id === graph.focusPerson.id || node.relationshipCategory === "self";
      return !node.isClaimed || isSelfNode || graph.isUserZero;
    })
    .map((m) => ({
      id: m.id,
      name: formatFullName(m),
    }));

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCanvasClick}
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
                {formatFullName(graph.focusPerson)}
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

      {/* Estado vacío si no hay nodos */}
      {graph.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
          <div className="p-6 rounded-3xl bg-neutral-900/90 border border-neutral-800 text-neutral-400 max-w-md shadow-2xl backdrop-blur-md pointer-events-auto">
            <h3 className="text-base font-bold text-white mb-2">
              Árbol Familiar en Espera
            </h3>
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
          {/* Horquillas genealógicas: unión (corazón) -> barra de hermanos -> hijos */}
          {buses.map(({ group, children, parentMidX, dropStartY, busY, busStartX, busEndX }) => {
            const color = group.color;
            const dimmed = highlightedIds !== null && !group.childIds.some((c) => highlightedIds.has(c));
            const labelWidth = group.label ? group.label.length * 6 + 16 : 0;
            const labelY = (dropStartY + busY) / 2;
            return (
              <g
                key={`pc-group-${group.key}`}
                opacity={dimmed ? 0.15 : 1}
                style={{ transition: "opacity 0.2s" }}
              >
                <line
                  x1={parentMidX}
                  y1={dropStartY}
                  x2={parentMidX}
                  y2={busY}
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx={parentMidX} cy={busY} r="3" fill={color} />
                <line
                  x1={busStartX}
                  y1={busY}
                  x2={busEndX}
                  y2={busY}
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                {children.map((child) => {
                  const cX = child.x! + NODE_WIDTH / 2;
                  return (
                    <g key={`stub-${child.id}`}>
                      <line
                        x1={cX}
                        y1={busY}
                        x2={cX}
                        y2={child.y!}
                        stroke={color}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle cx={cX} cy={busY} r="2.5" fill={color} />
                    </g>
                  );
                })}
                {/* Etiqueta "con X" solo cuando alguien tiene hijos con varias parejas */}
                {group.label && (
                  <g>
                    <rect
                      x={parentMidX + 8}
                      y={labelY - 10}
                      width={labelWidth}
                      height={20}
                      rx={10}
                      fill="#0a0a0a"
                      stroke={color}
                      strokeOpacity={0.6}
                    />
                    <text
                      x={parentMidX + 8 + labelWidth / 2}
                      y={labelY + 4}
                      textAnchor="middle"
                      fill={color}
                      fontSize="11"
                      fontWeight="500"
                    >
                      {group.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Uniones conyugales: línea sólida tarjeta -> corazón -> tarjeta */}
          {visibleUnionEdges.map((edge) => {
            const source = nodeMap.get(edge.sourceId)!;
            const target = nodeMap.get(edge.targetId)!;
            if (source.x === undefined || target.x === undefined) return null;

            const isLeft = source.x < target.x;
            const x1 = isLeft ? source.x + NODE_WIDTH : source.x;
            const y1 = source.y! + NODE_HEIGHT / 2;
            const x2 = isLeft ? target.x : target.x + NODE_WIDTH;
            const y2 = target.y! + NODE_HEIGHT / 2;
            const midX = (x1 + x2) / 2;

            const key = parentGroupKey([edge.sourceId, edge.targetId]);
            const group = groupByKey.get(key);
            const branchKey = group ? branchOfGroup(key) : undefined;
            const dimmed =
              highlightedIds !== null && !(highlightedIds.has(edge.sourceId) && highlightedIds.has(edge.targetId));
            const isSeparatedOrDivorced = edge.unionType === "divorced" || edge.unionType === "separated";
            const lineColor = isSeparatedOrDivorced ? "#71717a" : group?.color ?? "#f472b6";

            return (
              <g key={edge.id} opacity={dimmed ? 0.15 : 1} style={{ transition: "opacity 0.2s" }}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={lineColor}
                  strokeOpacity={isSeparatedOrDivorced ? 1 : 0.85}
                  strokeWidth="2"
                  strokeDasharray={isSeparatedOrDivorced ? "4 4" : undefined}
                />
                <g
                  className={branchKey ? "union-heart cursor-pointer" : undefined}
                  style={branchKey ? { pointerEvents: "all" } : undefined}
                  role={branchKey ? "button" : undefined}
                  aria-label={branchKey ? "Resaltar la familia de esta unión" : undefined}
                  onMouseEnter={branchKey ? () => setActiveBranchKey(branchKey) : undefined}
                  onClick={branchKey ? () => setActiveBranchKey(branchKey) : undefined}
                >
                  {isSeparatedOrDivorced ? (
                    <>
                      <circle cx={midX} cy={y1} r="10" fill="#18181b" stroke={group?.color ?? "#71717a"} strokeWidth="1.5" />
                      <text x={midX} y={y1 + 4} textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="bold">
                        ≠
                      </text>
                    </>
                  ) : (
                    <>
                      <circle cx={midX} cy={y1} r="10" fill="#0f172a" stroke={group?.color ?? "#ec4899"} strokeWidth="1.5" />
                      <path
                        d={`M ${midX - 3.5} ${y1 - 1.5} a 2 2 0 0 1 3.5 -1.5 a 2 2 0 0 1 3.5 1.5 c 0 2 -3.5 4 -3.5 4 s -3.5 -2 -3.5 -4 z`}
                        fill="#ec4899"
                      />
                    </>
                  )}
                  {activeBranchKey === key && (
                    <circle cx={midX} cy={y1} r="14" fill="none" stroke={group?.color} strokeWidth="1.5" strokeOpacity="0.6" />
                  )}
                </g>
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
          const childGroupKey = groupKeyOfChild.get(node.id);
          // Franja superior con el color de la familia de la que viene (gris si no hay padres visibles)
          const stripeColor = (childGroupKey && groupByKey.get(childGroupKey)?.color) || ROOT_STRIPE_COLOR;
          const isDimmed = highlightedIds !== null && !highlightedIds.has(node.id);
          const nodeBranchKey = branchOfPerson.get(node.id);

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
              onMouseEnter={nodeBranchKey ? () => setActiveBranchKey(nodeBranchKey) : undefined}
              onClick={
                nodeBranchKey
                  ? (e) => {
                      if ((e.target as HTMLElement).closest("button, a")) return;
                      setActiveBranchKey(nodeBranchKey);
                    }
                  : undefined
              }
              className={`tree-node-card group p-3 rounded-2xl border transition-all shadow-xl backdrop-blur-md flex flex-col justify-between cursor-default ${
                isDimmed ? "opacity-20" : ""
              } ${
                isCenter
                  ? "bg-gradient-to-br from-emerald-950/90 to-neutral-900 border-emerald-500/80 shadow-emerald-950/50 ring-2 ring-emerald-500/30"
                  : isFemale
                  ? "bg-neutral-900/90 border-neutral-800 hover:border-pink-500/50"
                  : isMale
                  ? "bg-neutral-900/90 border-neutral-800 hover:border-blue-500/50"
                  : "bg-neutral-900/90 border-neutral-800 hover:border-neutral-700"
              }`}
            >
              <span
                aria-hidden
                className="absolute top-0 left-4 right-4 h-[3px] rounded-full"
                style={{ backgroundColor: stripeColor }}
              />

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
                      <h4
                        className="text-xs font-bold text-white truncate leading-tight"
                        title={formatFullName(node)}
                      >
                        {formatFullName(node)}
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
                  {/* Botón rápido para agregar pariente anclado a este nodo (Bloqueado para fichas de otros usuarios verificados) */}
                  {!graph.isViewerGuest && (() => {
                    const isSelfNode = node.id === graph.focusPerson.id || node.relationshipCategory === "self";
                    if (node.isClaimed && !isSelfNode && !graph.isUserZero) return null;
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveAddAnchor(node);
                        }}
                        title={`Añadir pariente anclado a ${node.firstName}`}
                        className="p-1 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 rounded-lg transition"
                      >
                        <UserPlus className="w-3 h-3" />
                      </button>
                    );
                  })()}

                  {/* Solo se puede editar si es su propia ficha personal (isSelf) O si es una ficha no reclamada */}
                  {(() => {
                    if (graph.isViewerGuest) return null;
                    const isSelfNode = node.id === graph.focusPerson.id || node.relationshipCategory === "self";
                    if (!isSelfNode && node.isClaimed && !graph.isUserZero) return null;
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveEditMember(node);
                        }}
                        title={isSelfNode ? "Editar mi perfil" : "Editar ficha familiar"}
                        className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    );
                  })()}
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
        {/* Botón para añadir familiar desde el lienzo */}
        {!graph.isViewerGuest && (
          <>
            <button
              onClick={() => setActiveAddAnchor(graph.nodes.find((n) => n.id === graph.focusPerson.id) || null)}
              title="Añadir familiar al árbol genealógico"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Añadir Pariente</span>
            </button>
            <div className="w-[1px] h-5 bg-neutral-800 mx-1" />
          </>
        )}

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
          <span>Tu línea directa</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex gap-0.5">
            <span className="w-2.5 h-1 bg-sky-400 inline-block rounded" />
            <span className="w-2.5 h-1 bg-amber-400 inline-block rounded" />
            <span className="w-2.5 h-1 bg-violet-400 inline-block rounded" />
          </span>
          <span>Otras familias · pasa el cursor o toca a alguien para resaltar su familia</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-red-400 font-bold">≠</span>
          <span>Separados / Divorciados</span>
        </div>
      </div>

      {/* Modal de Edición */}
      {activeEditMember && (
        <EditMemberModal
          key={activeEditMember.id}
          member={activeEditMember}
          availableFamilyMembers={graph.nodes.map((n) => ({
            id: n.id,
            name: formatFullName(n),
          }))}
          isUserZero={graph.isUserZero}
          isSelf={activeEditMember?.id === graph.focusPerson.id}
          isOpen={Boolean(activeEditMember)}
          onClose={() => setActiveEditMember(null)}
        />
      )}

      {/* Modal de Añadir Pariente Contextual (Anclado al nodo seleccionado) */}
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

      {/* Modal de Invitación */}
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
