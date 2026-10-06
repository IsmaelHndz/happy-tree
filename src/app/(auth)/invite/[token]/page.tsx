import { getInvitationDetails } from "@/features/auth/actions";
import { ClaimForm } from "./claim-form";
import Link from "next/link";
import { Users, AlertTriangle, ShieldCheck, ArrowLeft, HeartHandshake } from "lucide-react";

export const dynamic = "force-dynamic";

interface InvitePageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const invite = await getInvitationDetails(token);

  if (!invite.isValid) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 selection:bg-emerald-500 selection:text-black">
        <div className="w-full max-w-md bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-md text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Invitación No Válida</h1>
          <p className="text-xs sm:text-sm text-neutral-400 mb-6 leading-relaxed">
            {invite.errorMessage || "El token de invitación no existe, ya fue utilizado o ha expirado."}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Ir a Iniciar Sesión
          </Link>
        </div>
      </div>
    );
  }

  // Las invitaciones de la vista de Amigos usan estas etiquetas como relación propuesta
  const isFriendInvite = ["Amigo", "Amiga", "Amistad", "Novio", "Novia", "Noviazgo"].includes(
    invite.proposedRelationship ?? ""
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 selection:bg-emerald-500 selection:text-black">
      <div className="w-full max-w-lg bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-md">
        {/* Cabecera */}
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white mb-4">
            <HeartHandshake className="w-7 h-7" />
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/50 px-3 py-1 rounded-full uppercase tracking-wider">
            {isFriendInvite ? "Invitación de Amistad" : "Reclamación de Ficha Familiar"}
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-3">
            {isFriendInvite ? "¡Bienvenido a Happy Tree!" : "¡Bienvenido a la Familia!"}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-2 leading-relaxed">
            {invite.inviterName ? (
              <>
                <strong className="text-white">{invite.inviterName}</strong> te ha invitado a unirte a Happy Tree
                {invite.proposedRelationship && (
                  <> como su <span className="text-emerald-400 font-semibold">{invite.proposedRelationship}</span></>
                )}.
              </>
            ) : (
              "Has recibido una invitación para reclamar tu perfil genealógico."
            )}
          </p>
        </div>

        {/* Resumen de la Invitación */}
        <div className="mb-6 p-4 rounded-2xl bg-neutral-950/80 border border-neutral-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">
                Ficha: {invite.firstName} {invite.lastName}
              </div>
              <div className="text-[11px] text-neutral-400 font-mono">
                {invite.invitedEmail || "Sin correo preasignado (ingrésalo abajo)"}
              </div>
            </div>
          </div>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40">
            Unclaimed
          </span>
        </div>

        {/* Formulario de Reclamación */}
        <ClaimForm
          token={invite.token!}
          defaultFirstName={invite.firstName || ""}
          defaultLastName={invite.lastName || ""}
          invitedEmail={invite.invitedEmail ?? null}
        />

        {/* Pie */}
        <div className="mt-8 pt-6 border-t border-neutral-800/80 flex items-center gap-3 text-neutral-500 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Al reclamar este perfil, la ficha genealógica quedará protegida y vinculada exclusivamente a tu cuenta.
          </span>
        </div>
      </div>
    </div>
  );
}
