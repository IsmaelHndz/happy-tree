"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateFamilyMemberAction,
  deleteFamilyMemberAction,
  updateUnionStatusAction,
  dissolveUnionAction,
  resetPersonClaimAction,
  updatePersonParentsAction,
} from "@/features/genealogy/actions";
import {
  X,
  Pencil,
  Calendar,
  MapPin,
  FileText,
  AlertCircle,
  Loader2,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Heart,
  HeartCrack,
  Mail,
  RotateCcw,
  Sparkles,
  GitFork,
  Plus,
} from "lucide-react";
import type { Gender } from "@/types/database.types";

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
  relationshipExplanation?: string;
  accountEmail?: string | null;
  parentConnections?: {
    id: string;
    parentId: string;
    parentName: string;
    relationshipType: string;
  }[];
  unionInfo?: {
    id: string;
    unionType: "married" | "civil_union" | "divorced" | "separated" | "partner";
    partnerId: string;
  } | null;
}

interface EditMemberModalProps {
  member: EditableMemberData;
  availableFamilyMembers?: { id: string; name: string }[];
  viewerParents?: { id: string; name: string }[];
  isUserZero?: boolean;
  isSelf?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function EditMemberModal({
  member,
  availableFamilyMembers,
  viewerParents,
  isUserZero = false,
  isSelf = false,
  isOpen,
  onClose,
}: EditMemberModalProps) {
  const router = useRouter();
  const isClaimedOther = Boolean(member.isClaimed && !isSelf);
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

  // Estado conyugal si aplica
  const [unionType, setUnionType] = useState<"married" | "civil_union" | "divorced" | "separated" | "partner">(
    member.unionInfo?.unionType || "married"
  );
  const [isUpdatingUnion, setIsUpdatingUnion] = useState(false);
  const [isDissolvingUnion, setIsDissolvingUnion] = useState(false);
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [unionSuccessMessage, setUnionSuccessMessage] = useState<string | null>(null);

  // Estado para resetear / liberar ficha
  const [isResettingClaim, setIsResettingClaim] = useState(false);
  const [confirmResetClaim, setConfirmResetClaim] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Estado para corrección de progenitores (Padres)
  const [parentIds, setParentIds] = useState<string[]>(
    member.parentConnections?.map((p) => p.parentId) || []
  );
  const [relationshipType, setRelationshipType] = useState<"biological" | "adopted" | "foster" | "step">(
    (member.parentConnections?.[0]?.relationshipType as "biological" | "adopted" | "foster" | "step") || "biological"
  );
  const [selectedNewParentId, setSelectedNewParentId] = useState<string>("");
  const [isUpdatingParents, setIsUpdatingParents] = useState(false);
  const [parentSuccessMessage, setParentSuccessMessage] = useState<string | null>(null);

  const [isPending, setIsPending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleAssignViewerParents = async () => {
    if (!viewerParents || viewerParents.length === 0) return;
    const newIds = viewerParents.map((p) => p.id);
    setParentIds(newIds);
    setIsUpdatingParents(true);
    setError(null);
    setParentSuccessMessage(null);

    const res = await updatePersonParentsAction({
      personId: member.id,
      parentIds: newIds,
      relationshipType: "biological",
    });

    setIsUpdatingParents(false);
    if (res.error) {
      setError(res.error);
    } else {
      setParentSuccessMessage(
        `¡Vinculado/a como hermano/a exitosamente! Se asignaron a tus progenitores (${viewerParents.map((p) => p.name).join(" y ")}).`
      );
      router.refresh();
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
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

    if (result.error) {
      setIsPending(false);
      setError(result.error);
      return;
    }

    // Si los progenitores cambiaron respecto a los iniciales, guardarlos también automáticamente
    const initialParentIds = (member.parentConnections?.map((p) => p.parentId) || []).sort();
    const currentParentIds = [...parentIds].sort();
    const parentsChanged =
      initialParentIds.length !== currentParentIds.length ||
      initialParentIds.some((id, idx) => id !== currentParentIds[idx]);

    if (parentsChanged) {
      const parentsResult = await updatePersonParentsAction({
        personId: member.id,
        parentIds,
        relationshipType,
      });

      if (parentsResult.error) {
        setIsPending(false);
        setError(parentsResult.error);
        return;
      }
    }

    setIsPending(false);
    router.refresh();
    setSuccess(true);
    setTimeout(() => {
      onClose();
    }, 700);
  };

  const handleUpdateUnionStatus = async () => {
    if (!member.unionInfo) return;
    setIsUpdatingUnion(true);
    setError(null);
    setUnionSuccessMessage(null);

    const res = await updateUnionStatusAction({
      personAId: member.id,
      personBId: member.unionInfo.partnerId,
      unionType,
    });

    setIsUpdatingUnion(false);
    if (res.error) {
      setError(res.error);
    } else {
      router.refresh();
      setUnionSuccessMessage("Estado de pareja actualizado correctamente.");
      setTimeout(() => setUnionSuccessMessage(null), 3000);
    }
  };

  const handleDissolveUnion = async (deletePersonEntirely = false) => {
    if (!member.unionInfo) return;

    setIsDissolvingUnion(true);
    setError(null);
    setUnionSuccessMessage(null);

    const res = await dissolveUnionAction({
      personAId: member.id,
      personBId: member.unionInfo.partnerId,
      deletePersonId: deletePersonEntirely ? member.id : undefined,
    });

    setIsDissolvingUnion(false);
    setConfirmDissolve(false);

    if (res.error) {
      setError(res.error);
    } else {
      router.refresh();
      if (res.hasSharedChildren) {
        setUnionType("separated");
        setUnionSuccessMessage(res.message);
      } else {
        setUnionSuccessMessage(res.message || "Vínculo de pareja disuelto.");
        setTimeout(() => {
          onClose();
        }, 700);
      }
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

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
    setIsResettingClaim(true);
    setError(null);
    setResetSuccessMessage(null);

    const res = await resetPersonClaimAction(member.id);
    setIsResettingClaim(false);
    setConfirmResetClaim(false);

    if (res.error) {
      setError(res.error);
    } else {
      setResetSuccessMessage(res.message || "Ficha liberada exitosamente.");
      router.refresh();
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  const handleAddParent = () => {
    if (!selectedNewParentId || parentIds.includes(selectedNewParentId)) return;
    if (parentIds.length >= 2) {
      setError("Un familiar suele tener un máximo de 2 progenitores registrados en el árbol.");
      return;
    }
    setParentIds([...parentIds, selectedNewParentId]);
    setSelectedNewParentId("");
  };

  const handleRemoveParent = (idToRemove: string) => {
    setParentIds(parentIds.filter((id) => id !== idToRemove));
  };

  const handleSaveParents = async () => {
    setIsUpdatingParents(true);
    setError(null);
    setParentSuccessMessage(null);

    const res = await updatePersonParentsAction({
      personId: member.id,
      parentIds,
      relationshipType,
    });

    setIsUpdatingParents(false);
    if (res.error) {
      setError(res.error);
    } else {
      setParentSuccessMessage("Filiación y progenitores actualizados.");
      router.refresh();
      setTimeout(() => setParentSuccessMessage(null), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        {/* Botón Cerrar */}
        <button
          onClick={onClose}
          disabled={isPending || isDeleting || isUpdatingUnion || isDissolvingUnion || isResettingClaim || isUpdatingParents}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1.5 rounded-xl hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Cabecera */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Pencil className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Editar Ficha Genealógica</h2>
              {member.relationshipLabel && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                  {member.relationshipLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400">
              Modifica la información biográfica, histórica y filiación de este nodo familiar.
            </p>
          </div>
        </div>

        {/* Inferencia de Parentesco Inteligente */}
        {member.relationshipExplanation && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Inferencia de parentesco: <strong>{member.relationshipExplanation}</strong>
            </span>
          </div>
        )}

        {/* Banner de protección para fichas reclamadas por otro usuario */}
        {isClaimedOther && (
          <div className="mb-4 p-3.5 rounded-2xl bg-neutral-950/80 border border-neutral-800 flex items-center gap-2.5 text-xs text-neutral-300 animate-in fade-in">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Esta ficha personal está activa y verificada. Sus datos personales solo pueden ser modificados por su propio titular.</span>
          </div>
        )}

        {/* SECCIÓN ESPECIAL: CUENTA, CORREO REGISTRADO Y RESET (UNCLAIM) */}
        {isUserZero && (member.accountEmail || member.isClaimed) && !isSelf && (
          <div className="mb-4 p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-neutral-200">
                  Cuenta y Correo Registrado
                </span>
              </div>
              {member.isClaimed ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" /> Ficha Reclamada
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                  Pendiente
                </span>
              )}
            </div>

            {member.accountEmail && (
              <div className="px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 font-mono flex items-center justify-between">
                <span>{member.accountEmail}</span>
                <span className="text-[10px] text-neutral-400 font-sans">Correo utilizado</span>
              </div>
            )}

            {/* Opción de Administrador: Liberar / Resetear Ficha */}
            {member.isClaimed && (
              <div className="pt-2 border-t border-neutral-800/80">
                {confirmResetClaim ? (
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 space-y-2">
                    <p className="text-xs text-amber-200 leading-relaxed">
                      ¿Deseas liberar esta ficha? Se desvinculará el correo actual ({member.accountEmail ?? "cuenta vinculada"}). Sus datos genealógicos se mantendrán intactos, pero la persona podrá crear o vincular su cuenta con su correo correcto.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isResettingClaim}
                        onClick={handleResetClaim}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        {isResettingClaim ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Confirmar Liberación</span>
                      </button>
                      <button
                        type="button"
                        disabled={isResettingClaim}
                        onClick={() => setConfirmResetClaim(false)}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmResetClaim(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-medium transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Liberar ficha para nuevo registro / Resetear correo</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN ESPECIAL: GESTIÓN DE PROGENITORES (PADRES / FILIACIÓN) */}
        <div className="mb-6 p-4 rounded-2xl bg-neutral-950/70 border border-teal-900/40 space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
              <GitFork className="w-4 h-4 text-teal-400" />
              <span>Progenitores / Filiación (Padres)</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-950/60 border border-teal-800/50 text-teal-300">
              {parentIds.length}/2 registrados
            </span>
          </div>

          {/* Asistente Rápido: Vincular como Hermano/a compartiendo progenitores */}
          {!isClaimedOther && viewerParents && viewerParents.length > 0 && (
            <div>
              {viewerParents.every((vp) => parentIds.includes(vp.id)) ? (
                <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-800/50 flex items-center gap-2.5 text-xs text-emerald-200">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-emerald-300">Vinculado/a como hermano/a: </span>
                    <span className="text-emerald-400/80">Comparte a tus progenitores ({viewerParents.map((p) => p.name).join(" y ")}).</span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-teal-950/40 border border-teal-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-teal-200">
                        ¿Es tu hermano o hermana?
                      </p>
                      <p className="text-[11px] text-teal-300/80">
                        Asignar a tus mismos padres ({viewerParents.map((p) => p.name).join(" y ")}) para que el árbol lo reconozca como Hermano/a.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isUpdatingParents}
                    onClick={handleAssignViewerParents}
                    className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shrink-0 transition shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {isUpdatingParents ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitFork className="w-3.5 h-3.5" />}
                    <span>Vincular como Hermano/a</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Lista de Progenitores Actuales */}
          <div className="space-y-2">
            {parentIds.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">No tiene progenitores asignados en el árbol.</p>
            ) : (
              parentIds.map((pId) => {
                const parentObj = availableFamilyMembers?.find((m) => m.id === pId) ||
                                  member.parentConnections?.find((c) => c.parentId === pId);
                const pName = parentObj
                  ? "name" in parentObj
                    ? parentObj.name
                    : parentObj.parentName
                  : "Familiar registrado";
                return (
                  <div
                    key={pId}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs"
                  >
                    <span className="text-white font-medium">{pName}</span>
                    {!isClaimedOther && (
                      <button
                        type="button"
                        onClick={() => handleRemoveParent(pId)}
                        className="text-red-400 hover:text-red-300 p-1 hover:bg-red-950/30 rounded-lg transition"
                        title="Quitar como progenitor"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Selector para añadir progenitor */}
          {!isClaimedOther && parentIds.length < 2 && availableFamilyMembers && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={selectedNewParentId}
                onChange={(e) => setSelectedNewParentId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:outline-none focus:border-teal-500"
              >
                <option value="">-- Seleccionar familiar como padre/madre --</option>
                {availableFamilyMembers
                  .filter((m) => m.id !== member.id && !parentIds.includes(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!selectedNewParentId}
                onClick={handleAddParent}
                className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium transition disabled:opacity-40 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir</span>
              </button>
            </div>
          )}

          {/* Tipo de relación y guardar */}
          {!isClaimedOther && (
            <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-400">Tipo de filiación:</span>
                <select
                  value={relationshipType}
                  onChange={(e) =>
                    setRelationshipType(e.target.value as "biological" | "adopted" | "foster" | "step")
                  }
                  className="px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 text-[11px]"
                >
                  <option value="biological">Biológica</option>
                  <option value="adopted">Adoptiva</option>
                  <option value="step">Padrastro / Madrastra</option>
                  <option value="foster">Crianza / Acogida</option>
                </select>
              </div>

              <button
                type="button"
                disabled={isUpdatingParents}
                onClick={handleSaveParents}
                className="px-3 py-1.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isUpdatingParents && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Guardar Filiación</span>
              </button>
            </div>
          )}
        </div>

        {/* Alerta de Error */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Mensaje de Éxito de Reset de Ficha */}
        {resetSuccessMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-950/50 border border-amber-500/50 text-amber-200 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{resetSuccessMessage}</span>
          </div>
        )}

        {/* Mensaje de Éxito de Progenitores */}
        {parentSuccessMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-teal-950/50 border border-teal-500/50 text-teal-200 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{parentSuccessMessage}</span>
          </div>
        )}

        {/* Mensaje de Éxito de Datos Personales */}
        {success && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-950/50 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Cambios guardados exitosamente. Actualizando...</span>
          </div>
        )}

        {/* Mensaje de Éxito de Unión */}
        {unionSuccessMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-teal-950/50 border border-teal-500/50 text-teal-200 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{unionSuccessMessage}</span>
          </div>
        )}

        {/* SECCIÓN ESPECIAL: GESTIÓN DE VÍNCULO CONYUGAL (SI TIENE UNIÓN) */}
        {member.unionInfo && (
          <div className="mb-6 p-4 rounded-2xl bg-neutral-950/80 border border-pink-900/40 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-pink-300">
                <Heart className="w-4 h-4 text-pink-400" />
                <span>Gestión de Vínculo de Pareja</span>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-pink-950/60 border border-pink-800/50 text-pink-300">
                {member.unionInfo.unionType}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
              <div>
                <label className="block text-[11px] font-medium text-neutral-300 mb-1">
                  Estado de la Relación
                </label>
                <select
                  value={unionType}
                  onChange={(e) =>
                    setUnionType(e.target.value as "married" | "civil_union" | "divorced" | "separated" | "partner")
                  }
                  className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs focus:outline-none focus:border-pink-500 transition"
                >
                  <option value="married">Casados</option>
                  <option value="partner">Pareja / Unión Libre</option>
                  <option value="separated">Separados</option>
                  <option value="divorced">Divorciados</option>
                </select>
              </div>

              <button
                type="button"
                disabled={isUpdatingUnion || unionType === member.unionInfo.unionType}
                onClick={handleUpdateUnionStatus}
                className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {isUpdatingUnion && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Actualizar Estado</span>
              </button>
            </div>

            {/* Disolver / Desvincular Pareja */}
            <div className="pt-2 border-t border-neutral-900 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">
                  ¿Ya no son pareja?
                </span>

                {!confirmDissolve && (
                  <button
                    type="button"
                    onClick={() => setConfirmDissolve(true)}
                    className="text-xs text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 font-medium"
                  >
                    <HeartCrack className="w-3.5 h-3.5" />
                    <span>Disolver vínculo de pareja</span>
                  </button>
                )}
              </div>

              {confirmDissolve && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 space-y-2.5 animate-in fade-in">
                  <p className="text-xs text-red-200 font-medium">
                    ¿Cómo deseas gestionar esta separación en tu árbol genealógico?
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Si no tienen hijos en común, dejará de aparecer en tu mapa visual para mantener tu árbol cómodo y privado.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isDissolvingUnion}
                      onClick={() => handleDissolveUnion(false)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-sm"
                    >
                      {isDissolvingUnion ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <HeartCrack className="w-3 h-3" />
                      )}
                      <span>Quitar de mi árbol</span>
                    </button>

                    {!member.isClaimed && (
                      <button
                        type="button"
                        disabled={isDissolvingUnion}
                        onClick={() => handleDissolveUnion(true)}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-red-300 text-xs font-medium rounded-lg border border-red-800/40 transition"
                      >
                        Eliminar ficha completa
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setConfirmDissolve(false)}
                      className="px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isClaimedOther ? (
          <div className="p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800 space-y-3">
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider font-mono">
              Ficha Biográfica Registrada
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-neutral-500 block">Nombre Completo:</span>
                <span className="text-white font-medium">
                  {[member.firstName, member.middleName, member.lastName, member.maternalLastName]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Género:</span>
                <span className="text-white font-medium">
                  {member.gender === "male"
                    ? "Masculino"
                    : member.gender === "female"
                    ? "Femenino"
                    : "Otro"}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Estado:</span>
                <span className="text-white font-medium">
                  {member.isLiving ? "Con vida" : "Fallecido/a"}
                </span>
              </div>
              {member.birthDate && (
                <div>
                  <span className="text-neutral-500 block">Fecha de Nacimiento:</span>
                  <span className="text-white font-medium">{member.birthDate}</span>
                </div>
              )}
            </div>
            {member.bio && (
              <div className="pt-2 border-t border-neutral-800/80 text-xs">
                <span className="text-neutral-500 block">Biografía / Recuerdos:</span>
                <p className="text-neutral-300 mt-1 italic">{member.bio}</p>
              </div>
            )}
            <div className="pt-3 border-t border-neutral-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          /* Formulario de Datos Personales */
          <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombres y Apellidos Separados */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Primer Nombre <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ej. Jorge"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Segundo Nombre <span className="text-neutral-500">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  placeholder="Ej. Luis"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Apellido Paterno <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Ej. Hernández"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Apellido Materno <span className="text-neutral-500">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={maternalLastName}
                  onChange={(e) => setMaternalLastName(e.target.value)}
                  placeholder="Ej. García"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Apellido Materno / De Soltera y Género */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Apellido de Soltera / Secundario
              </label>
              <input
                type="text"
                value={maidenName}
                onChange={(e) => setMaidenName(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Género
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              >
                <option value="male">Masculino (♂ Azul)</option>
                <option value="female">Femenino (♀ Rosa)</option>
                <option value="other">Otro</option>
                <option value="unknown">Desconocido</option>
              </select>
            </div>
          </div>

          {/* Estado de Vida (Switch) */}
          <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-white block">
                ¿La persona está con vida?
              </span>
              <span className="text-[11px] text-neutral-500">
                {isLiving
                  ? "Se considera familiar activo"
                  : "Se registrará como ancestro o familiar fallecido"}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
              <button
                type="button"
                onClick={() => setIsLiving(true)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  isLiving
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Viva
              </button>
              <button
                type="button"
                onClick={() => setIsLiving(false)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  !isLiving
                    ? "bg-neutral-700 text-white shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Fallecida
              </button>
            </div>
          </div>

          {/* Fechas: Nacimiento y Defunción */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                <span>Fecha de Nacimiento</span>
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>

            {!isLiving ? (
              <div className="animate-in fade-in">
                <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Fecha de Defunción</span>
                </label>
                <input
                  type="date"
                  value={deathDate}
                  onChange={(e) => setDeathDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Lugar de Nacimiento</span>
                </label>
                <input
                  type="text"
                  value={birthPlace}
                  onChange={(e) => setBirthPlace(e.target.value)}
                  placeholder="Ej. Monterrey, N.L."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            )}
          </div>

          {!isLiving && (
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                <span>Lugar de Nacimiento</span>
              </label>
              <input
                type="text"
                value={birthPlace}
                onChange={(e) => setBirthPlace(e.target.value)}
                placeholder="Ej. Monterrey, N.L."
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>
          )}

          {/* Biografía / Notas */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-neutral-400" />
              <span>Biografía o Recuerdos Familiares</span>
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Escribe anécdotas, profesión, o información relevante de su vida..."
              className="w-full px-3.5 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none"
            />
          </div>

          {/* Botones de Acción */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-3">
            {/* Opción de Eliminar (Solo si no ha sido reclamada) */}
            {!member.isClaimed ? (
              <div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleDelete}
                      className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      <span>¿Confirmar borrado?</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs text-neutral-400 hover:text-white px-2 py-1"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 px-3 py-2 rounded-xl border border-red-900/40 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar ficha</span>
                  </button>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending || isDeleting}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isPending || isDeleting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-700/20 transition disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Guardar Cambios</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  </div>
);
}
