"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ClipboardCopy, Loader2 } from "lucide-react";
import type { FamilyGraphData } from "../types/graph.types";
import type { LayoutRule } from "../utils/layout-crossings";
import { anonymizedLayoutCase, graphCrossings, movedPersonIds, relayoutGraph } from "../utils/arrange";
import { buildTreeScene } from "../utils/tree-scene";
import { buildTreeSvg } from "../utils/tree-svg";
import { reviewLayoutFeedbackAction } from "../layout-actions";

interface LayoutDiffProps {
  feedbackId: string;
  kind: "manual_adjust" | "report" | "change_request";
  status: string;
  graph: FamilyGraphData;
  baseRules: LayoutRule[];
  rules: LayoutRule[];
}

/** Antes y después de un acomodo, lado a lado, con las personas que cambiaron de lugar en ámbar. */
export function LayoutDiff({ feedbackId, kind, status, graph, baseRules, rules }: LayoutDiffProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const { before, after, moved, crossingsBefore, crossingsAfter } = useMemo(() => {
    const b = relayoutGraph(graph, baseRules);
    const a = relayoutGraph(graph, rules);
    return { before: b, after: a, moved: movedPersonIds(b, a), crossingsBefore: graphCrossings(b), crossingsAfter: graphCrossings(a) };
  }, [graph, baseRules, rules]);

  const svgOf = (g: FamilyGraphData, title: string, marked?: Set<string>) =>
    buildTreeSvg(buildTreeScene({ graph: g, hideSiblingSpouses: false, activeBranchKey: null }), {
      theme: "dark",
      title,
      subtitle: "",
      markedIds: marked,
    }).svg;
  const beforeSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOf(before, "Antes"))}`;
  const afterSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOf(after, "Después", moved))}`;

  const review = async (decision: "approved" | "rejected" | "reviewed") => {
    setBusy(true);
    const res = await reviewLayoutFeedbackAction({ id: feedbackId, decision, note });
    setBusy(false);
    setNotice(res.error ? { ok: false, text: res.error } : { ok: true, text: res.message ?? "Listo." });
    if (!res.error) router.refresh();
  };

  const copyTestCase = async () => {
    const json = JSON.stringify(anonymizedLayoutCase(graph, baseRules, rules), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setNotice({ ok: true, text: "Caso de prueba copiado. Pégalo en utils/__tests__ para el siguiente ajuste del algoritmo." });
    } catch {
      setNotice({ ok: false, text: "El navegador no permitió copiar. Inténtalo de nuevo." });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { label: "Antes", src: beforeSrc, crossings: crossingsBefore },
          { label: "Después", src: afterSrc, crossings: crossingsAfter },
        ].map((side) => (
          <figure key={side.label} className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 space-y-2">
            <figcaption className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">{side.label}</span>
              <span className={side.crossings === 0 ? "text-emerald-300" : "text-amber-300"}>
                {side.crossings} {side.crossings === 1 ? "cruce" : "cruces"}
              </span>
            </figcaption>
            <div className="max-h-[60vh] overflow-auto rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado en el navegador */}
              <img src={side.src} alt={`Acomodo ${side.label.toLowerCase()}`} className="w-full h-auto" />
            </div>
          </figure>
        ))}
      </div>
      <p className="text-xs text-neutral-400">
        {moved.size === 0
          ? "Nadie cambió de lugar (el reporte no incluye ajustes, o los ajustes ya no aplican a este árbol)."
          : `${moved.size} ${moved.size === 1 ? "persona cambió" : "personas cambiaron"} de lugar (contorno ámbar en "Después").`}
      </p>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
        <label htmlFor="review-note" className="block text-xs text-neutral-400">
          Nota para el registro (opcional)
        </label>
        <textarea
          id="review-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
        />
        {notice && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
              notice.ok ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200" : "bg-red-950/40 border-red-800/60 text-red-200"
            }`}
          >
            {notice.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {kind === "change_request" && status === "new" && (
            <>
              <button type="button" disabled={busy} onClick={() => review("approved")} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Aprobar y aplicar
              </button>
              <button type="button" disabled={busy} onClick={() => review("rejected")} className="px-4 py-2.5 rounded-xl border border-neutral-700 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50">
                Rechazar
              </button>
            </>
          )}
          {kind !== "change_request" && status === "new" && (
            <button type="button" disabled={busy} onClick={() => review("reviewed")} className="px-4 py-2.5 rounded-xl border border-neutral-700 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50">
              Marcar como revisado
            </button>
          )}
          <button type="button" onClick={copyTestCase} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-neutral-700 text-sm text-neutral-200 hover:bg-neutral-800">
            <ClipboardCopy className="w-4 h-4" />
            Copiar como caso de prueba
          </button>
        </div>
      </div>
    </div>
  );
}
