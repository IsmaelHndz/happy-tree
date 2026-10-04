"use client";

import { useState } from "react";
import { createFamilyMemberAction } from "@/features/genealogy/actions";
import { UserPlus, X, Heart, Users, Mail, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import type { FamilyRelationshipType } from "../types";

export interface AddMemberModalProps {
  defaultAnchorId?: string;
  defaultAnchorName?: string;
  availableAnchors?: { id: string; name: string }[];
  triggerButton?: React.ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
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

  const setIsOpen = (val: boolean) => {
    setInternalIsOpen(val);
    if (!val && externalOnClose) {
      externalOnClose();
    }
  };

  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [prevDefaultAnchorId, setPrevDefaultAnchorId] = useState(defaultAnchorId);

  if (defaultAnchorId !== prevDefaultAnchorId) {
    setPrevDefaultAnchorId(defaultAnchorId);
    setSelectedAnchorId(null);
  }

  const anchorId = selectedAnchorId ?? (defaultAnchorId || "");
  const setAnchorId = (val: string) => setSelectedAnchorId(val);

  const [isLiving, setIsLiving] = useState(true);
  const [relationship, setRelationship] = useState<FamilyRelationshipType>("brother");
  const [siblingType, setSiblingType] = useState<"both" | "maternal" | "paternal">("both");
  const [createUnion, setCreateUnion] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToken, setSuccessToken] = useState<string | null>(null);

  const selectedAnchor = availableAnchors?.find((a) => a.id === (anchorId || defaultAnchorId));
  const activeAnchorName = selectedAnchor?.name || defaultAnchorName || "ti";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("is_living", String(isLiving));
    formData.set("relationship", relationship);
    if (relationship === "brother" || relationship === "sister") {
      formData.set("sibling_type", siblingType);
    }
    if (relationship === "father" || relationship === "mother") {
      formData.set("create_union", String(createUnion));
    }
    if (anchorId || defaultAnchorId) {
      formData.set("anchor_person_id", anchorId || defaultAnchorId || "");
    }

    const result = await createFamilyMemberAction(formData);

    setIsPending(false);
    if (result.error) {
      setError(result.error);
    } else {
      if (result.invitationToken) {
        setSuccessToken(result.invitationToken);
      } else {
        setIsOpen(false);
        form.reset();
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
    setSuccessToken(null);
    if (externalOnClose) {
      externalOnClose();
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = successToken ? `${origin}/invite/${successToken}` : "";

  return (
    <>
      {triggerButton ? (
        <div onClick={() => setIsOpen(true)}>{triggerButton}</div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-700/20 transition hover:scale-[1.02]"
        >
          <UserPlus className="w-4 h-4" />
          <span>Agregar Familiar</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Cerrar */}
            <button
              onClick={handleClose}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Encabezado */}
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Registrar Familiar en el Árbol
                </h2>
                <p className="text-xs text-neutral-400">
                  Crea una ficha genealógica conectada a la red familiar.
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
              /* Mensaje tras crear con token generado */
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-base text-white">¡Familiar Registrado con Éxito!</h3>
                <p className="text-xs text-neutral-400">
                  Se generó un token criptográfico único para que tu familiar reclame esta ficha personal.
                </p>

                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-left">
                  <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                    Enlace de Reclamación Exclusivo
                  </label>
                  <div className="flex items-center gap-2">
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
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleClose}
                    className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition"
                  >
                    Aceptar y Volver al Árbol
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Selector de Familiar de Referencia (Anchor) */}
                {availableAnchors && availableAnchors.length > 0 && (
                  <div className="p-3.5 bg-neutral-950/70 border border-neutral-800 rounded-2xl">
                    <label className="block text-xs font-semibold text-neutral-200 mb-1 flex items-center justify-between">
                      <span>Familiar de Referencia (Punto de anclaje)</span>
                      <span className="text-[10px] text-emerald-400 font-mono">Modo Administrador</span>
                    </label>
                    <select
                      value={anchorId || defaultAnchorId || availableAnchors[0]?.id}
                      onChange={(e) => setAnchorId(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                    >
                      {availableAnchors.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} {a.id === defaultAnchorId ? "(Seleccionado)" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-neutral-400 mt-1.5">
                      El parentesco se registrará en relación a: <strong className="text-white">{activeAnchorName}</strong>
                    </p>
                  </div>
                )}

                {/* Parentesco respecto al anchor */}
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    ¿Qué parentesco tiene con <span className="text-emerald-400 font-semibold">{activeAnchorName}</span>?
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value as FamilyRelationshipType)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                  >
                    <option value="father">Padre de {activeAnchorName}</option>
                    <option value="mother">Madre de {activeAnchorName}</option>
                    <option value="son">Hijo de {activeAnchorName}</option>
                    <option value="daughter">Hija de {activeAnchorName}</option>
                    <option value="spouse">Cónyuge / Esposo(a) de {activeAnchorName}</option>
                    <option value="partner">Pareja / Unión Libre de {activeAnchorName}</option>
                    <option value="brother">Hermano de {activeAnchorName}</option>
                    <option value="sister">Hermana de {activeAnchorName}</option>
                  </select>

                  {/* Selector contextual de Hermandad (Evita asunciones erróneas de progenitores) */}
                  {(relationship === "brother" || relationship === "sister") && (
                    <div className="mt-3 p-3.5 bg-neutral-900/80 border border-emerald-900/40 rounded-2xl space-y-2 animate-in fade-in">
                      <span className="block text-xs font-semibold text-emerald-300">
                        ¿Qué vínculo de hermandad comparten con {activeAnchorName}?
                      </span>
                      <div className="space-y-2 pt-1 text-xs">
                        <label className="flex items-start gap-2.5 cursor-pointer text-neutral-200">
                          <input
                            type="radio"
                            name="sibling_type_ui"
                            value="both"
                            checked={siblingType === "both"}
                            onChange={() => setSiblingType("both")}
                            className="mt-0.5 text-emerald-500 focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
                          />
                          <div>
                            <span className="font-medium text-white">Hermano/a completo</span>
                            <span className="block text-[11px] text-neutral-400">Comparte ambos progenitores (padre y madre biológicos).</span>
                          </div>
                        </label>
                        <label className="flex items-start gap-2.5 cursor-pointer text-neutral-200">
                          <input
                            type="radio"
                            name="sibling_type_ui"
                            value="maternal"
                            checked={siblingType === "maternal"}
                            onChange={() => setSiblingType("maternal")}
                            className="mt-0.5 text-emerald-500 focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
                          />
                          <div>
                            <span className="font-medium text-white">Medio hermano/a materno</span>
                            <span className="block text-[11px] text-neutral-400">Solo comparte la madre biológica (diferente padre).</span>
                          </div>
                        </label>
                        <label className="flex items-start gap-2.5 cursor-pointer text-neutral-200">
                          <input
                            type="radio"
                            name="sibling_type_ui"
                            value="paternal"
                            checked={siblingType === "paternal"}
                            onChange={() => setSiblingType("paternal")}
                            className="mt-0.5 text-emerald-500 focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
                          />
                          <div>
                            <span className="font-medium text-white">Medio hermano/a paterno</span>
                            <span className="block text-[11px] text-neutral-400">Solo comparte el padre biológico (diferente madre).</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Confirmación opcional de unión marital para Progenitores */}
                  {(relationship === "father" || relationship === "mother") && (
                    <div className="mt-3 p-3 bg-neutral-900/60 border border-neutral-800 rounded-2xl animate-in fade-in">
                      <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={createUnion}
                          onChange={(e) => setCreateUnion(e.target.checked)}
                          className="mt-0.5 text-emerald-500 rounded focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
                        />
                        <div>
                          <span className="font-medium text-neutral-200">
                            Vincular como pareja/cónyuge del otro progenitor existente
                          </span>
                          <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                            Si se deja desmarcado, se registrará únicamente como progenitor biológico sin forzar un matrimonio ni unión conyugal.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}
                </div>

                {/* Nombres y Apellidos Separados */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                        Primer Nombre <span className="text-emerald-400">*</span>
                      </label>
                      <input
                        name="first_name"
                        type="text"
                        required
                        placeholder="Ej. Jorge"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                        Segundo Nombre <span className="text-neutral-500">(Opcional)</span>
                      </label>
                      <input
                        name="middle_name"
                        type="text"
                        placeholder="Ej. Luis"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                        Apellido Paterno <span className="text-emerald-400">*</span>
                      </label>
                      <input
                        name="last_name"
                        type="text"
                        required
                        placeholder="Ej. Hernández"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                        Apellido Materno <span className="text-neutral-500">(Opcional)</span>
                      </label>
                      <input
                        name="maternal_last_name"
                        type="text"
                        placeholder="Ej. García"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Género y Fecha de Nacimiento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Género
                    </label>
                    <select
                      name="gender"
                      defaultValue={
                        relationship === "mother" || relationship === "daughter" || relationship === "sister"
                          ? "female"
                          : relationship === "father" || relationship === "son" || relationship === "brother"
                          ? "male"
                          : "unknown"
                      }
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="male">Masculino (♂ Azul)</option>
                      <option value="female">Femenino (♀ Rosa)</option>
                      <option value="other">Otro</option>
                      <option value="unknown">Desconocido</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Fecha de Nacimiento
                    </label>
                    <input
                      name="birth_date"
                      type="date"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

                {/* ¿Vive actualmente? */}
                <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-neutral-200">¿Vive actualmente?</div>
                    <div className="text-[11px] text-neutral-500">
                      {isLiving ? "Se podrá emitir invitación para reclamar ficha" : "Se registrará como ancestro/fallecido"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsLiving(true)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${
                        isLiving
                          ? "bg-emerald-600 text-white"
                          : "bg-neutral-800 text-neutral-400 hover:text-white"
                      }`}
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLiving(false)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${
                        !isLiving
                          ? "bg-neutral-700 text-white"
                          : "bg-neutral-800 text-neutral-400 hover:text-white"
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Invitar inmediatamente si vive */}
                {isLiving && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Correo para invitar ahora mismo <span className="text-neutral-500 font-normal">(Opcional)</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                      <input
                        name="invite_email"
                        type="email"
                        placeholder="familiar@ejemplo.com"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>
                )}

                {/* Botón de Enviar */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs transition shadow-lg shadow-emerald-700/20 disabled:opacity-60"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Guardando en el Grafo...</span>
                      </>
                    ) : (
                      <>
                        <Heart className="w-4 h-4" />
                        <span>Guardar en Árbol Familiar</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
