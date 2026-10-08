import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getFamilyGraph } from "@/features/genealogy/services/get-family-graph";
import { LayoutDiff } from "@/features/genealogy/components/layout-diff";
import { parseLayoutRules } from "@/features/genealogy/utils/layout-crossings";
import { parseTreeScope } from "@/features/genealogy/utils/tree-scope";

export const dynamic = "force-dynamic";

const KIND_LABEL = {
  manual_adjust: "Ajuste manual en su propio árbol",
  report: "Reporte de acomodo",
  change_request: "Solicitud de cambio para el árbol de otra persona",
} as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LayoutFeedbackDetailPage({ params }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_user_zero").eq("id", user.id).maybeSingle();
  if (!profile?.is_user_zero) redirect("/tree");

  const { id } = await params;
  const { data: row } = await supabase.from("layout_feedback").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();

  // El árbol que se estaba viendo, recalculado sin acomodo guardado: el antes y el después
  // se dibujan en el navegador con las reglas del reporte.
  const graph = row.focus_person_id ? await getFamilyGraph(row.focus_person_id, undefined, parseTreeScope(row.scope)) : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-5">
        <Link href="/admin/acomodo" className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-emerald-400">
          <ArrowLeft className="w-3.5 h-3.5" />
          Todos los reportes
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">{KIND_LABEL[row.kind as keyof typeof KIND_LABEL] ?? "Reporte"}</h1>
          <p className="text-xs text-neutral-400">
            {new Date(row.created_at).toLocaleString("es-MX")} · alcance {row.scope ?? "—"} · algoritmo {row.algorithm_version ?? "—"}
          </p>
          {row.comment && <p className="mt-3 p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-sm text-neutral-200">“{row.comment}”</p>}
          {row.reviewer_note && <p className="mt-2 text-xs text-neutral-500">Nota de revisión: {row.reviewer_note}</p>}
        </div>
        {graph && graph.nodes.length > 0 ? (
          <LayoutDiff
            feedbackId={row.id}
            kind={row.kind}
            status={row.status}
            graph={graph}
            baseRules={parseLayoutRules(row.base_rules)}
            rules={parseLayoutRules(row.rules)}
          />
        ) : (
          <p className="text-sm text-neutral-400">No se pudo reconstruir el árbol de este reporte (la persona central ya no existe).</p>
        )}
      </div>
    </div>
  );
}
