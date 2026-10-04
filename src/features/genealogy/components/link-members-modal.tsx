"use client";

import { useEffect, useState } from "react";
import { linkPersonsAction, previewLinkAction } from "@/features/genealogy/actions";
import { LINK_RELATION_LABELS, type LinkPlan, type LinkRelation } from "../utils/link-planner";
import { Link2, X, Loader2, AlertCircle, CheckCircle2, AlertTriangle, Check } from "lucide-react";

export interface LinkMembersModalProps {
  members: { id: string; name: string }[];
  defaultPersonAId?: string;
  triggerButton?: React.ReactNode;
}

const RELATION_GROUPS: { label: string; options: LinkRelation[] }[] = [
  { label: "Padres e hijos", options: ["parent", "child"] },
  { label: "Hermanos", options: ["sibling_both", "sibling_maternal", "sibling_paternal"] },
  { label: "Pareja", options: ["married", "partner", "divorced", "separated"] },
];

const selectClass =
  "w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition";
const labelClass = "block text-xs font-medium text-neutral-300 mb-1.5";

export function LinkMembersModal({ members, defaultPersonAId, triggerButton }: LinkMembersModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [personAId, setPersonAId] = useState(defaultPersonAId ?? "");
  const [relation, setRelation] = useState<LinkRelation | "">("");
  const [personBId, setPersonBId] = useState("");
  const [removeKeys, setRemoveKeys] = useState<string[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLinked, setLastLinked] = useState<string | null>(null);

  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const isComplete = Boolean(personAId && personBId && relation);
  const previewKey = isComplete ? `${personAId}|${relation}|${personBId}` : null;

  // Vista previa validada en el servidor cada vez que cambia el par o la relación
  const [preview, setPreview] = useState<{ key: string; plan?: LinkPlan; error?: string } | null>(null);
  useEffect(() => {
    if (!previewKey || !relation) return;
    let cancelled = false;
    previewLinkAction({ personAId, personBId, relation }).then((res) => {
      if (!cancelled) setPreview({ key: previewKey, ...res });
    });
    return () => {
      cancelled = true;
    };
  }, [previewKey, personAId, personBId, relation]);

  const current = preview?.key === previewKey ? preview : null;
  const plan = current?.plan;
  const isChecking = isComplete && current === null;
  const selectedRemoveKeys = removeKeys ?? plan?.replaceOptions.filter((o) => o.suggested).map((o) => o.key) ?? [];
  const canConfirm = Boolean(plan && plan.errors.length === 0 && !isSaving);

  const changeSelection = (fn: () => void) => {
    fn();
    setRemoveKeys(null);
    setError(null);
    setLastLinked(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    setRelation("");
    setPersonBId("");
    setRemoveKeys(null);
    setError(null);
    setLastLinked(null);
  };

  const handleConfirm = async () => {
    if (!relation || !plan) return;
    setIsSaving(true);
    setError(null);
    const result = await linkPersonsAction({ personAId, personBId, relation, removeParentKeys: selectedRemoveKeys });
    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    // Se conserva la persona A para encadenar vínculos (p. ej. varios hijos del mismo padre)
    setLastLinked(`${nameOf(personAId)} ${LINK_RELATION_LABELS[relation]} ${nameOf(personBId)}`);
    setPersonBId("");
    setRemoveKeys(null);
    setPreview(null);
  };

  return (
    <>
      {triggerButton ? (
        <div onClick={() => setIsOpen(true)}>{triggerButton}</div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-semibold text-xs transition"
        >
          <Link2 className="w-4 h-4 text-emerald-400" />
          <span>Vincular familiares</span>
        </button>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
          onKeyDown={(e) => e.key === "Escape" && handleClose()}
        >
          <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={handleClose}
              aria-label="Cerrar"
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Vincular familiares</h2>
                <p className="text-xs text-neutral-400">Une a dos personas ya registradas, vínculo por vínculo.</p>
              </div>
            </div>

            {lastLinked && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Guardado: {lastLinked}. Puedes elegir a otra persona para seguir vinculando.
                </span>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className={labelClass}>Persona</label>
                <select
                  value={personAId}
                  onChange={(e) => changeSelection(() => setPersonAId(e.target.value))}
                  className={selectClass}
                >
                  <option value="">Elige a una persona…</option>
                  {sortedMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Relación</label>
                <select
                  value={relation}
                  onChange={(e) => changeSelection(() => setRelation(e.target.value as LinkRelation))}
                  className={selectClass}
                >
                  <option value="">Elige la relación…</option>
                  {RELATION_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map((r) => (
                        <option key={r} value={r}>
                          {LINK_RELATION_LABELS[r]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Otra persona</label>
                <select
                  value={personBId}
                  onChange={(e) => changeSelection(() => setPersonBId(e.target.value))}
                  className={selectClass}
                >
                  <option value="">Elige a la otra persona…</option>
                  {sortedMembers
                    .filter((m) => m.id !== personAId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Vista previa validada */}
            {isComplete && relation && (
              <div className="mt-5 p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800 space-y-3">
                <p className="text-sm text-white">
                  <strong>{nameOf(personAId)}</strong>{" "}
                  <span className="text-emerald-400">{LINK_RELATION_LABELS[relation]}</span>{" "}
                  <strong>{nameOf(personBId)}</strong>
                </p>

                {isChecking && (
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Validando el vínculo…</span>
                  </div>
                )}

                {current?.error && <p className="text-xs text-red-300">{current.error}</p>}

                {plan?.errors.map((msg) => (
                  <div key={msg} className="flex items-start gap-2 text-xs text-red-300">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
                    <span>{msg}</span>
                  </div>
                ))}

                {plan && plan.errors.length === 0 && (
                  <>
                    {plan.steps.map((msg) => (
                      <div key={msg} className="flex items-start gap-2 text-xs text-neutral-200">
                        <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
                        <span>{msg}</span>
                      </div>
                    ))}
                    {plan.warnings.map((msg) => (
                      <div key={msg} className="flex items-start gap-2 text-xs text-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                        <span>{msg}</span>
                      </div>
                    ))}
                    {plan.replaceOptions.length > 0 && (
                      <div className="pt-1 space-y-1.5">
                        <span className="block text-[11px] text-neutral-400">
                          Progenitores registrados actualmente. Marca solo los que sean un error:
                        </span>
                        {plan.replaceOptions.map((o) => (
                          <label key={o.key} className="flex items-start gap-2 text-xs text-neutral-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedRemoveKeys.includes(o.key)}
                              onChange={(e) =>
                                setRemoveKeys(
                                  e.target.checked
                                    ? [...selectedRemoveKeys, o.key]
                                    : selectedRemoveKeys.filter((k) => k !== o.key)
                                )
                              }
                              className="mt-0.5 text-emerald-500 rounded focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
                            />
                            <span>{o.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="mt-5 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs transition shadow-lg shadow-emerald-700/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              <span>{isSaving ? "Guardando…" : "Confirmar vínculo"}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
