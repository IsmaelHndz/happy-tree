import Link from "next/link";
import { GitFork, Shield, Users, Database, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";

export default function Home() {
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
              Fase 1: Setup & DB
            </span>
          </div>
        </div>

        <Link
          href="/test-db"
          className="flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-md shadow-emerald-700/20 transition-all hover:scale-[1.02]"
        >
          <Database className="w-3.5 h-3.5" />
          Probar Conexión Supabase
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      {/* Hero Section */}
      <main className="w-full max-w-5xl my-auto py-12 flex flex-col items-center text-center">
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
          Plataforma basada en el <strong>Claiming Pattern</strong>: los nodos genealógicos se crean como registros previos y se reclaman mediante enlaces únicos e invitaciones criptográficas validadas.
        </p>

        {/* Call to action */}
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/test-db"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition shadow-lg"
          >
            <Database className="w-4 h-4 text-emerald-600" />
            Verificar Estado de Conexión
          </Link>
          <span className="text-xs text-neutral-500 font-mono">
            Ruta: <code className="text-neutral-300">/test-db</code>
          </span>
        </div>

        {/* Feature Cards Grid */}
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
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl pt-6 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Fase 1 completada: Next.js 16 + TypeScript + Tailwind v4 + Supabase SSR</span>
        </div>
        <div className="mt-2 sm:mt-0 font-mono text-[11px]">
          happy-tree v0.1.0
        </div>
      </footer>
    </div>
  );
}
