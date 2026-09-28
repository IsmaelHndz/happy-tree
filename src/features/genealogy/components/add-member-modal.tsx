"use client";

import { useState } from "react";
import { createFamilyMemberAction } from "@/features/genealogy/actions";
import { UserPlus, X, Heart, Users, Mail, Calendar, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import type { FamilyRelationshipType } from "../types";

export function AddMemberModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLiving, setIsLiving] = useState(true);
  const [relationship, setRelationship] = useState<FamilyRelationshipType>("father");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToken, setSuccessToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("is_living", String(isLiving));
    formData.set("relationship", relationship);

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
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = successToken ? `${origin}/invite/${successToken}` : "";

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-700/20 transition hover:scale-[1.02]"
      >
        <UserPlus className="w-4 h-4" />
        <span>Agregar Familiar</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
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
                  Registrar Familiar en tu Árbol
                </h2>
                <p className="text-xs text-neutral-400">
                  Crea una ficha genealógica preliminar vinculada a tu perfil.
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
                  Se generó un enlace criptográfico único para que tu familiar reclame su ficha:
                </p>
                <div className="p-2.5 bg-black/60 border border-neutral-800 rounded-xl text-xs font-mono text-neutral-300 break-all select-all">
                  {inviteUrl}
                </div>
                <button
                  onClick={handleClose}
                  className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold transition"
                >
                  Finalizar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                {/* Parentesco */}
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Parentesco respecto a ti <span className="text-emerald-400">*</span>
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value as FamilyRelationshipType)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                  >
                    <option value="father">Padre</option>
                    <option value="mother">Madre</option>
                    <option value="son">Hijo</option>
                    <option value="daughter">Hija</option>
                    <option value="spouse">Cónyuge / Esposo(a)</option>
                    <option value="partner">Pareja</option>
                    <option value="brother">Hermano</option>
                    <option value="sister">Hermana</option>
                  </select>
                </div>

                {/* Nombres y Apellidos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Nombre(s) <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      name="first_name"
                      type="text"
                      required
                      placeholder="Ej. Roberto"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Apellidos <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      name="last_name"
                      type="text"
                      required
                      placeholder="Ej. Zapata"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                    />
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
                      <option value="male">Masculino</option>
                      <option value="female">Femenino</option>
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
