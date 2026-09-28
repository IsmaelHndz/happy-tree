"use client";

import { useActionState } from "react";
import { bootstrapUserZeroAction } from "@/features/auth/actions";
import type { AuthActionState } from "@/features/auth/types";
import { User, Mail, Lock, Calendar, AlertCircle, ArrowRight, Loader2 } from "lucide-react";

const initialState: AuthActionState = {
  error: null,
  success: false,
};

export function SetupZeroForm() {
  const [state, formAction, isPending] = useActionState(bootstrapUserZeroAction, initialState);

  return (
    <form action={formAction} className="space-y-4 text-left">
      {state.error && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Nombres y Apellidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">
            Nombre(s) <span className="text-emerald-400">*</span>
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
            <input
              name="first_name"
              type="text"
              required
              placeholder="Ej. Carlos"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">
            Apellidos <span className="text-emerald-400">*</span>
          </label>
          <input
            name="last_name"
            type="text"
            required
            placeholder="Ej. Hernández López"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      </div>

      {/* Correo Electrónico */}
      <div>
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
          Correo Electrónico <span className="text-emerald-400">*</span>
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
          Contraseña Segura <span className="text-emerald-400">*</span>
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
      </div>

      {/* Género y Fecha de Nacimiento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">
            Género
          </label>
          <select
            name="gender"
            defaultValue="unknown"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
          >
            <option value="male">Masculino</option>
            <option value="female">Femenino</option>
            <option value="other">Otro</option>
            <option value="unknown">Prefiero no especificar</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">
            Fecha de Nacimiento
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
            <input
              name="birth_date"
              type="date"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
            />
          </div>
        </div>
      </div>

      {/* Botón de Submit */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-sm transition shadow-lg shadow-emerald-700/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Inicializando tu Árbol...</span>
            </>
          ) : (
            <>
              <span>Registrar y Fundar Árbol</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
