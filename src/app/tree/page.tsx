import { createClient } from "@/lib/supabase/server";
import { getFamilyGraph } from "@/features/genealogy/services/get-family-graph";
import { TreeCanvas } from "@/features/genealogy/components/tree-canvas";
import { AddMemberModal } from "@/features/genealogy/components/add-member-modal";
import { LinkMembersModal } from "@/features/genealogy/components/link-members-modal";
import { TreeSelector } from "@/features/genealogy/components/tree-selector";
import { FriendsManagerModal } from "@/features/genealogy/components/friends-manager-modal";
import { formatFullName } from "@/features/genealogy/types";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GitFork, Users, LogOut, Shield } from "lucide-react";

export const dynamic = "force-dynamic";

interface TreePageProps {
  searchParams: Promise<{ focus?: string; friendId?: string }>;
}

export default async function TreePage({ searchParams }: TreePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Validar que el usuario tenga un perfil registrado y activo en la red genealógica
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_user_zero, person_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (!profile.person_id && !profile.is_user_zero)) {
    redirect("/?unauthorized=true");
  }

  const { focus, friendId } = await searchParams;
  const graph = await getFamilyGraph(focus, friendId);

  const availableAnchors = graph.availableMembers.map((m) => ({
    id: m.id,
    name: formatFullName(m),
  }));

  const tierDescription =
    graph.viewerTier === "basic"
      ? "Familia de Casa (Básico)"
      : graph.viewerTier === "intermediate"
      ? "Familia Extendida (Intermedio)"
      : "Árbol Completo (Avanzado)";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between p-4 sm:p-8 selection:bg-emerald-500 selection:text-black">
      {/* Cabecera de Navegación */}
      <header className="w-full max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-800/80 pb-5 mb-6 gap-4">
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

          {/* Selector de Árbol (Mi Árbol vs Árboles de Amigos) */}
          <TreeSelector
            currentFriendId={friendId}
            isGuest={Boolean(graph.isViewerGuest)}
            treeOwnerName={graph.treeOwnerName}
            currentTier={graph.viewerTier}
            accessibleTrees={graph.accessibleTrees || []}
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Gestor de Amigos y Solicitudes */}
          <FriendsManagerModal />

          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-xl transition"
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>Directorio</span>
          </Link>

          {/* Solo se permite añadir familiares si estamos en nuestro propio árbol */}
          {!graph.isViewerGuest && (
            <>
              <LinkMembersModal members={availableAnchors} />
              <AddMemberModal
                defaultAnchorId={graph.focusPerson.id}
                defaultAnchorName={formatFullName(graph.focusPerson)}
                availableAnchors={availableAnchors}
              />
            </>
          )}

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
        {/* Banner Informativo de Modo Visitante */}
        {graph.isViewerGuest && (
          <div className="mb-4 p-4 rounded-2xl bg-blue-950/40 border border-blue-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-blue-200">
              <Shield className="w-4 h-4 text-blue-400 shrink-0" />
              <span>
                Estás en <strong>Modo Visitante (Solo Lectura)</strong> en el árbol de{" "}
                <strong className="text-white">{graph.treeOwnerName || "un amigo"}</strong>.
                Nivel concedido:{" "}
                <span className="font-semibold text-blue-300">{tierDescription}</span>.
              </span>
            </div>
            <Link
              href="/tree"
              className="px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition shrink-0 text-center font-medium"
            >
              Volver a mi árbol
            </Link>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <GitFork className="w-5 h-5 text-emerald-400 rotate-90" />
              <span>
                {graph.isViewerGuest
                  ? `Árbol Genealógico de ${graph.treeOwnerName || "Amigo"}`
                  : "Grafo Genealógico Familiar"}
              </span>
            </h1>
            <p className="text-xs text-neutral-400">
              {graph.isViewerGuest
                ? `Mostrando parientes correspondientes a tu permiso de nivel ${tierDescription}.`
                : "Usa el mouse o pantalla táctil para arrastrar el lienzo y la rueda para hacer zoom. Nodos interconectados por generaciones."}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 bg-neutral-900/80 px-3 py-1.5 rounded-xl border border-neutral-800 self-start sm:self-auto">
            <span>Nodos visibles: {graph.nodes.length}</span>
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
