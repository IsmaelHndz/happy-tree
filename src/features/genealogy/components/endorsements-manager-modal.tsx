"use client";

import { useState, useTransition, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Award,
  Check,
  X,
  Loader2,
  Trash2,
  Info,
  Sparkles,
  KeyRound,
} from "lucide-react";
import type { EndorsementMemberItem } from "../actions";
import {
  getEndorsementManagementDataAction,
  endorseFamilyMemberAction,
  removeEndorsementAction,
} from "../actions";

interface EndorsementsManagerModalProps {
  isUserZero: boolean;
  buttonLabel?: string;
  buttonClassName?: string;
}

export function EndorsementsManagerModal({
  isUserZero,
  buttonLabel = "Gestionar Respaldos",
  buttonClassName,
}: EndorsementsManagerModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [members, setMembers] = useState<EndorsementMemberItem[]>([]);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const loadData = () => {
    startTransition(async () => {
      try {
        const data = await getEndorsementManagementDataAction();
        setMembers(data.members);
      } catch (err) {
        console.error("Error al cargar datos de respaldo:", err);
      }
    });
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const handleEndorse = (memberId: string, name: string) => {
    setActioningId(memberId);
    setFeedback(null);
    startTransition(async () => {
      const res = await endorseFamilyMemberAction(memberId);
      setActioningId(null);
      if (res.error) {
        setFeedback({ type: "error", text: res.error });
      } else {
        setFeedback({
          type: "success",
          text: `¡${name} respaldado/a exitosamente! Ahora cuenta con permisos completos de invitación.`,
        });
        loadData();
      }
    });
  };

  const handleRemove = (memberId: string, name: string) => {
    if (!confirm(`¿Deseas retirar el respaldo otorgado a ${name}?`)) return;
    setActioningId(memberId);
    setFeedback(null);
    startTransition(async () => {
      const res = await removeEndorsementAction(memberId);
      setActioningId(null);
      if (res.error) {
        setFeedback({ type: "error", text: res.error });
      } else {
        setFeedback({
          type: "success",
          text: `Respaldo retirado a ${name}.`,
        });
        loadData();
      }
    });
  };

  const defaultButtonClass =
    buttonClassName ||
    "inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-white px-3 py-1.5 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/50 rounded-xl transition shadow-sm font-medium";

  return (
    <>
      <button onClick={() => setIsOpen(true)} className={defaultButtonClass}>
        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Cabecera */}
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-neutral-950 font-bold shadow-md shadow-amber-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Gestión de Respaldos de Identidad</span>
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Control de confianza y permisos de invitación para cuentas familiares.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Explicación Pedagógica del Respaldo */}
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/40 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>¿Qué significa respaldar a un familiar?</span>
                </div>
                <p className="text-neutral-300 leading-relaxed">
                  Como <strong>Fundador / Usuario Cero</strong>, tu respaldo valida que una cuenta registrada pertenece verdaderamente a un miembro legítimo de tu familia.
                </p>
                <ul className="list-disc list-inside text-neutral-300 space-y-1 pl-1">
                  <li>
                    <strong>Desbloqueo de Invitaciones:</strong> El familiar adquiere permiso directo para invitar a sus propios parientes.
                  </li>
                  <li>
                    <strong>Seguridad de la Red:</strong> Evita que cuentas no confirmadas inviten a personas externas sin control.
                  </li>
                </ul>
              </div>

              {/* Mensajes de Feedback */}
              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
                    feedback.type === "success"
                      ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/40"
                      : "bg-red-950/40 text-red-300 border-red-800/40"
                  }`}
                >
                  <span>{feedback.text}</span>
                  <button onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Lista de Miembros con Cuenta Activa */}
              <div className="space-y-3">
                <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 block">
                  Cuentas Registradas / Reclamadas ({members.length})
                </span>

                {members.length === 0 ? (
                  <div className="text-center py-8 text-neutral-500 text-xs italic">
                    Aún no hay otros familiares con cuentas reclamadas activas en la red.
                  </div>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:border-neutral-700/80"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm truncate">
                            {member.name}
                          </span>
                          {member.isEndorsedByMe ? (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/40 flex items-center gap-1 shrink-0">
                              <Check className="w-2.5 h-2.5" />
                              <span>Respaldado/a</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/40 shrink-0">
                              Sin Respaldo
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                          <span className="flex items-center gap-1">
                            <KeyRound className="w-3 h-3 text-teal-400" />
                            <span>
                              Invitaciones:{" "}
                              <strong className={member.canInvite ? "text-emerald-400" : "text-amber-400"}>
                                {member.canInvite ? "Habilitadas" : "Restringidas"}
                              </strong>
                            </span>
                          </span>
                          <span>&bull;</span>
                          <span>Respaldos totales: {member.totalEndorsements}</span>
                        </div>
                      </div>

                      {/* Botón de acción */}
                      <div className="self-end sm:self-auto shrink-0">
                        {member.isEndorsedByMe ? (
                          <button
                            type="button"
                            disabled={isPending && actioningId === member.id}
                            onClick={() => handleRemove(member.id, member.name)}
                            className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-400 hover:text-red-400 hover:bg-neutral-900 border border-neutral-800 transition flex items-center gap-1.5"
                          >
                            {isPending && actioningId === member.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            <span>Retirar Respaldo</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isPending && actioningId === member.id}
                            onClick={() => handleEndorse(member.id, member.name)}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-neutral-950 transition flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                          >
                            {isPending && actioningId === member.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            )}
                            <span>Otorgar Respaldo</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pie */}
            <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
