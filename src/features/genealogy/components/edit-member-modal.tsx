"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateFamilyMemberAction,
  deleteFamilyMemberAction,
  updateUnionStatusAction,
  dissolveUnionAction,
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
} from "lucide-react";
import type { Gender } from "@/types/database.types";

export interface EditableMemberData {
  id: string;
  firstName: string;
  lastName: string;
  maidenName?: string | null;
  gender: Gender;
  birthDate?: string | null;
  deathDate?: string | null;
  isLiving: boolean;
  birthPlace?: string | null;
  bio?: string | null;
  isClaimed: boolean;
  relationshipLabel?: string;
  unionInfo?: {
    id: string;
    unionType: "married" | "civil_union" | "divorced" | "separated" | "partner";
    partnerId: string;
  } | null;
}

interface EditMemberModalProps {
  member: EditableMemberData;
  isOpen: boolean;
  onClose: () => void;
}

export function EditMemberModal({ member, isOpen, onClose }: EditMemberModalProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(member.firstName);
  const [lastName, setLastName] = useState(member.lastName);
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

  const [isPending, setIsPending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("person_id", member.id);
    formData.set("first_name", firstName);
    formData.set("last_name", lastName);
    formData.set("maiden_name", maidenName);
    formData.set("gender", gender);
    formData.set("is_living", String(isLiving));
    formData.set("birth_date", birthDate);
    formData.set("death_date", isLiving ? "" : deathDate);
    formData.set("birth_place", birthPlace);
    formData.set("bio", bio);

    const result = await updateFamilyMemberAction(formData);

    setIsPending(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 700);
    }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        {/* Botón Cerrar */}
        <button
          onClick={onClose}
          disabled={isPending || isDeleting || isUpdatingUnion || isDissolvingUnion}
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
              Modifica la información biográfica e histórica de este nodo familiar.
            </p>
          </div>
        </div>

        {/* Estado Reclamado / Info */}
        {member.isClaimed && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-200 text-xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Esta ficha está reclamada por una cuenta familiar activa.
            </span>
          </div>
        )}

        {/* Alerta de Error */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
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

        {/* Formulario de Datos Personales */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre y Apellidos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Nombre(s) <span className="text-emerald-400">*</span>
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ej. Roberto"
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Apellidos <span className="text-emerald-400">*</span>
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ej. Garza Flores"
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
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
      </div>
    </div>
  );
}
