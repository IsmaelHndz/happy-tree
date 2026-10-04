"use client";

import { useActionState } from "react";
import { claimProfileWithTokenAction } from "@/features/auth/actions";
import type { AuthActionState } from "@/features/auth/types";
import { Lock, Mail, AlertCircle, ArrowRight, Loader2, UserCheck } from "lucide-react";

interface ClaimFormProps {
  token: string;
  defaultFirstName: string;
  defaultLastName: string;
  invitedEmail?: string | null;
}

const initialState: AuthActionState = {
  error: null,
  success: false,
};

export function ClaimForm({
  token,
  defaultFirstName,
  defaultLastName,
  invitedEmail,
}: ClaimFormProps) {
  const [state, formAction, isPending] = useActionState(claimProfileWithTokenAction, initialState);

  return (
    <form action={formAction} className="space-y-4 text-left">
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Correo Electrónico para la Cuenta */}
      <div>
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
          Tu Correo Electrónico <span className="text-emerald-400">*</span>
        </label>
        <div className="relative">
          <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
          <input
            name="email"
            type="email"
            required
            defaultValue={invitedEmail || ""}
            placeholder="tu-correo@ejemplo.com"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">
          {invitedEmail
            ? "Puedes confirmar este correo o cambiarlo por el que prefieras para tu cuenta personal."
            : "Ingresa el correo con el que deseas iniciar sesión en Happy Tree."}
        </p>
      </div>

      {/* Confirmación o corrección de nombres */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">
            Nombre(s) <span className="text-emerald-400">*</span>
          </label>
          <input
            name="first_name"
            type="text"
            required
            defaultValue={defaultFirstName}
            placeholder="Tu nombre"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
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
            defaultValue={defaultLastName}
            placeholder="Tus apellidos"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      </div>

      {/* Contraseña para su nueva cuenta */}
      <div>
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
          Crea tu Contraseña Personal <span className="text-emerald-400">*</span>
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Mínimo 8 caracteres"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">
          Usarás esta contraseña junto a tu correo para ingresar a la red familiar.
        </p>
      </div>

      {/* Botón de Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-sm transition shadow-lg shadow-emerald-700/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Validando y Reclamando Perfil...</span>
            </>
          ) : (
            <>
              <UserCheck className="w-4 h-4" />
              <span>Reclamar mi Perfil Genealógico</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
