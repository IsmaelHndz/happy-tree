import { ResetPasswordForm } from "./reset-password-form";
import Link from "next/link";
import { KeyRound, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 selection:bg-emerald-500 selection:text-black">
      <div className="w-full max-w-md bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-md">
        {/* Logo y Encabezado */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-lg group-hover:scale-105 transition">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Restablecer Contraseña
          </h1>
          <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
            Ingresa y confirma tu nueva contraseña personal para acceder a tu perfil familiar.
          </p>
        </div>

        {/* Formulario */}
        <ResetPasswordForm />

        {/* Pie con enlace a Login */}
        <div className="mt-8 pt-6 border-t border-neutral-800/80 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-emerald-400 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver a Iniciar Sesión</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
