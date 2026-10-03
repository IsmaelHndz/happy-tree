import { createClient } from "@/lib/supabase/server";
import { getFamilyGraph } from "@/features/genealogy/services/get-family-graph";
import { TreeCanvas } from "@/features/genealogy/components/tree-canvas";
import { AddMemberModal } from "@/features/genealogy/components/add-member-modal";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GitFork, Users, LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

interface TreePageProps {
  searchParams: Promise<{ focus?: string }>;
}

export default async function TreePage({ searchParams }: TreePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { focus } = await searchParams;
  const graph = await getFamilyGraph(focus);

  const availableAnchors = graph.availableMembers.map((m) => ({
    id: m.id,
    name: `${m.firstName} ${m.lastName}`,
  }));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between p-4 sm:p-8 selection:bg-emerald-500 selection:text-black">
      {/* Cabecera de Navegación */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between border-b border-neutral-800/80 pb-5 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-lg group-hover:scale-105 transition">
              HT
            </div>
            <div>
              <span className="font-bold tracking-tight text-white text-lg">Happy Tree</span>
              <span className="ml-2 text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                Árbol Interactivo
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-xl transition"
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ver Directorio</span>
          </Link>

          <AddMemberModal
            defaultAnchorId={graph.focusPerson.id}
            defaultAnchorName={`${graph.focusPerson.firstName} ${graph.focusPerson.lastName}`}
            availableAnchors={availableAnchors}
          />

          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              title="Cerrar Sesión"
              className="p-2 text-neutral-400 hover:text-red-300 hover:bg-neutral-800 rounded-xl transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>

      {/* Contenido Principal: El Lienzo del Grafo */}
      <main className="w-full max-w-7xl mx-auto flex-1 flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <GitFork className="w-5 h-5 text-emerald-400 rotate-90" />
              <span>Grafo Genealógico Familiar</span>
            </h1>
            <p className="text-xs text-neutral-400">
              Usa el mouse o pantalla táctil para arrastrar el lienzo y la rueda para hacer zoom. Nodos interconectados por generaciones.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 bg-neutral-900/80 px-3 py-1.5 rounded-xl border border-neutral-800 self-start sm:self-auto">
            <span>Nodos en pantalla: {graph.nodes.length}</span>
            <span>&bull;</span>
            <span>Vínculos: {graph.edges.length}</span>
          </div>
        </div>

        {/* El Canvas */}
        <TreeCanvas graph={graph} />
      </main>

      {/* Pie */}
      <footer className="w-full max-w-7xl mx-auto pt-6 border-t border-neutral-900 flex items-center justify-between text-xs text-neutral-500 mt-6">
        <div>Happy Tree &bull; Red Genealógica Colaborativa</div>
        <div className="font-mono text-[11px]">Visualizador Reactivo v1.0</div>
      </footer>
    </div>
  );
}
