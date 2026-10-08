import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flag, GitPullRequestArrow, Wrench } from "lucide-react";
import { formatFullName } from "@/features/genealogy/types";
import { isMissingTableError, MISSING_LAYOUT_TABLES_MESSAGE } from "@/features/genealogy/utils/db-errors";

export const dynamic = "force-dynamic";

const KIND = {
  manual_adjust: { label: "Ajuste manual", icon: Wrench },
  report: { label: "Reporte", icon: Flag },
  change_request: { label: "Solicitud de cambio", icon: GitPullRequestArrow },
} as const;

const STATUS: Record<string, { label: string; className: string }> = {
  new: { label: "Nuevo", className: "text-amber-300 border-amber-800/60 bg-amber-950/40" },
  reviewed: { label: "Revisado", className: "text-neutral-300 border-neutral-700 bg-neutral-900" },
  approved: { label: "Aprobado", className: "text-emerald-300 border-emerald-800/60 bg-emerald-950/40" },
  rejected: { label: "Rechazado", className: "text-red-300 border-red-800/60 bg-red-950/40" },
};

interface PageProps {
  searchParams: Promise<{ estado?: string }>;
}

export default async function LayoutFeedbackPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_user_zero").eq("id", user.id).maybeSingle();
  if (!profile?.is_user_zero) redirect("/tree");

  const { estado } = await searchParams;
  const onlyNew = estado !== "todos";
  let query = supabase
    .from("layout_feedback")
    .select("id, user_id, kind, status, scope, crossings_before, crossings_after, comment, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (onlyNew) query = query.eq("status", "new");
  const { data: rows, error } = await query;

  // Nombre de quien envió cada reporte
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, persons:person_id(first_name, middle_name, last_name, maternal_last_name)").in("id", userIds)
    : { data: [] };
  const nameOf = new Map(
    (profiles ?? []).map((p) => {
      const person = p.persons as unknown as { first_name: string; middle_name: string | null; last_name: string; maternal_last_name: string | null } | null;
      return [
        p.id,
        person
          ? formatFullName({ firstName: person.first_name, middleName: person.middle_name, lastName: person.last_name, maternalLastName: person.maternal_last_name })
          : "Usuario",
      ];
    })
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/tree" className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-emerald-400">
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al árbol
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Reportes de acomodo</h1>
            <p className="text-sm text-neutral-400">Ajustes manuales, reportes y solicitudes de cambio que envía la familia.</p>
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-medium">
            <Link href="/admin/acomodo" className={`px-3 py-1.5 rounded-lg ${onlyNew ? "bg-neutral-800 text-white" : "text-neutral-400"}`}>
              Nuevos
            </Link>
            <Link href="/admin/acomodo?estado=todos" className={`px-3 py-1.5 rounded-lg ${!onlyNew ? "bg-neutral-800 text-white" : "text-neutral-400"}`}>
              Todos
            </Link>
          </div>
        </div>

        {error ? (
          <p className="p-4 rounded-2xl border border-amber-800/60 bg-amber-950/40 text-sm text-amber-200">
            {isMissingTableError(error) ? MISSING_LAYOUT_TABLES_MESSAGE : "No se pudieron cargar los reportes."}
          </p>
        ) : !rows || rows.length === 0 ? (
          <p className="p-8 text-center rounded-2xl border border-dashed border-neutral-800 text-sm text-neutral-400">
            {onlyNew ? "No hay reportes nuevos." : "Todavía no hay reportes."}
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const kind = KIND[r.kind as keyof typeof KIND] ?? KIND.report;
              const status = STATUS[r.status] ?? STATUS.new;
              const Icon = kind.icon;
              return (
                <li key={r.id}>
                  <Link
                    href={`/admin/acomodo/${r.id}`}
                    className="flex items-center gap-3 p-4 rounded-2xl border border-neutral-800 bg-neutral-900 hover:border-emerald-700/60 transition"
                  >
                    <Icon className="w-4 h-4 text-neutral-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white">
                        {kind.label} · {nameOf.get(r.user_id) ?? "Usuario"}
                      </div>
                      <div className="text-xs text-neutral-500 truncate">
                        {new Date(r.created_at).toLocaleString("es-MX")} · cruces {r.crossings_before ?? "?"} → {r.crossings_after ?? "?"}
                        {r.comment ? ` · "${r.comment}"` : ""}
                      </div>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${status.className}`}>{status.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
