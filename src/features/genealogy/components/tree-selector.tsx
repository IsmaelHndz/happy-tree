"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Home, Users, Shield, Sparkles } from "lucide-react";
import type { AccessibleTreeOption } from "../types/graph.types";

interface TreeSelectorProps {
  currentFriendId?: string;
  isGuest: boolean;
  treeOwnerName?: string;
  currentTier?: "profile" | "basic" | "intermediate" | "advanced";
  accessibleTrees: AccessibleTreeOption[];
}

export function TreeSelector({
  currentFriendId,
  isGuest,
  treeOwnerName,
  currentTier,
  accessibleTrees,
}: TreeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tierBadge = (tier?: string) => {
    switch (tier) {
      case "profile":
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-neutral-900 text-neutral-300 border border-neutral-700">
            Solo ficha
          </span>
        );
      case "basic":
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-950/80 text-blue-400 border border-blue-800/40">
            Básico (Casa)
          </span>
        );
      case "intermediate":
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/40">
            Intermedio
          </span>
        );
      case "advanced":
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
            Avanzado
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800/90 border border-neutral-800 hover:border-neutral-700 text-xs text-neutral-200 transition shadow-sm"
      >
        {isGuest ? (
          <>
            <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-medium max-w-[140px] truncate">
              {treeOwnerName || "Árbol de Amigo"}
            </span>
            {tierBadge(currentTier)}
          </>
        ) : (
          <>
            <Home className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-medium">Mi Árbol Familiar</span>
          </>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-neutral-950 border border-neutral-800 shadow-2xl p-2 z-50 backdrop-blur-xl animate-in fade-in-50 zoom-in-95">
          <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 px-2 py-1">
            Cambiar Árbol Activo
          </div>

          {/* Mi Árbol */}
          <Link
            href="/tree"
            onClick={() => setIsOpen(false)}
            className={`flex items-center justify-between p-2 rounded-xl text-xs transition ${
              !isGuest
                ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40"
                : "text-neutral-300 hover:bg-neutral-900"
            }`}
          >
            <div className="flex items-center gap-2">
              <Home className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-medium">Mi Árbol Familiar</span>
            </div>
            {!isGuest && (
              <span className="text-[10px] text-emerald-400 font-mono">Activo</span>
            )}
          </Link>

          {/* Árboles de amigos */}
          {accessibleTrees.length > 0 && (
            <div className="mt-2 pt-2 border-t border-neutral-800/80">
              <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 px-2 py-1">
                Árboles Compartidos Contigo
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {accessibleTrees.map((tree) => {
                  const isCurrent = isGuest && currentFriendId === tree.targetUserId;
                  return (
                    <Link
                      key={tree.targetUserId}
                      href={`/tree?friendId=${tree.targetUserId}`}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs transition ${
                        isCurrent
                          ? "bg-blue-950/40 text-blue-300 border border-blue-800/40"
                          : "text-neutral-300 hover:bg-neutral-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate font-medium">
                          {tree.ownerName}
                        </span>
                      </div>
                      <div className="shrink-0 ml-2">
                        {tierBadge(tree.tier)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {accessibleTrees.length === 0 && !isGuest && (
            <div className="p-3 text-center text-[11px] text-neutral-500 italic">
              Aún no tienes árboles de amigos compartidos contigo.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
