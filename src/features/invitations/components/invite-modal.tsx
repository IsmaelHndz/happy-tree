"use client";

import { useState } from "react";
import { generateInvitationAction } from "@/features/invitations/actions";
import {
  KeyRound,
  Copy,
  Check,
  Share2,
  Mail,
  Phone,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";

interface InviteModalProps {
  personId: string;
  personName: string;
  relationshipLabel: string;
  existingToken?: string | null;
  existingEmail?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function InviteModal({
  personId,
  personName,
  relationshipLabel,
  existingToken,
  existingEmail,
  isOpen,
  onClose,
}: InviteModalProps) {
  const [email, setEmail] = useState(existingEmail || "");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState<string | null>(existingToken || null);
  const [copied, setCopied] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = token ? `${origin}/invite/${token}` : "";

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    const result = await generateInvitationAction(personId, email.trim() || null, relationshipLabel);

    setIsPending(false);
    if (result.error) {
      setError(result.error);
    } else if (result.token) {
      setToken(result.token);
    }
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const whatsappMessage = encodeURIComponent(
    `¡Hola ${personName}! Te invito a unirte a Happy Tree y reclamar tu perfil familiar como mi ${relationshipLabel}. Accede mediante tu enlace único seguro para ver y construir nuestro árbol genealógico:\n${inviteUrl}`
  );
  const whatsappUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${whatsappMessage}`
    : `https://api.whatsapp.com/send?text=${whatsappMessage}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        {/* Botón Cerrar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Encabezado */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              Invitar a {personName}
            </h2>
            <p className="text-xs text-neutral-400">
              Parentesco: <span className="text-emerald-400">{relationshipLabel}</span>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!token ? (
          /* Formulario para generar el token */
          <form onSubmit={handleGenerate} className="space-y-4">
            <p className="text-xs text-neutral-400 leading-relaxed">
              Genera un enlace criptográfico único de 32 bytes para que tu familiar reclame su ficha y confirme su parentesco.
            </p>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-neutral-300">
                  Correo Electrónico de {personName}
                </label>
                <span className="text-[11px] text-emerald-400 font-medium">Opcional</span>
              </div>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="familiar@ejemplo.com (o en blanco)"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <p className="text-[11px] text-neutral-500 mt-1.5 leading-relaxed">
                Si no conoces su correo o vas a mandarle el enlace por WhatsApp, déjalo vacío. Tu familiar podrá ingresar su propio correo directamente al reclamar su perfil.
              </p>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs transition shadow-md shadow-emerald-700/20 disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generando Token Criptográfico...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Generar Enlace de Invitación</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Enlace Generado con botones de Copiar y Compartir */
          <div className="space-y-4">
            <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-emerald-200 text-xs flex items-center justify-between">
              <span>Token generado y activo por 7 días.</span>
              <span className="text-[10px] font-mono bg-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-300">
                Un solo uso
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                Enlace Único de Reclamación
              </label>
              <div className="p-2.5 bg-black/60 border border-neutral-800 rounded-xl text-xs font-mono text-neutral-300 break-all select-all">
                {inviteUrl}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                Número de Teléfono (opcional para abrir su chat directo)
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej. +52 1 55 1234 5678"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Enlace</span>
                  </>
                )}
              </button>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{cleanPhone ? "Abrir Chat" : "WhatsApp"}</span>
              </a>
            </div>

            <div className="text-center pt-2">
              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-emerald-400 transition"
              >
                <span>Abrir enlace en pestaña nueva</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
