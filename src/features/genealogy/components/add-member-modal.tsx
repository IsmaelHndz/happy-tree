"use client";

import { useEffect, useState } from "react";
import {
  createFamilyMemberAction,
  getAnchorContextAction,
  type AnchorContext,
} from "@/features/genealogy/actions";
import { UserPlus, X, Users, Mail, Loader2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { Gender } from "@/types/database.types";

export interface AddMemberModalProps {
  defaultAnchorId?: string;
  defaultAnchorName?: string;
  availableAnchors?: { id: string; name: string }[];
  triggerButton?: React.ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
}

type RelationChoice = "father" | "mother" | "brother" | "sister" | "son" | "daughter" | "partner";

const RELATION_OPTIONS: { value: RelationChoice; label: string; gender: Gender | null }[] = [
  { value: "father", label: "Padre", gender: "male" },
  { value: "mother", label: "Madre", gender: "female" },
  { value: "brother", label: "Hermano", gender: "male" },
  { value: "sister", label: "Hermana", gender: "female" },
  { value: "son", label: "Hijo", gender: "male" },
  { value: "daughter", label: "Hija", gender: "female" },
  { value: "partner", label: "Pareja", gender: null },
];

const inputClass =
  "w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition";
const labelClass = "block text-xs font-medium text-neutral-300 mb-1.5";

function segmentClass(active: boolean) {
  return `flex-1 px-3 py-2 rounded-lg text-xs font-medium transition border ${
    active
      ? "bg-emerald-600 border-emerald-500 text-white"
      : "bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-white"
  }`;
}

function Hint({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={`flex items-start gap-2 p-3 rounded-xl text-[11px] leading-relaxed border ${
        tone === "warn"
          ? "bg-amber-950/30 border-amber-800/50 text-amber-200"
          : "bg-neutral-950/60 border-neutral-800 text-neutral-400"
      }`}
    >
      <Info className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tone === "warn" ? "text-amber-400" : "text-emerald-400"}`} />
      <div>{children}</div>
    </div>
  );
}

export function AddMemberModal({
  defaultAnchorId,
  defaultAnchorName,
  availableAnchors,
  triggerButton,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
}: AddMemberModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;

  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const anchorId = selectedAnchorId ?? defaultAnchorId ?? availableAnchors?.[0]?.id ?? "";
  const anchorName = (
    availableAnchors?.find((a) => a.id === anchorId)?.name ||
    (anchorId === defaultAnchorId ? defaultAnchorName : undefined) ||
    "esta persona"
  ).replace(/^Tú \((.*)\)$/, "$1");
  const anchorFirstName = anchorName.split(" ")[0];

  const [relation, setRelation] = useState<RelationChoice | null>(null);
  const [siblingType, setSiblingType] = useState<"both" | "maternal" | "paternal">("both");
  const [createUnion, setCreateUnion] = useState(false);
  // "with:<id>" = hijo/a del ancla y <id> · "solo" = solo del ancla · "step:<id>" = solo de la pareja <id> (hijastro/a)
  const [childOfChoice, setChildOfChoice] = useState<string | null>(null);
  const [partnerKind, setPartnerKind] = useState<"spouse" | "partner">("spouse");
  const [partnerGender, setPartnerGender] = useState<Gender>("unknown");
  const [isLiving, setIsLiving] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToken, setSuccessToken] = useState<string | null>(null);

  // Contexto del familiar ancla (sus padres y parejas) para hacer preguntas con nombres reales
  const [anchorContext, setAnchorContext] = useState<{ anchorId: string; data: AnchorContext } | null>(null);
  useEffect(() => {
    if (!isOpen || !anchorId) return;
    let cancelled = false;
    getAnchorContextAction(anchorId).then((data) => {
      if (!cancelled) setAnchorContext({ anchorId, data });
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, anchorId]);

  const context = anchorContext?.anchorId === anchorId ? anchorContext.data : null;
  const isContextLoading = Boolean(anchorId) && context === null;
  const parents = context?.parents ?? [];
  const mother = parents.find((p) => p.gender === "female");
  const father = parents.find((p) => p.gender === "male");
  const coParents = context?.coParents ?? [];
  const childOf = childOfChoice ?? (context?.defaultCoParentId ? `with:${context.defaultCoParentId}` : "solo");

  const resetForm = () => {
    setSelectedAnchorId(null);
    setRelation(null);
    setSiblingType("both");
    setCreateUnion(false);
    setChildOfChoice(null);
    setPartnerKind("spouse");
    setPartnerGender("unknown");
    setIsLiving(true);
    setError(null);
    setSuccessToken(null);
  };

  const handleClose = () => {
    resetForm();
    setInternalIsOpen(false);
    externalOnClose?.();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!relation) {
      setError("Elige qué parentesco tiene con " + anchorFirstName + ".");
      return;
    }

    setIsPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const option = RELATION_OPTIONS.find((o) => o.value === relation)!;
    formData.set("relationship", relation === "partner" ? partnerKind : relation);
    formData.set("gender", option.gender ?? partnerGender);
    formData.set("is_living", String(isLiving));
    if (anchorId) formData.set("anchor_person_id", anchorId);
    if (relation === "son" || relation === "daughter") {
      const [mode, otherId] = childOf.split(":");
      if (mode === "step") {
        // Hijo/a solo de la pareja: se registra respecto a ella, sin vincularlo al ancla
        formData.set("anchor_person_id", otherId);
        formData.set("co_parent_id", "none");
      } else {
        formData.set("co_parent_id", mode === "with" ? otherId : "none");
      }
    }
    if (relation === "brother" || relation === "sister") formData.set("sibling_type", siblingType);
    if (relation === "father" || relation === "mother") formData.set("create_union", String(createUnion));

    const result = await createFamilyMemberAction(formData);
    setIsPending(false);

    if (result.error) {
      setError(result.error);
    } else if (result.invitationToken) {
      setSuccessToken(result.invitationToken);
    } else {
      handleClose();
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = successToken ? `${origin}/invite/${successToken}` : "";

  const renderRelationDetails = () => {
    if (!relation) return null;
    if (isContextLoading) {
      return (
        <div className="flex items-center gap-2 text-[11px] text-neutral-500 px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Consultando la familia de {anchorFirstName}…</span>
        </div>
      );
    }

    if (relation === "brother" || relation === "sister") {
      if (parents.length === 0) {
        return (
          <Hint>
            {anchorFirstName} aún no tiene padres registrados. Se creará un padre/madre provisional que
            conecta a ambos hermanos; después puedes editarlo con su nombre real.
          </Hint>
        );
      }
      if (parents.length === 1) {
        return <Hint>Se registrará como hijo/a de {parents[0].name}.</Hint>;
      }
      const options: { value: "both" | "maternal" | "paternal"; label: string; detail: string }[] = [
        { value: "both", label: "Mismos padres", detail: parents.map((p) => p.name.split(" ")[0]).join(" y ") },
        { value: "maternal", label: "Solo la misma mamá", detail: mother ? mother.name : "Medio hermano/a materno" },
        { value: "paternal", label: "Solo el mismo papá", detail: father ? father.name : "Medio hermano/a paterno" },
      ];
      return (
        <div className="space-y-1.5">
          <span className={labelClass}>¿Comparten los mismos padres?</span>
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                siblingType === o.value ? "border-emerald-600 bg-emerald-950/30" : "border-neutral-800 hover:border-neutral-700"
              }`}
            >
              <input
                type="radio"
                name="sibling_type_ui"
                checked={siblingType === o.value}
                onChange={() => setSiblingType(o.value)}
                className="text-emerald-500 focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
              />
              <span className="font-medium text-white">{o.label}</span>
              <span className="text-neutral-500 truncate">· {o.detail}</span>
            </label>
          ))}
        </div>
      );
    }

    if (relation === "father" || relation === "mother") {
      const sameRole = parents.find((p) => p.gender === (relation === "father" ? "male" : "female"));
      const otherParent = parents.find((p) => p.id !== sameRole?.id);
      return (
        <div className="space-y-2">
          {sameRole && (
            <Hint tone="warn">
              {anchorFirstName} ya tiene registrado a <strong>{sameRole.name}</strong> como{" "}
              {relation === "father" ? "padre" : "madre"}. Si es otra persona (por ejemplo, un padrastro o madrastra),
              regístrala como <strong>pareja</strong> de {otherParent ? otherParent.name.split(" ")[0] : "su otro progenitor"}.
            </Hint>
          )}
          {otherParent && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-neutral-800 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={createUnion}
                onChange={(e) => setCreateUnion(e.target.checked)}
                className="mt-0.5 text-emerald-500 rounded focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
              />
              <span className="text-neutral-200">
                Fue o es pareja de <strong className="text-white">{otherParent.name}</strong>
                <span className="block text-[11px] text-neutral-500 mt-0.5">
                  Déjalo sin marcar si solo comparten hijos.
                </span>
              </span>
            </label>
          )}
        </div>
      );
    }

    if (relation === "son" || relation === "daughter") {
      const first = (name: string) => name.split(" ")[0];
      const options: { value: string; label: string; detail?: string }[] = [
        ...coParents.map((p) => ({
          value: `with:${p.id}`,
          label: `De ${anchorFirstName} y ${first(p.name)}`,
          detail: p.note,
        })),
        {
          value: "solo",
          label: `Solo de ${anchorFirstName}`,
          detail: coParents.length > 0 ? "con otra persona o aún no registrada" : "el otro padre/madre aún no está registrado",
        },
        ...coParents
          .filter((p) => p.kind === "partner" || p.kind === "ex")
          .map((p) => ({
            value: `step:${p.id}`,
            label: `Solo de ${first(p.name)}`,
            detail: `hijastro/a de ${anchorFirstName}`,
          })),
      ];
      return (
        <div className="space-y-1.5">
          <span className={labelClass}>¿De quién es hijo/a?</span>
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                childOf === o.value ? "border-emerald-600 bg-emerald-950/30" : "border-neutral-800 hover:border-neutral-700"
              }`}
            >
              <input
                type="radio"
                name="child_of_ui"
                checked={childOf === o.value}
                onChange={() => setChildOfChoice(o.value)}
                className="text-emerald-500 focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
              />
              <span className="font-medium text-white">{o.label}</span>
              {o.detail && <span className="text-neutral-500 truncate">· {o.detail}</span>}
            </label>
          ))}
          <p className="text-[11px] text-neutral-500 px-1 pt-1">
            ¿Ya está registrado en el árbol? Usa <strong className="text-neutral-300">Vincular familiares</strong> en lugar
            de crearlo de nuevo.
          </p>
        </div>
      );
    }

    // Pareja
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className={labelClass}>Tipo de unión</span>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setPartnerKind("spouse")} className={segmentClass(partnerKind === "spouse")}>
              Casados
            </button>
            <button type="button" onClick={() => setPartnerKind("partner")} className={segmentClass(partnerKind === "partner")}>
              Unión libre
            </button>
          </div>
        </div>
        <div>
          <span className={labelClass}>Es</span>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setPartnerGender("male")} className={segmentClass(partnerGender === "male")}>
              Hombre
            </button>
            <button type="button" onClick={() => setPartnerGender("female")} className={segmentClass(partnerGender === "female")}>
              Mujer
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {triggerButton ? (
        <div onClick={() => setInternalIsOpen(true)}>{triggerButton}</div>
      ) : (
        <button
          onClick={() => setInternalIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-700/20 transition hover:scale-[1.02]"
        >
          <UserPlus className="w-4 h-4" />
          <span>Agregar Familiar</span>
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
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Agregar familiar</h2>
                <p className="text-xs text-neutral-400">
                  Familiar de <span className="text-emerald-400 font-semibold">{anchorName}</span>
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successToken ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-base text-white">¡Familiar registrado!</h3>
                <p className="text-xs text-neutral-400">
                  Comparte este enlace para que tu familiar reclame su ficha.
                </p>

                <div className="flex items-center gap-2 p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <input
                    type="text"
                    readOnly
                    value={inviteUrl}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-mono select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(inviteUrl)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap transition"
                  >
                    Copiar
                  </button>
                </div>

                <button
                  onClick={handleClose}
                  className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition"
                >
                  Volver al árbol
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* 1. Respecto a quién */}
                {availableAnchors && availableAnchors.length > 1 && (
                  <div>
                    <label className={labelClass}>Registrar respecto a</label>
                    <select
                      value={anchorId}
                      onChange={(e) => {
                        setSelectedAnchorId(e.target.value);
                        setChildOfChoice(null);
                      }}
                      className={inputClass}
                    >
                      {availableAnchors.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 2. Parentesco */}
                <div className="space-y-3">
                  <span className={labelClass}>
                    ¿Qué es de <span className="text-emerald-400 font-semibold">{anchorFirstName}</span>?
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {RELATION_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          setRelation(o.value);
                          setError(null);
                        }}
                        className={`${segmentClass(relation === o.value)} ${o.value === "partner" ? "col-span-2" : ""}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {renderRelationDetails()}
                </div>

                {/* 3. Nombre completo */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>
                      Nombre <span className="text-emerald-400">*</span>
                    </label>
                    <input name="first_name" type="text" required placeholder="Ej. Jorge" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Segundo nombre</label>
                    <input name="middle_name" type="text" placeholder="Opcional" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Apellido paterno <span className="text-emerald-400">*</span>
                    </label>
                    <input name="last_name" type="text" required placeholder="Ej. Hernández" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Apellido materno</label>
                    <input name="maternal_last_name" type="text" placeholder="Opcional" className={inputClass} />
                  </div>
                </div>

                {/* 4. Nacimiento y estado vital */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Fecha de nacimiento</label>
                    <input name="birth_date" type="date" className={inputClass} />
                  </div>
                  <div>
                    <span className={labelClass}>¿Vive?</span>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setIsLiving(true)} className={segmentClass(isLiving)}>
                        Sí
                      </button>
                      <button type="button" onClick={() => setIsLiving(false)} className={segmentClass(!isLiving)}>
                        No
                      </button>
                    </div>
                  </div>
                </div>

                {/* 5. Invitación opcional */}
                {isLiving && (
                  <div>
                    <label className={labelClass}>
                      Invitar por correo <span className="text-neutral-500 font-normal">(opcional)</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                      <input
                        name="invite_email"
                        type="email"
                        placeholder="familiar@ejemplo.com"
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending || !relation}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs transition shadow-lg shadow-emerald-700/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Guardando…</span>
                    </>
                  ) : relation ? (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>
                        Guardar {RELATION_OPTIONS.find((o) => o.value === relation)!.label.toLowerCase()} de{" "}
                        {(relation === "son" || relation === "daughter") && childOf.startsWith("step:")
                          ? coParents.find((p) => `step:${p.id}` === childOf)?.name.split(" ")[0] ?? anchorFirstName
                          : anchorFirstName}
                      </span>
                    </>
                  ) : (
                    <span>Elige el parentesco para continuar</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
