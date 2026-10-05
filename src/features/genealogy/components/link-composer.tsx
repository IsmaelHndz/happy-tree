"use client";

import { useEffect, useState } from "react";
import { linkPersonsAction, previewLinkAction } from "@/features/genealogy/actions";
import { LINK_RELATION_LABELS, type LinkPlan, type LinkRelation } from "../utils/link-planner";
import { Link2, Loader2, AlertCircle, AlertTriangle, Check } from "lucide-react";

const RELATION_GROUPS: { label: string; options: LinkRelation[] }[] = [
  { label: "Padres e hijos", options: ["parent", "child"] },
  { label: "Hermanos", options: ["sibling_both", "sibling_maternal", "sibling_paternal"] },
  { label: "Pareja", options: ["married", "partner", "divorced", "separated"] },
];

const selectClass =
  "w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition";
const labelClass = "block text-xs font-medium text-neutral-300 mb-1.5";

export interface LinkComposerProps {
  members: { id: string; name: string }[];
  /** Persona A fija (se oculta su selector) */
  fixedPersonAId?: string;
  /** Persona B fija (se oculta su selector) */
  fixedPersonBId?: string;
  /** Relaciones permitidas; si solo hay una, se oculta el selector */
  relationOptions?: LinkRelation[];
  personALabel?: string;
  personBLabel?: string;
  onLinked?: (summary: string) => void;
}

/**
 * Formulario "A es ___ de B" con vista previa validada en el servidor (planLink) y confirmación explícita.
 * Se usa en "Vincular familiares" y en la pestaña Familia del perfil.
 */
export function LinkComposer({
  members,
  fixedPersonAId,
  fixedPersonBId,
  relationOptions,
  personALabel = "Persona",
  personBLabel = "Otra persona",
  onLinked,
}: LinkComposerProps) {
  const allowed = relationOptions ?? RELATION_GROUPS.flatMap((g) => g.options);
  const [personAState, setPersonAId] = useState("");
  const [personBState, setPersonBId] = useState("");
  const [relationState, setRelation] = useState<LinkRelation | "">(allowed.length === 1 ? allowed[0] : "");
  const [isAdoption, setIsAdoption] = useState(false);
  const [removeKeys, setRemoveKeys] = useState<string[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personAId = fixedPersonAId ?? personAState;
  const personBId = fixedPersonBId ?? personBState;
  const relation = relationState;

  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const isComplete = Boolean(personAId && personBId && relation);
  const previewKey = isComplete ? `${personAId}|${relation}|${personBId}` : null;

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
  const isParentLink = relation === "parent" || relation === "child";

  const changeSelection = (fn: () => void) => {
    fn();
    setRemoveKeys(null);
    setError(null);
  };

  const handleConfirm = async () => {
    if (!relation || !plan) return;
    setIsSaving(true);
    setError(null);
    const result = await linkPersonsAction({
      personAId,
      personBId,
      relation,
      removeParentKeys: selectedRemoveKeys,
      isAdoption: isParentLink && isAdoption,
    });
    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    const summary = `${nameOf(personAId)} ${LINK_RELATION_LABELS[relation]} ${nameOf(personBId)}`;
    // Se limpia la persona elegible para poder encadenar vínculos (p. ej. varios hijos del mismo padre)
    if (!fixedPersonBId) setPersonBId("");
    else if (!fixedPersonAId) setPersonAId("");
    setRemoveKeys(null);
    setIsAdoption(false);
    setPreview(null);
    onLinked?.(summary);
  };

  const personSelect = (value: string, onChange: (v: string) => void, label: string, excludeId?: string) => (
    <div>
      <label className={labelClass}>{label}</label>
      <select value={value} onChange={(e) => changeSelection(() => onChange(e.target.value))} className={selectClass}>
        <option value="">Elige a una persona…</option>
        {sortedMembers
          .filter((m) => m.id !== excludeId)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!fixedPersonAId && personSelect(personAState, setPersonAId, personALabel, fixedPersonBId)}

      {allowed.length > 1 && (
        <div>
          <label className={labelClass}>Relación</label>
          <select
            value={relation}
            onChange={(e) => changeSelection(() => setRelation(e.target.value as LinkRelation))}
            className={selectClass}
          >
            <option value="">Elige la relación…</option>
            {RELATION_GROUPS.map((g) => {
              const options = g.options.filter((o) => allowed.includes(o));
              if (options.length === 0) return null;
              return (
                <optgroup key={g.label} label={g.label}>
                  {options.map((r) => (
                    <option key={r} value={r}>
                      {LINK_RELATION_LABELS[r]}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
      )}

      {!fixedPersonBId && personSelect(personBState, setPersonBId, personBLabel, personAId)}

      {isComplete && relation && (
        <div className="p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800 space-y-3">
          <p className="text-sm text-white">
            <strong>{nameOf(personAId)}</strong> <span className="text-emerald-400">{LINK_RELATION_LABELS[relation]}</span>{" "}
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
              {isParentLink && (
                <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={isAdoption}
                    onChange={(e) => setIsAdoption(e.target.checked)}
                    className="text-emerald-500 rounded focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
                  />
                  <span>Es por adopción</span>
                </label>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        <span>{isSaving ? "Guardando…" : "Confirmar vínculo"}</span>
      </button>
    </div>
  );
}
