"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { FamilyGraphData, TreeNodeData } from "../types/graph.types";
import { InviteModal } from "@/features/invitations/components/invite-modal";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ShieldCheck,
  Clock,
  KeyRound,
  Heart,
  CheckCircle,
  HelpCircle,
  User,
  Users,
} from "lucide-react";

interface TreeCanvasProps {
  graph: FamilyGraphData;
}

export function TreeCanvas({ graph }: TreeCanvasProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeInviteMember, setActiveInviteMember] = useState<TreeNodeData | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 120;

  // Centrar el grafo en la pantalla al montar
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Centrar respecto a la generación 0 (y = 140)
      setPosition({
        x: rect.width / 2,
        y: rect.height / 3,
      });
    }
  }, []);

  // Eventos de arrastre del lienzo (Pan)
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".tree-node-card") || (e.target as HTMLElement).closest(".tree-controls")) {
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
    // Límites de zoom entre 0.4x y 2.5x
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
        y: rect.height / 3,
      });
    }
  };

  // Mapa de nodos para búsqueda rápida de coordenadas por ID
  const nodeMap = new Map<string, TreeNodeData>();
  graph.nodes.forEach((n) => nodeMap.set(n.id, n));

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className={`relative w-full h-[750px] bg-neutral-950/90 border border-neutral-800 rounded-3xl overflow-hidden select-none cursor-grab active:cursor-grabbing ${
        isDragging ? "cursor-grabbing" : ""
      }`}
    >
      {/* Patrón de fondo (grilla sutil) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "radial-gradient(#10b981 0.75px, transparent 0.75px)",
          backgroundSize: "24px 24px",
          backgroundPosition: `${position.x}px ${position.y}px`,
        }}
      />

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
            <linearGradient id="parentChildGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="unionGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Renderizado de Aristas */}
          {graph.edges.map((edge) => {
            const source = nodeMap.get(edge.sourceId);
            const target = nodeMap.get(edge.targetId);

            if (!source || !target || source.x === undefined || target.x === undefined) {
              return null;
            }

            if (edge.type === "parent-child") {
              // Curva Bézier cúbica vertical uniendo padre (abajo) con hijo (arriba)
              const x1 = source.x + NODE_WIDTH / 2;
              const y1 = source.y! + NODE_HEIGHT;
              const x2 = target.x + NODE_WIDTH / 2;
              const y2 = target.y!;
              const midY = (y1 + y2) / 2;

              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                  fill="none"
                  stroke="url(#parentChildGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              );
            }

            if (edge.type === "union") {
              // Línea horizontal entre cónyuges
              const isLeft = source.x < target.x;
              const x1 = isLeft ? source.x + NODE_WIDTH : source.x;
              const y1 = source.y! + NODE_HEIGHT / 2;
              const x2 = isLeft ? target.x : target.x + NODE_WIDTH;
              const y2 = target.y! + NODE_HEIGHT / 2;

              const midX = (x1 + x2) / 2;

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
            }

            return null;
          })}
        </svg>

        {/* Capa de Nodos HTML */}
        {graph.nodes.map((node) => {
          if (node.x === undefined || node.y === undefined) return null;

          const isSelf = node.relationshipCategory === "self";
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
              className={`tree-node-card group p-3.5 rounded-2xl border transition-all shadow-xl backdrop-blur-md flex flex-col justify-between cursor-default ${
                isSelf
                  ? "bg-gradient-to-br from-emerald-950/80 to-neutral-900 border-emerald-500/60 shadow-emerald-950/40 ring-2 ring-emerald-500/20"
                  : node.isClaimed
                  ? "bg-neutral-900/90 border-emerald-800/40 hover:border-emerald-600/60"
                  : !node.isLiving
                  ? "bg-neutral-900/60 border-neutral-800 opacity-75"
                  : "bg-neutral-900/90 border-neutral-800 hover:border-neutral-700"
              }`}
            >
              {/* Encabezado del Nodo */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div
                    className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 border ${
                      isSelf
                        ? "bg-emerald-600 text-white border-emerald-400/50"
                        : node.gender === "female"
                        ? "bg-teal-950 text-teal-300 border-teal-500/30"
                        : "bg-neutral-800 text-neutral-200 border-neutral-700"
                    }`}
                  >
                    {initials}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold text-white truncate leading-tight">
                      {node.firstName} {node.lastName}
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-medium truncate block">
                      {node.relationshipLabel}
                    </span>
                  </div>
                </div>

                {isSelf && (
                  <span className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                    Tú
                  </span>
                )}
              </div>

              {/* Estado y Quorum */}
              <div className="my-auto pt-1">
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
                    <span>Invitación enviada</span>
                  </span>
                ) : node.isReadyForInvite ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-300 bg-teal-950/60 border border-teal-800/40 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-2.5 h-2.5 text-teal-400" />
                    <span>Quórum validado ({node.validationsCount}/{node.validationsNeeded})</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-full">
                    <Clock className="w-2.5 h-2.5" />
                    <span>Esperando quórum ({node.validationsCount}/{node.validationsNeeded})</span>
                  </span>
                )}
              </div>

              {/* Botón de Acción inferior */}
              <div className="pt-1.5 border-t border-neutral-800/60 flex items-center justify-between">
                <span className="text-[10px] text-neutral-500 font-mono">
                  {node.birthDate ? node.birthDate.substring(0, 4) : "—"}
                </span>

                {node.isLiving && !node.isClaimed && (
                  <button
                    onClick={() => setActiveInviteMember(node)}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 bg-neutral-800 hover:bg-emerald-600 hover:text-white text-neutral-300 rounded-md transition"
                  >
                    <KeyRound className="w-2.5 h-2.5" />
                    <span>{node.invitationStatus === "pending" ? "Ver Enlace" : "Invitar"}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controles Flotantes de Navegación (Zoom / Center) */}
      <div className="tree-controls absolute bottom-6 right-6 flex items-center gap-1 bg-neutral-900/90 border border-neutral-800 p-1.5 rounded-2xl shadow-xl backdrop-blur-md z-10">
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
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="px-2 text-xs font-mono text-neutral-500 border-l border-neutral-800">
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* Leyenda de Convenciones */}
      <div className="tree-controls absolute bottom-6 left-6 hidden md:flex items-center gap-4 bg-neutral-900/90 border border-neutral-800 px-4 py-2 rounded-2xl shadow-xl backdrop-blur-md text-[11px] text-neutral-400 z-10">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Reclamado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-teal-400" />
          <span>Quórum 3/3</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>En Validación</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-neutral-500" />
          <span>Fallecido</span>
        </div>
      </div>

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
    </div>
  );
}
