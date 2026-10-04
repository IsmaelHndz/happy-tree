"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

export function ResetPasswordForm() {
  const [sessionStatus, setSessionStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function initSession() {
      const supabase = createClient();

      // 1. Revisar si ya existe sesión activa (por ejemplo, vía callback PKCE de cookies)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setSessionStatus("ready");
        return;
      }

      // 2. Si no hay sesión en cookies, revisar si los tokens vienen en el hash de la URL (#access_token=...&type=recovery)
      if (typeof window !== "undefined" && window.location.hash) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        if (accessToken && refreshToken) {
          try {
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (!setSessionError) {
              setSessionStatus("ready");
              // Limpiar el hash de la barra de direcciones de forma transparente
              window.history.replaceState(null, "", window.location.pathname);
              return;
            }
          } catch {
            // Manejar error silenciosamente y pasar a invalid
          }
        }
      }

      // Si no hay sesión válida ni tokens recuperables
      setSessionStatus("invalid");
    }

    initSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden. Por favor verifícalas.");
      return;
    }

    setIsPending(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        setIsPending(false);
        return;
      }

      setSuccess(true);
      setIsPending(false);

      // Redirigir a la red familiar tras 2 segundos
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
      setIsPending(false);
    }
  };

  if (sessionStatus === "checking") {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-4" />
        <p className="text-sm text-neutral-300 font-medium">
          Verificando enlace criptográfico de seguridad...
        </p>
        <p className="text-xs text-neutral-500 mt-1">
          Un momento por favor
        </p>
      </div>
    );
  }

  if (sessionStatus === "invalid") {
    return (
      <div className="text-center py-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-white mb-2">
          Enlace Inválido o Expirado
        </h2>
        <p className="text-xs text-neutral-400 mb-6 leading-relaxed max-w-sm mx-auto">
          Este enlace de recuperación no es válido, ya fue utilizado o ha expirado por seguridad.
          Solicita uno nuevo desde la pantalla de inicio de sesión.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition"
        >
          <span>Regresar a Iniciar Sesión</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center py-6 animate-in fade-in duration-300">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">
          ¡Contraseña Actualizada con Éxito!
        </h2>
        <p className="text-xs text-neutral-300 mb-6 leading-relaxed max-w-xs mx-auto">
          Tu nueva contraseña personal ha sido guardada. Te estamos redirigiendo a la red familiar...
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-emerald-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Ingresando a Happy Tree...</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      {error && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Nueva Contraseña */}
      <div>
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
          Nueva Contraseña Personal <span className="text-emerald-400">*</span>
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-10 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-neutral-500 hover:text-neutral-300 p-1"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">
          Usa al menos 8 caracteres para asegurar la protección de tu cuenta.
        </p>
      </div>

      {/* Confirmar Contraseña */}
      <div>
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
          Confirmar Nueva Contraseña <span className="text-emerald-400">*</span>
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Vuelve a escribir la contraseña"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-10 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      </div>

      {/* Botón Guardar */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending || password.length < 8}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-sm transition shadow-lg shadow-emerald-700/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Guardando Nueva Contraseña...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>Actualizar Contraseña y Entrar</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
