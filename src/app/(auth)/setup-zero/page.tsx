import { checkUserZeroExists } from "@/features/auth/actions";
import { SetupZeroForm } from "./setup-zero-form";
import { redirect } from "next/navigation";
import { Sparkles, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SetupZeroPage() {
  const { exists } = await checkUserZeroExists();

  if (exists) {
    redirect("/login?notice=user_zero_already_configured");
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 selection:bg-emerald-500 selection:text-black">
      <div className="w-full max-w-lg bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-md">
        {/* Cabecera */}
        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/50 px-3 py-1 rounded-full uppercase tracking-wider">
            Inicialización del Sistema
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-3">
            Crear Usuario Cero
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-2 leading-relaxed">
            Como fundador del árbol familiar, tu cuenta tendrá permisos iniciales para registrar a tus padres, hijos o pareja y emitir las primeras invitaciones.
          </p>
        </div>

        {/* Formulario Interactivo */}
        <SetupZeroForm />

        {/* Nota de Seguridad */}
        <div className="mt-8 pt-6 border-t border-neutral-800/80 flex items-center gap-3 text-neutral-500 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Esta pantalla se deshabilitará permanentemente una vez que tu cuenta sea creada.
          </span>
        </div>
      </div>
    </div>
  );
}
