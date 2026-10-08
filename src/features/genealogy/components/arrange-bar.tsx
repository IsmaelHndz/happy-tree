"use client";

import { useState } from "react";
import { AlertCircle, ArrowLeft, ArrowLeftRight, ArrowRight, CheckCircle2, Flag, Loader2, RotateCcw, Undo2 } from "lucide-react";
import type { LayoutRule } from "../utils/layout-crossings";

interface ArrangeBarProps {
  // En el árbol de otra persona no se guarda: se envía una propuesta al Usuario Cero
  isGuest: boolean;
  selectedName: string | null;
  options: { flip?: LayoutRule; moveLeft?: LayoutRule; moveRight?: LayoutRule };
  crossingsBefore: number;
  crossingsAfter: number;
  hasChanges: boolean;
  canUndo: boolean;
  busy: boolean;
  notice: { ok: boolean; text: string } | null;
  onApply: (rule: LayoutRule) => void;
  onUndo: () => void;
  onResetAll: () => void;
  onCancel: () => void;
  onSave: (comment: string) => void;
  onReport: (comment: string) => void;
}

const actionButton =
  "flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-neutral-700 bg-neutral-950 text-xs font-medium text-neutral-200 hover:border-emerald-500/60 hover:text-white transition disabled:opacity-40 disabled:hover:border-neutral-700";

export function ArrangeBar({
  isGuest,
  selectedName,
  options,
  crossingsBefore,
  crossingsAfter,
  hasChanges,
  canUndo,
  busy,
  notice,
  onApply,
  onUndo,
  onResetAll,
  onCancel,
  onSave,
  onReport,
}: ArrangeBarProps) {
  const [comment, setComment] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  const crossingsColor = crossingsAfter === 0 ? "text-emerald-300" : crossingsAfter < crossingsBefore ? "text-amber-300" : "text-neutral-300";

  return (
    <div className="tree-controls absolute bottom-3 left-3 right-3 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(40rem,calc(100%-3rem))] z-30 bg-neutral-900/95 border border-emerald-800/60 rounded-2xl shadow-2xl backdrop-blur-md p-3 space-y-3 cursor-default">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">Acomodar el árbol</div>
          <div className="text-[11px] text-neutral-400 truncate">
            {selectedName ? `Seleccionaste a ${selectedName}` : "Toca a una persona para moverla"}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">Cruces</div>
          <div className={`text-sm font-mono ${crossingsColor}`}>
            {hasChanges ? `${crossingsBefore} → ${crossingsAfter}` : crossingsAfter}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" disabled={!options.moveLeft || busy} onClick={() => options.moveLeft && onApply(options.moveLeft)} className={actionButton}>
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Grupo a la izq.</span>
        </button>
        <button type="button" disabled={!options.flip || busy} onClick={() => options.flip && onApply(options.flip)} className={actionButton}>
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>Voltear pareja</span>
        </button>
        <button type="button" disabled={!options.moveRight || busy} onClick={() => options.moveRight && onApply(options.moveRight)} className={actionButton}>
          <span>Grupo a la der.</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {(isGuest || isReporting) && (
        <textarea
          id="arrange-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={isReporting ? "¿Qué se ve mal? (opcional)" : "Explica tu propuesta (opcional)"}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
        />
      )}

      {notice && (
        <div
          className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
            notice.ok ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200" : "bg-red-950/40 border-red-800/60 text-red-200"
          }`}
        >
          {notice.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onUndo} disabled={!canUndo || busy} className="p-2.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-40" title="Deshacer" aria-label="Deshacer">
          <Undo2 className="w-4 h-4" />
        </button>
        {!isGuest && (
          <button type="button" onClick={onResetAll} disabled={busy} className="p-2.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-40" title="Volver al acomodo automático" aria-label="Volver al acomodo automático">
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => (isReporting ? onReport(comment) : setIsReporting(true))}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          <Flag className="w-3.5 h-3.5" />
          {isReporting ? "Enviar reporte" : "Reportar"}
        </button>
        <div className="flex-1" />
        <button type="button" onClick={onCancel} disabled={busy} className="px-3 py-2.5 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-neutral-800">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(comment)}
          disabled={busy || !hasChanges}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isGuest ? "Enviar propuesta" : "Guardar acomodo"}
        </button>
      </div>
      {isGuest && (
        <p className="text-[11px] text-neutral-500">
          Este árbol es de otra persona: tu propuesta llega para revisión y se aplica solo si se aprueba.
        </p>
      )}
    </div>
  );
}
