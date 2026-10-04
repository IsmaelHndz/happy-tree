"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Compass,
  Copy,
  Check,
  Loader2,
  User,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { searchPersonsAction, type SearchPersonResult } from "../actions";
import { formatFullName } from "../types";

interface QuickMember {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
  gender: string;
  relationshipLabel?: string;
}

interface TreeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPersonId: string;
  quickMembers: QuickMember[];
}

export function TreeSearchModal({
  isOpen,
  onClose,
  currentPersonId,
  quickMembers,
}: TreeSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPersonResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tecla Escape para cerrar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Búsqueda debounced en el servidor
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await searchPersonsAction(trimmed);
        setResults(res.results || []);
      });
    }, 220);

    return () => clearTimeout(timer);
  }, [query]);

  const displayedResults = query.trim() ? results : [];

  const handleSelectPerson = (personId: string) => {
    router.push(`/tree?focus=${personId}`);
    onClose();
  };

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      {/* Backdrop click to close */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] z-10 animate-in zoom-in-95 duration-150">
        {/* Cabecera / Buscador */}
        <div className="p-4 border-b border-neutral-800 bg-neutral-900/90 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Compass className="w-5 h-5" />
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, apellido o pegar ID exacto..."
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido / Lista de Resultados */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Indicador de carga */}
          {isPending && (
            <div className="flex items-center justify-center gap-2 py-6 text-neutral-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Buscando en la red genealógica...</span>
            </div>
          )}

          {/* Resultados de Búsqueda Activa */}
          {!isPending && query.trim() && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-neutral-400 uppercase px-1">
                <span>Resultados ({displayedResults.length})</span>
                {displayedResults.length > 0 && displayedResults[0].matchType === "id" && (
                  <span className="text-emerald-400 font-normal normal-case flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Coincidencia exacta de ID
                  </span>
                )}
              </div>

              {displayedResults.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-2xl bg-neutral-950/60 border border-neutral-800/80">
                  <User className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-neutral-300">
                    No se encontró a nadie con esa búsqueda
                  </p>
                  <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                    Asegúrate de que el nombre esté bien escrito o que el ID UUID sea el correcto.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {displayedResults.map((person) => {
                    const isGenderFemale = person.gender === "female";
                    const isGenderMale = person.gender === "male";
                    const isCenter = person.id === currentPersonId;

                    return (
                      <div
                        key={person.id}
                        onClick={() => handleSelectPerson(person.id)}
                        className={`group p-3 rounded-2xl border transition flex items-center justify-between cursor-pointer ${
                          isCenter
                            ? "bg-emerald-950/30 border-emerald-500/40 hover:border-emerald-500"
                            : "bg-neutral-950/60 border-neutral-800/80 hover:bg-neutral-800/60 hover:border-neutral-700"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Avatar */}
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isGenderFemale
                                ? "bg-pink-500/10 text-pink-400 border border-pink-500/30"
                                : isGenderMale
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                                : "bg-neutral-800 text-neutral-300 border border-neutral-700"
                            }`}
                          >
                            {person.firstName[0]}
                            {person.lastName[0]}
                          </div>

                          {/* Info */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white truncate">
                                {formatFullName(person)}
                              </span>
                              {isCenter && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  Árbol Activo
                                </span>
                              )}
                              {person.isClaimed && (
                                <span title="Perfil reclamado">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                </span>
                              )}
                            </div>

                            {/* ID badge y año de nacimiento */}
                            <div className="flex items-center gap-2 mt-0.5">
                              {person.birthDate && (
                                <span className="text-[11px] text-neutral-500 font-mono">
                                  {person.birthDate.substring(0, 4)}
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={(e) => handleCopyId(e, person.id)}
                                title="Copiar ID de la persona"
                                className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-400 hover:text-emerald-400 bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded transition"
                              >
                                {copiedId === person.id ? (
                                  <>
                                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                                    <span className="text-emerald-400">Copiado</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-2.5 h-2.5" />
                                    <span>ID: {person.id.substring(0, 8)}...</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Botón Ver Árbol */}
                        <div className="shrink-0 flex items-center gap-1 text-xs font-semibold text-neutral-400 group-hover:text-emerald-400 transition">
                          <span className="hidden sm:inline">Ver árbol</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Accesos Rápidos (Círculo Cercano) cuando no hay búsqueda activa */}
          {!query.trim() && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase px-1 flex items-center justify-between">
                <span>Círculo familiar cercano (Atajos rápidos)</span>
                <span className="text-[10px] text-neutral-500 font-normal">
                  Haz click para cambiar de perspectiva
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {quickMembers.map((member) => {
                  const isCenter = member.id === currentPersonId;
                  const isGenderFemale = member.gender === "female";
                  const isGenderMale = member.gender === "male";

                  return (
                    <div
                      key={member.id}
                      onClick={() => handleSelectPerson(member.id)}
                      className={`group p-2.5 rounded-2xl border transition flex items-center justify-between cursor-pointer ${
                        isCenter
                          ? "bg-emerald-950/40 border-emerald-500/50 shadow-sm"
                          : "bg-neutral-950/60 border-neutral-800/80 hover:bg-neutral-800 hover:border-neutral-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isGenderFemale
                              ? "bg-pink-500/10 text-pink-400 border border-pink-500/30"
                              : isGenderMale
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                              : "bg-neutral-800 text-neutral-300 border border-neutral-700"
                          }`}
                        >
                          {member.firstName[0]}
                          {member.lastName[0]}
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">
                            {formatFullName(member)}
                          </p>
                          <p className="text-[10px] text-neutral-400 truncate">
                            {member.relationshipLabel || "Familiar"}
                            {isCenter ? " (Activo)" : ""}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleCopyId(e, member.id)}
                        title="Copiar ID"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-neutral-400 hover:text-white transition"
                      >
                        {copiedId === member.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Pie de página con atajo */}
        <div className="p-3 border-t border-neutral-800/80 bg-neutral-950/60 flex items-center justify-between text-[11px] text-neutral-500 px-4">
          <div className="flex items-center gap-1.5">
            <span>Puedes pegar un</span>
            <span className="font-mono text-neutral-400">ID de persona</span>
            <span>completo para acceder directamente a su árbol.</span>
          </div>

          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-[10px] text-neutral-400">
              ESC
            </kbd>
            <span>para cerrar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
