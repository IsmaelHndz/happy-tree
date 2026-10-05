"use client";

import { useState } from "react";
import { Link2, X, CheckCircle2 } from "lucide-react";
import { LinkComposer } from "./link-composer";

export interface LinkMembersModalProps {
  members: { id: string; name: string }[];
  triggerButton?: React.ReactNode;
}

export function LinkMembersModal({ members, triggerButton }: LinkMembersModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [lastLinked, setLastLinked] = useState<string | null>(null);

  const handleClose = () => {
    setIsOpen(false);
    setLastLinked(null);
  };

  return (
    <>
      {triggerButton ? (
        <div onClick={() => setIsOpen(true)}>{triggerButton}</div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-semibold text-xs transition"
        >
          <Link2 className="w-4 h-4 text-emerald-400" />
          <span>Vincular familiares</span>
        </button>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
          onKeyDown={(e) => e.key === "Escape" && handleClose()}
        >
          <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={handleClose}
              aria-label="Cerrar"
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Vincular familiares</h2>
                <p className="text-xs text-neutral-400">Une a dos personas ya registradas, vínculo por vínculo.</p>
              </div>
            </div>

            {lastLinked && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Guardado: {lastLinked}. Puedes elegir a otra persona para seguir vinculando.</span>
              </div>
            )}

            <LinkComposer members={members} onLinked={setLastLinked} />
          </div>
        </div>
      )}
    </>
  );
}
