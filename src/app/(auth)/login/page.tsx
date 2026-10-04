import { createClient } from "@/lib/supabase/server";
import { checkUserZeroExists } from "@/features/auth/actions";
import { LoginForm } from "./login-form";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Shield, Sparkles, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const { exists } = await checkUserZeroExists();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 selection:bg-emerald-500 selection:text-black">
      <div className="w-full max-w-md bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-md">
        {/* Logo y Encabezado */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-lg group-hover:scale-105 transition">
              HT
            </div>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Iniciar Sesión
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Red familiar privada y árbol genealógico colaborativo
          </p>
        </div>

        {/* Banner si el Usuario Cero aún no existe */}
        {!exists && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200">
            <div className="flex items-center gap-2 font-semibold text-xs text-emerald-300 mb-1">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Sistema pendiente de inicializar</span>
            </div>
            <p className="text-xs text-neutral-300 mb-3">
              Aún no se ha registrado el fundador de este árbol genealógico.
            </p>
            <Link
              href="/setup-zero"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
            >
              <span>Configurar Usuario Cero</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Formulario de Login */}
        <LoginForm />

        {/* Nota de Acceso Cerrado / Claiming Pattern */}
        <div className="mt-8 pt-6 border-t border-neutral-800/80 text-center">
          <div className="flex items-center justify-center gap-1.5 text-neutral-400 text-xs mb-1">
            <Shield className="w-3.5 h-3.5 text-teal-400" />
            <span className="font-medium text-neutral-300">Acceso Estricto por Invitación</span>
          </div>
          <p className="text-[11px] text-neutral-500 leading-relaxed max-w-xs mx-auto">
            No es posible registrarse directamente. Si fuiste invitado por un familiar, usa el enlace único con token criptográfico enviado a tu correo.
          </p>
        </div>
      </div>
    </div>
  );
}
