"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateFamilyMemberAction,
  deleteFamilyMemberAction,
  updateUnionStatusAction,
  dissolveUnionAction,
  resetPersonClaimAction,
  unlinkParentChildAction,
  getMemberRelationsAction,
  type MemberRelations,
} from "@/features/genealogy/actions";
import { X, AlertCircle, Loader2, Trash2, CheckCircle2, ShieldCheck, RotateCcw, Plus, ChevronDown } from "lucide-react";
import type { Gender, UnionType } from "@/types/database.types";
import { formatFullName } from "../types";
import { LinkComposer } from "./link-composer";
import type { LinkRelation } from "../utils/link-planner";

export interface EditableMemberData {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
  maidenName?: string | null;
  gender: Gender;
  birthDate?: string | null;
  deathDate?: string | null;
  isLiving: boolean;
  birthPlace?: string | null;
  bio?: string | null;
  isClaimed: boolean;
  relationshipLabel?: string;
  relationshipCategory?: "parent" | "child" | "spouse" | "sibling" | "other" | "self";
  relationshipExplanation?: string;
  accountEmail?: string | null;
}

interface EditMemberModalProps {
  member: EditableMemberData;
  availableFamilyMembers?: { id: string; name: string }[];
  isUserZero?: boolean;
  isSelf?: boolean;
  /** false para fichas que no son familia (amigos): solo se editan sus datos */
  showFamilyTab?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

const UNION_LABELS: Record<UnionType, string> = {
  married: "Casados",
  partner: "Unión libre",
  civil_union: "Unión civil",
  separated: "Separados",
  divorced: "Divorciados",
};

const inputClass =
  "w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition disabled:opacity-60";
const labelClass = "block text-xs font-medium text-neutral-300 mb-1.5";

function segmentClass(active: boolean) {
  return `flex-1 px-3 py-2 rounded-lg text-xs font-medium transition border ${
    active
      ? "bg-emerald-600 border-emerald-500 text-white"
      : "bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-white"
  }`;
}

function Row({ name, detail, action }: { name: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs">
      <div className="min-w-0">
        <span className="text-white font-medium block truncate">{name}</span>
        {detail && <span className="text-[11px] text-neutral-500">{detail}</span>}
      </div>
      {action}
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function EditMemberModal({
  member,
  availableFamilyMembers = [],
  isUserZero = false,
  isSelf = false,
  showFamilyTab = true,
  isOpen,
  onClose,
}: EditMemberModalProps) {
  const router = useRouter();
  // El Usuario Cero puede corregir fichas reclamadas (soporte durante el desarrollo)
  const isReadOnly = Boolean(member.isClaimed && !isSelf && !isUserZero);
  const isAdminOverride = Boolean(member.isClaimed && !isSelf && isUserZero);
  const [tab, setTab] = useState<"datos" | "familia">("datos");

  // ---------------------------------------------------------------- Datos
  const [firstName, setFirstName] = useState(member.firstName);
  const [middleName, setMiddleName] = useState(member.middleName || "");
  const [lastName, setLastName] = useState(member.lastName);
  const [maternalLastName, setMaternalLastName] = useState(member.maternalLastName || "");
  const [maidenName, setMaidenName] = useState(member.maidenName || "");
  const [gender, setGender] = useState<Gender>(member.gender);
  const [isLiving, setIsLiving] = useState(member.isLiving);
  const [birthDate, setBirthDate] = useState(member.birthDate || "");
  const [deathDate, setDeathDate] = useState(member.deathDate || "");
  const [birthPlace, setBirthPlace] = useState(member.birthPlace || "");
  const [bio, setBio] = useState(member.bio || "");
  const [showMore, setShowMore] = useState(Boolean(member.maidenName));

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmResetClaim, setConfirmResetClaim] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Validación en vivo de fechas (antes de enviar)
  const dateProblem =
    birthDate && birthDate > today()
      ? "La fecha de nacimiento está en el futuro."
      : !isLiving && deathDate && deathDate > today()
      ? "La fecha de fallecimiento está en el futuro."
      : !isLiving && deathDate && birthDate && deathDate < birthDate
      ? "La fecha de fallecimiento es anterior al nacimiento."
      : null;

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (dateProblem) return;
    setIsSaving(true);
    setError(null);

    const formData = new FormData();
    formData.set("person_id", member.id);
    formData.set("first_name", firstName);
    formData.set("middle_name", middleName);
    formData.set("last_name", lastName);
    formData.set("maternal_last_name", maternalLastName);
    formData.set("maiden_name", maidenName);
    formData.set("gender", gender);
    formData.set("is_living", String(isLiving));
    formData.set("birth_date", birthDate);
    formData.set("death_date", isLiving ? "" : deathDate);
    formData.set("birth_place", birthPlace);
    formData.set("bio", bio);

    const result = await updateFamilyMemberAction(formData);
    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
    setTimeout(onClose, 600);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    const result = await deleteFamilyMemberAction(member.id);
    setIsDeleting(false);
    if (result.error) {
      setError(result.error);
      setConfirmDelete(false);
    } else {
      router.refresh();
      onClose();
    }
  };

  const handleResetClaim = async () => {
    setError(null);
    const res = await resetPersonClaimAction(member.id);
    setConfirmResetClaim(false);
    if (res.error) setError(res.error);
    else {
      setNotice(res.message || "Ficha liberada.");
      router.refresh();
    }
  };

  // ---------------------------------------------------------------- Familia
  const [relations, setRelations] = useState<MemberRelations | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [composer, setComposer] = useState<"parent" | "partner" | "child" | null>(null);

  const loadRelations = useCallback(
    () =>
      getMemberRelationsAction(member.id).then((res) => {
        if (res.error) setError(res.error);
        setRelations(res);
      }),
    [member.id]
  );

  useEffect(() => {
    if (isOpen && tab === "familia") loadRelations();
  }, [isOpen, tab, loadRelations]);

  const canEditFamily = Boolean(relations?.canEdit);

  const afterRelationChange = async (message: string) => {
    setNotice(message);
    setPendingRemoval(null);
    await loadRelations();
    router.refresh();
  };

  const removeParent = async (parentId: string) => {
    setBusyKey(`p:${parentId}`);
    const res = await unlinkParentChildAction({ parentId, childId: member.id });
    setBusyKey(null);
    if (res.error) setError(res.error);
    else await afterRelationChange("Progenitor quitado.");
  };

  const removeChild = async (childId: string) => {
    setBusyKey(`c:${childId}`);
    const res = await unlinkParentChildAction({ parentId: member.id, childId });
    setBusyKey(null);
    if (res.error) setError(res.error);
    else await afterRelationChange("Hijo/a desvinculado.");
  };

  const changeUnionType = async (partnerId: string, unionType: UnionType) => {
    setBusyKey(`u:${partnerId}`);
    const res = await updateUnionStatusAction({ personAId: member.id, personBId: partnerId, unionType });
    setBusyKey(null);
    if (res.error) setError(res.error);
    else await afterRelationChange(`Unión actualizada: ${UNION_LABELS[unionType]}.`);
  };

  const removePartner = async (partnerId: string) => {
    setBusyKey(`u:${partnerId}`);
    const res = await dissolveUnionAction({ personAId: member.id, personBId: partnerId });
    setBusyKey(null);
    if (res.error) setError(res.error);
    else await afterRelationChange(res.message || "Vínculo de pareja quitado.");
  };

  if (!isOpen) return null;

  const fullName = formatFullName(member);
  const initials = `${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`.toUpperCase();
  const firstNameOnly = member.firstName;
  const otherMembers = availableFamilyMembers.filter((m) => m.id !== member.id);

  const removeButton = (removalKey: string, onConfirm: () => void) =>
    pendingRemoval === removalKey ? (
      <span className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busyKey === removalKey}
          className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold flex items-center gap-1"
        >
          {busyKey === removalKey && <Loader2 className="w-3 h-3 animate-spin" />}
          Quitar
        </button>
        <button type="button" onClick={() => setPendingRemoval(null)} className="text-[11px] text-neutral-400 hover:text-white px-1">
          No
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => setPendingRemoval(removalKey)}
        className="text-[11px] text-neutral-500 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-950/30 transition shrink-0"
      >
        Quitar
      </button>
    );

  const Section = ({
    title,
    empty,
    children,
    addLabel,
    composerKey,
    composerProps,
  }: {
    title: string;
    empty: string;
    children: React.ReactNode[];
    addLabel: string;
    composerKey: "parent" | "partner" | "child";
    composerProps: { fixedPersonAId?: string; fixedPersonBId?: string; relationOptions: LinkRelation[]; personALabel?: string; personBLabel?: string };
  }) => (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">{title}</h3>
      {children.length === 0 ? <p className="text-xs text-neutral-500">{empty}</p> : children}
      {canEditFamily &&
        (composer === composerKey ? (
          <div className="p-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 space-y-2">
            <LinkComposer
              members={[...otherMembers, { id: member.id, name: fullName }]}
              {...composerProps}
              onLinked={(summary) => {
                setComposer(null);
                afterRelationChange(`Guardado: ${summary}.`);
              }}
            />
            <button type="button" onClick={() => setComposer(null)} className="w-full text-[11px] text-neutral-400 hover:text-white py-1">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposer(composerKey)}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 py-1"
          >
            <Plus className="w-3.5 h-3.5" />
            {addLabel}
          </button>
        ))}
    </div>
  );


  const parentRole = (g: Gender) => (g === "female" ? "Madre" : g === "male" ? "Padre" : "Progenitor/a");
  const childRole = (g: Gender) => (g === "female" ? "Hija" : g === "male" ? "Hijo" : "Hijo/a");
  const typeNote = (t: string) => (t === "adopted" ? " · por adopción" : t === "foster" ? " · de crianza" : t === "step" ? " · padrastro/madrastra" : "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1.5 rounded-xl hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Encabezado: quién es y qué es de ti */}
        <div className="flex items-center gap-3 mb-5 pr-8">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border ${
              member.gender === "female"
                ? "bg-pink-950 border-pink-500/40 text-pink-200"
                : member.gender === "male"
                ? "bg-blue-950 border-blue-500/40 text-blue-200"
                : "bg-neutral-800 border-neutral-700 text-neutral-300"
            }`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{fullName}</h2>
            <p className="text-xs text-neutral-400 truncate">
              {member.relationshipLabel}
              {member.relationshipExplanation && member.relationshipLabel !== "Tú" ? ` · ${member.relationshipExplanation}` : ""}
            </p>
          </div>
        </div>

        {/* Pestañas */}
        {showFamilyTab && (
        <div className="flex gap-1.5 mb-5 p-1 rounded-xl bg-neutral-950 border border-neutral-800">
          {(["datos", "familia"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setError(null);
                setNotice(null);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                tab === t ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              {t === "datos" ? "Datos" : "Familia"}
            </button>
          ))}
        </div>
        )}

        {isReadOnly && (
          <div className="mb-4 p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 flex items-center gap-2 text-xs text-neutral-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{firstNameOnly} ya tiene cuenta propia; solo esa persona puede cambiar su información.</span>
          </div>
        )}

        {isAdminOverride && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-center gap-2 text-xs text-amber-200">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {firstNameOnly} ya tiene cuenta propia. Como Usuario Cero puedes corregir su ficha; los cambios se reflejan en su cuenta.
            </span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        {tab === "datos" ? (
          <form onSubmit={handleSave} className="space-y-4">
            <fieldset disabled={isReadOnly} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>
                    Nombre <span className="text-emerald-400">*</span>
                  </label>
                  <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Segundo nombre</label>
                  <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Opcional" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>
                    Apellido paterno <span className="text-emerald-400">*</span>
                  </label>
                  <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Apellido materno</label>
                  <input
                    value={maternalLastName}
                    onChange={(e) => setMaternalLastName(e.target.value)}
                    placeholder="Opcional"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <span className={labelClass}>Sexo</span>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setGender("male")} className={segmentClass(gender === "male")}>
                    Hombre
                  </button>
                  <button type="button" onClick={() => setGender("female")} className={segmentClass(gender === "female")}>
                    Mujer
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender(gender === "other" ? "other" : "unknown")}
                    className={segmentClass(gender === "unknown" || gender === "other")}
                  >
                    {gender === "other" ? "Otro" : "No sé"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Fecha de nacimiento</label>
                  <input type="date" max={today()} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputClass} />
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
                {!isLiving && (
                  <div className="col-span-2 sm:col-span-1">
                    <label className={labelClass}>Fecha de fallecimiento</label>
                    <input
                      type="date"
                      min={birthDate || undefined}
                      max={today()}
                      value={deathDate}
                      onChange={(e) => setDeathDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
              {dateProblem && <p className="text-xs text-amber-300 -mt-2">{dateProblem}</p>}

              <div>
                <label className={labelClass}>Lugar de nacimiento</label>
                <input
                  value={birthPlace}
                  onChange={(e) => setBirthPlace(e.target.value)}
                  placeholder="Ej. Monterrey, N.L."
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Notas</label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Apodo, profesión, anécdotas…"
                  className={`${inputClass} resize-none`}
                />
              </div>

              {showMore ? (
                <div>
                  <label className={labelClass}>Otro apellido con el que se le conoce</label>
                  <input
                    value={maidenName}
                    onChange={(e) => setMaidenName(e.target.value)}
                    placeholder="Ej. apellido de casada"
                    className={inputClass}
                  />
                </div>
              ) : (
                !isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowMore(true)}
                    className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300"
                  >
                    <ChevronDown className="w-3 h-3" /> ¿Se le conoce con otro apellido?
                  </button>
                )
              )}
            </fieldset>

            {!isReadOnly && (
              <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-3">
                {!member.isClaimed && !isSelf ? (
                  confirmDelete ? (
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={handleDelete}
                        className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5"
                      >
                        {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Sí, eliminar
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-neutral-400 hover:text-white">
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-red-300 px-2 py-2 rounded-xl transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  )
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  disabled={isSaving || Boolean(dateProblem)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                  {saved ? "Guardado" : "Guardar"}
                </button>
              </div>
            )}

            {/* Solo Usuario Cero: cuenta vinculada */}
            {isUserZero && member.isClaimed && !isSelf && (
              <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                <span className="truncate">Cuenta: {member.accountEmail ?? "vinculada"}</span>
                {confirmResetClaim ? (
                  <span className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={handleResetClaim} className="text-amber-300 hover:text-amber-200 font-semibold">
                      Confirmar liberación
                    </button>
                    <button type="button" onClick={() => setConfirmResetClaim(false)} className="hover:text-white">
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmResetClaim(true)}
                    className="flex items-center gap-1 text-amber-300/80 hover:text-amber-200 shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" /> Liberar ficha
                  </button>
                )}
              </div>
            )}
          </form>
        ) : relations === null ? (
          <div className="flex items-center gap-2 text-xs text-neutral-500 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando familia…
          </div>
        ) : (
          <div className="space-y-6">
            {Section({
              title: "Padres",
              empty: "Sin padres registrados.",
              addLabel: "Vincular padre o madre ya registrado",
              composerKey: "parent",
              composerProps: { fixedPersonBId: member.id, relationOptions: ["parent"], personALabel: "¿Quién es su padre o madre?" },
              children: relations.parents.map((p) => (
                <Row
                  key={p.id}
                  name={p.name}
                  detail={`${parentRole(p.gender)}${typeNote(p.relationshipType)}`}
                  action={canEditFamily && removeButton(`p:${p.id}`, () => removeParent(p.id))}
                />
              )),
            })}

            {Section({
              title: "Parejas",
              empty: "Sin parejas registradas.",
              addLabel: "Vincular pareja ya registrada",
              composerKey: "partner",
              composerProps: {
                fixedPersonAId: member.id,
                relationOptions: ["married", "partner", "divorced", "separated"],
                personBLabel: "¿Con quién?",
              },
              children: relations.partners.map((p) => (
                <Row
                  key={p.id}
                  name={p.name}
                  action={
                    canEditFamily ? (
                      <span className="flex items-center gap-1 shrink-0">
                        <select
                          value={p.unionType}
                          disabled={busyKey === `u:${p.id}`}
                          onChange={(e) => changeUnionType(p.id, e.target.value as UnionType)}
                          className="bg-neutral-900 border border-neutral-800 rounded-lg py-1 px-1.5 text-[11px] text-neutral-200"
                        >
                          {(["married", "partner", "separated", "divorced"] as UnionType[]).map((t) => (
                            <option key={t} value={t}>
                              {UNION_LABELS[t]}
                            </option>
                          ))}
                          {p.unionType === "civil_union" && <option value="civil_union">{UNION_LABELS.civil_union}</option>}
                        </select>
                        {removeButton(`u:${p.id}`, () => removePartner(p.id))}
                      </span>
                    ) : (
                      <span className="text-[11px] text-neutral-400">{UNION_LABELS[p.unionType]}</span>
                    )
                  }
                />
              )),
            })}

            {Section({
              title: "Hijos",
              empty: "Sin hijos registrados.",
              addLabel: "Vincular hijo o hija ya registrado",
              composerKey: "child",
              composerProps: { fixedPersonAId: member.id, relationOptions: ["parent"], personBLabel: "¿Quién es su hijo o hija?" },
              children: relations.children.map((c) => (
                <Row
                  key={c.id}
                  name={c.name}
                  detail={`${childRole(c.gender)}${typeNote(c.relationshipType)}`}
                  action={canEditFamily && removeButton(`c:${c.id}`, () => removeChild(c.id))}
                />
              )),
            })}

            <p className="text-[11px] text-neutral-500 border-t border-neutral-800 pt-3">
              Quitar un vínculo no borra a ninguna persona. Para registrar a alguien nuevo usa el botón{" "}
              <strong className="text-neutral-300">+</strong> de su tarjeta en el árbol.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
