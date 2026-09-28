import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { checkUserZeroExists } from "@/features/auth/actions";
import {
  GitFork,
  Shield,
  Users,
  Database,
  Sparkles,
  ArrowRight,
  LogOut,
  UserCheck,
  Award,
  PlusCircle,
  KeyRound,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { exists: userZeroExists, userZeroName } = await checkUserZeroExists();

  let userProfile: {
    personName: string;
    isUserZero: boolean;
    endorsementsCount: number;
    canInvite: boolean;
  } | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, is_user_zero, person_id, persons:person_id (first_name, last_name)")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      const personData = profile.persons as unknown as { first_name: string; last_name: string } | null;
      const personName = personData ? `${personData.first_name} ${personData.last_name}` : user.email || "Miembro";

      const { data: canInviteData } = await supabase.rpc("check_user_can_invite", {
        p_user_id: user.id,
      });

      const inviteResult = canInviteData as { can_invite?: boolean; endorsements?: number } | null;

      userProfile = {
        personName,
        isUserZero: profile.is_user_zero,
        endorsementsCount: inviteResult?.endorsements ?? 0,
        canInvite: inviteResult?.can_invite ?? profile.is_user_zero,
      };
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-between p-6 sm:p-12 selection:bg-emerald-500 selection:text-black">
      {/* Header / Brand */}
      <header className="w-full max-w-5xl flex items-center justify-between border-b border-neutral-800/80 pb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-lg">
            HT
          </div>
          <div>
            <span className="font-bold tracking-tight text-white text-lg">Happy Tree</span>
            <span className="ml-2 text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
              {user ? "Sesión Activa" : "Red Cerrada"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/test-db"
            className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            Diagnóstico DB
          </Link>

          {user ? (
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-neutral-800 hover:bg-red-950/40 hover:text-red-300 hover:border-red-800/40 border border-neutral-700 rounded-lg transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar Sesión</span>
              </button>
            </form>
          ) : userZeroExists ? (
            <Link
              href="/login"
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-md transition"
            >
              <span>Iniciar Sesión</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <Link
              href="/setup-zero"
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-lg shadow-md transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Fundar como Usuario Cero</span>
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-5xl my-auto py-12 flex flex-col items-center text-center">
        {user && userProfile ? (
          /* Panel para Usuario Autenticado */
          <div className="w-full max-w-2xl bg-neutral-900/80 border border-neutral-800 rounded-3xl p-8 shadow-2xl backdrop-blur-md text-left">
            <div className="flex items-start justify-between border-b border-neutral-800 pb-6 mb-6">
              <div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/50 px-2.5 py-0.5 rounded-full uppercase">
                  {userProfile.isUserZero ? "Usuario Cero / Fundador" : "Familiar Validado"}
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
                  Hola, {userProfile.personName}
                </h1>
                <p className="text-xs text-neutral-400 mt-1">
                  Tu ficha genealógica está reclamada y activa en el árbol familiar.
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-6 h-6" />
              </div>
            </div>

            {/* Estado del Modelo de Confianza */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800">
                <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span>Reconocimientos Familiares</span>
                </div>
                <div className="text-xl font-bold text-white">
                  {userProfile.isUserZero ? "Ilimitados (Fundador)" : `${userProfile.endorsementsCount} / 3`}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  {userProfile.isUserZero
                    ? "Permiso total de expansión genealógica"
                    : userProfile.canInvite
                    ? "¡Umbral de confianza alcanzado para invitar!"
                    : "Necesitas 3 endosos para enviar invitaciones"}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800">
                <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
                  <KeyRound className="w-4 h-4 text-teal-400" />
                  <span>Capacidad de Invitación</span>
                </div>
                <div className="text-xl font-bold text-white flex items-center gap-2">
                  {userProfile.canInvite ? (
                    <span className="text-emerald-400">Habilitada</span>
                  ) : (
                    <span className="text-amber-400">Restringida</span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  Tokens de alta entropía de un solo uso
                </div>
              </div>
            </div>

            {/* Aviso de Siguiente Fase */}
            <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                  <GitFork className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">
                    Fase 2 de Autenticación Completada
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Siguiente: Creación de fichas familiares previas y generación de enlaces de invitación.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Portal Público / Invitación */
          <>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 mb-8 backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Genealogía Colaborativa &bull; Red Privada por Invitación Criptográfica</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.15]">
              Construye la historia de tu familia con{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                confianza bilateral
              </span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-neutral-400 max-w-2xl leading-relaxed">
              Plataforma basada en el <strong>Claiming Pattern</strong>: los nodos genealógicos se crean como registros previos y se reclaman mediante enlaces únicos con tokens criptográficos de un solo uso.
            </p>

            {/* Call to action dinámico */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
              {!userZeroExists ? (
                <Link
                  href="/setup-zero"
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-bold text-sm hover:opacity-95 transition shadow-lg shadow-emerald-500/20"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Comenzar como Usuario Cero</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition shadow-lg"
                >
                  <KeyRound className="w-4 h-4 text-emerald-600" />
                  <span>Iniciar Sesión Familiar</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}

              <Link
                href="/test-db"
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 text-sm hover:text-white hover:border-neutral-700 transition"
              >
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Estado Supabase</span>
              </Link>
            </div>

            {/* Grid de Principios del Sistema */}
            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-5 w-full text-left">
              <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base mb-1">Modelo de Reclamación</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  El Usuario Cero inicia los nodos no reclamados. Cada familiar reclama su ficha personal validando su identidad.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-4">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base mb-1">Tokens Criptográficos</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Sin registro abierto. Tokens de 32 bytes de alta entropía para garantizar acceso estricto y seguro a cada rama familiar.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                  <GitFork className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base mb-1">Red de Confianza</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Validación bilateral de filiaciones (padres-hijos y uniones) evitando duplicados y ramas fraudulentas.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl pt-6 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500">
        <div>
          Happy Tree &bull; Red Familiar Privada
        </div>
        <div className="mt-2 sm:mt-0 font-mono text-[11px]">
          {userZeroExists ? `Árbol Fundado` : "Pendiente de Inicializar"}
        </div>
      </footer>
    </div>
  );
}
