"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, FileDown, Loader2, X } from "lucide-react";
import type { FamilyGraphData } from "../types/graph.types";
import { formatFullName } from "../types";
import type { TreeScene } from "../utils/tree-scene";
import { buildTreeSvg, type PdfTheme } from "../utils/tree-svg";

interface ExportPdfModalProps {
  graph: FamilyGraphData;
  // La misma escena del lienzo: alcance, parejas ocultas y resaltado tal como se ven
  scene: TreeScene;
  scopeLabel?: string;
  onClose: () => void;
}

// Límite práctico de una página PDF (200 pulgadas = 14,400 pt); árboles más grandes se reducen
const MAX_PAGE_PT = 14000;
const PX_TO_PT = 0.75;

const THEMES: { value: PdfTheme; label: string; hint: string }[] = [
  { value: "light", label: "Claro", hint: "Fondo blanco, ideal para imprimir" },
  { value: "dark", label: "Oscuro", hint: "Igual que en la app" },
];

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ExportPdfModal({ graph, scene, scopeLabel, onClose }: ExportPdfModalProps) {
  const [theme, setTheme] = useState<PdfTheme>("light");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ownerName = formatFullName(graph.focusPerson);
  const dateLabel = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const subtitle = [
    scopeLabel ? `Vista ${scopeLabel.toLowerCase()}` : "Vista compartida",
    `${scene.nodes.length} ${scene.nodes.length === 1 ? "persona" : "personas"}`,
    ...(scene.hasHighlight ? ["Familia resaltada"] : []),
    dateLabel,
  ].join(" · ");

  const { svg, width, height } = useMemo(
    () => buildTreeSvg(scene, { theme, title: `Árbol familiar de ${ownerName}`, subtitle }),
    [scene, theme, ownerName, subtitle]
  );
  const previewSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const k = Math.min(1, MAX_PAGE_PT / (Math.max(width, height) * PX_TO_PT));
  const pageW = width * PX_TO_PT * k;
  const pageH = height * PX_TO_PT * k;
  const cm = (pt: number) => Math.round((pt / 72) * 2.54);

  const download = async () => {
    setIsExporting(true);
    setError(null);
    let holder: HTMLDivElement | null = null;
    try {
      // Se descargan solo al exportar, para no hacer más pesada la app
      const [{ jsPDF }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
      const doc = new jsPDF({ orientation: pageW > pageH ? "landscape" : "portrait", unit: "pt", format: [pageW, pageH] });
      const element = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
      // svg2pdf lee estilos calculados: el SVG debe estar en el documento (fuera de la vista)
      holder = document.createElement("div");
      holder.style.cssText = "position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden";
      holder.appendChild(element);
      document.body.appendChild(holder);
      await doc.svg(element, { x: 0, y: 0, width: pageW, height: pageH });
      doc.save(`arbol-${slug(ownerName) || "familiar"}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error(err);
      setError("No se pudo generar el PDF. Vuelve a intentarlo; si sigue fallando, prueba con un alcance más pequeño.");
    } finally {
      holder?.remove();
      setIsExporting(false);
    }
  };

  return (
    <div
      className="tree-controls fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm cursor-default"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Exportar árbol en PDF"
        className="w-full max-w-5xl max-h-full flex flex-col bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-neutral-800">
          <div>
            <h2 className="text-base font-semibold text-white">Exportar en PDF</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Así va a salir. Para cambiar quién aparece, usa el alcance, el botón de parejas o el resaltado antes de exportar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
          <div role="radiogroup" aria-label="Colores del PDF" className="flex gap-1 p-1 rounded-xl bg-neutral-900 border border-neutral-800">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={theme === t.value}
                onClick={() => setTheme(t.value)}
                title={t.hint}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  theme === t.value ? "bg-emerald-500/20 text-emerald-300" : "text-neutral-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-neutral-500">{THEMES.find((t) => t.value === theme)?.hint}</span>
          <span className="text-xs text-neutral-500 sm:ml-auto">
            Una hoja de {cm(pageW)} × {cm(pageH)} cm
          </span>
        </div>

        <div className="m-5 flex-1 min-h-[240px] max-h-[60vh] overflow-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de un SVG generado en el navegador */}
          <img src={previewSrc} alt="Vista previa del PDF" className="w-full h-auto rounded-lg" />
        </div>

        {error && (
          <div className="mx-5 mb-3 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 transition">
            Cancelar
          </button>
          <button
            type="button"
            onClick={download}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-60"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {isExporting ? "Generando PDF…" : "Descargar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
