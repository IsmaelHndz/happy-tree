"use client";

import { useActionState } from "react";
import { loginAction } from "@/features/auth/actions";
import type { AuthActionState } from "@/features/auth/types";
import { Mail, Lock, AlertCircle, ArrowRight, Loader2 } from "lucide-react";

const initialState: AuthActionState = {
  error: null,
  success: false,
};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4 text-left">
      {state.error && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Correo Electrónico */}
      <div>
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
          Correo Electrónico
        </label>
        <div className="relative">
          <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
          <input
            name="email"
            type="email"
            required
            placeholder="tu-correo@ejemplo.com"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      </div>

      {/* Contraseña */}
      <div>
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
          Contraseña
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
          <input
            name="password"
            type="password"
            required
            placeholder="••••••••"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
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
              <span>Verificando credenciales...</span>
            </>
          ) : (
            <>
              <span>Entrar al Árbol</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
