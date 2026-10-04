"use client";

import { useState } from "react";
import { requestPasswordResetAction } from "@/features/auth/actions";
import { Mail, AlertCircle, CheckCircle2, Loader2, KeyRound, X, Send } from "lucide-react";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export function ForgotPasswordModal({
  isOpen,
  onClose,
  defaultEmail = "",
}: ForgotPasswordModalProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email || !email.includes("@")) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    setIsPending(true);

    const result = await requestPasswordResetAction(email);

    setIsPending(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccessMessage(
        result.message ||
          `Si el correo ${email} está registrado, recibirás un enlace seguro para restablecer tu contraseña en unos momentos.`
      );
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccessMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        {/* Botón Cerrar */}
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Encabezado */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              Recuperar Contraseña
            </h2>
            <p className="text-xs text-neutral-400">
              Restablecimiento de credenciales de acceso
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMessage ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs">
              <div className="flex items-center gap-2 font-semibold text-emerald-400 mb-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Enlace de recuperación enviado</span>
              </div>
              <p className="text-neutral-300 leading-relaxed">
                {successMessage}
              </p>
              <p className="text-[11px] text-neutral-400 mt-2">
                Revisa tu bandeja de entrada y la carpeta de spam o correo no deseado.
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition"
            >
              Cerrar y Regresar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-neutral-400 leading-relaxed">
              Escribe el correo electrónico asociado a tu cuenta familiar. Te enviaremos un enlace seguro para que puedas definir una nueva contraseña.
            </p>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Correo Electrónico Registrado
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="familiar@ejemplo.com"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending || !email}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs transition shadow-md shadow-emerald-700/20 disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando enlace seguro...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Enlace de Recuperación</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
