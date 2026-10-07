"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FamilyMemberItem } from "../types";
import { formatFullName } from "../types";
import { InviteModal } from "@/features/invitations/components/invite-modal";
import { EditMemberModal } from "@/features/genealogy/components/edit-member-modal";
import { AddMemberModal } from "@/features/genealogy/components/add-member-modal";
import { EndorsementsManagerModal } from "@/features/genealogy/components/endorsements-manager-modal";
import { convertUnionToSocialAction } from "@/features/genealogy/actions";
import { Users, ShieldCheck, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { PersonCard } from "./person-card";
import { PersonDetailsPanel } from "./person-details-panel";
import { relativesOf } from "../utils/person-display";
import { DEFAULT_LINE_COLOR, ROOT_STRIPE_COLOR } from "../utils/sibling-groups";

// Uniones que pueden pasar a ser amistad o noviazgo (no matrimonios vigentes)
const CONVERTIBLE_UNIONS = new Set(["partner", "separated", "divorced"]);
// Franja verde para la familia directa, gris para el resto (como en el árbol)
const DIRECT_CATEGORIES = new Set(["self", "parent", "child", "sibling", "spouse"]);

interface FamilyDirectoryProps {
  members: FamilyMemberItem[];
  isUserZero?: boolean;
  currentPerspectiveId?: string;
  availablePerspectives?: { id: string; name: string }[];
}

export function FamilyDirectory({
  members,
  isUserZero = false,
  currentPerspectiveId,
  availablePerspectives = [],
}: FamilyDirectoryProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "parents" | "children" | "spouses" | "siblings">("all");
  const [activeInviteMember, setActiveInviteMember] = useState<FamilyMemberItem | null>(null);
  const [activeEditMember, setActiveEditMember] = useState<FamilyMemberItem | null>(null);
  const [activeAddAnchor, setActiveAddAnchor] = useState<FamilyMemberItem | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertResult, setConvertResult] = useState<{ ok: boolean; text: string } | null>(null);
  // Persona abierta en el panel lateral de detalles
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const membersById = new Map(members.map((m) => [m.id, m]));
  const detailsMember = detailsId ? membersById.get(detailsId) ?? null : null;
  const canAddTo = (m: FamilyMemberItem) =>
    !m.isClaimed || isUserZero || m.relationshipCategory === "self" || Boolean(currentPerspectiveId && m.id === currentPerspectiveId);

  // Relaciones conocidas por el directorio, para el panel de detalles
  const knownNames = new Map<string, string>();
  const directoryParentEdges: { parentId: string; childId: string }[] = [];
  const seenEdges = new Set<string>();
  const addParentEdge = (parentId: string, childId: string) => {
    const key = `${parentId}>${childId}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    directoryParentEdges.push({ parentId, childId });
  };
  const directoryUnions: { personAId: string; personBId: string; unionType?: string | null }[] = [];
  for (const m of members) {
    knownNames.set(m.id, formatFullName(m));
    for (const pc of m.parentConnections ?? []) {
      if (!knownNames.has(pc.parentId)) knownNames.set(pc.parentId, pc.parentName);
      addParentEdge(pc.parentId, m.id);
    }
    for (const cc of m.childConnections ?? []) {
      if (!knownNames.has(cc.childId)) knownNames.set(cc.childId, cc.childName);
      addParentEdge(m.id, cc.childId);
    }
    if (m.unionInfo) {
      directoryUnions.push({ personAId: m.id, personBId: m.unionInfo.partnerId, unionType: m.unionInfo.unionType });
    }
  }

  const convertToSocial = async (member: FamilyMemberItem, kind: "friend" | "dating") => {
    if (!member.unionInfo) return;
    setConvertBusy(true);
    const res = await convertUnionToSocialAction({
      personAId: member.unionInfo.partnerId,
      personBId: member.id,
      kind,
    });
    setConvertBusy(false);
    setConvertingId(null);
    if (res.error) setConvertResult({ ok: false, text: res.error });
    else {
      setConvertResult({ ok: true, text: res.message ?? "Listo." });
      router.refresh();
    }
  };

  const filteredMembers = members.filter((m) => {
    if (filter === "parents") return m.relationshipCategory === "parent";
    if (filter === "children") return m.relationshipCategory === "child";
    if (filter === "spouses") return m.relationshipCategory === "spouse";
    if (filter === "siblings") return m.relationshipCategory === "sibling";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Barra superior de Perspectiva y Herramientas de Administrador */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
        {/* Pestañas de Filtrado */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              filter === "all"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Todos ({members.length})
          </button>
          <button
            onClick={() => setFilter("parents")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              filter === "parents"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Padres ({members.filter((m) => m.relationshipCategory === "parent").length})
          </button>
          <button
            onClick={() => setFilter("children")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              filter === "children"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Hijos ({members.filter((m) => m.relationshipCategory === "child").length})
          </button>
          <button
            onClick={() => setFilter("spouses")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              filter === "spouses"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Pareja ({members.filter((m) => m.relationshipCategory === "spouse").length})
          </button>
          <button
            onClick={() => setFilter("siblings")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              filter === "siblings"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Hermanos ({members.filter((m) => m.relationshipCategory === "sibling").length})
          </button>
        </div>

        {/* Perspectiva y Respaldos */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {availablePerspectives && availablePerspectives.length > 1 && (
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1 rounded-xl border border-neutral-800 text-xs">
              <span className="text-[11px] text-neutral-400 font-mono">Perspectiva:</span>
              <select
                value={currentPerspectiveId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    router.push(`/?perspective=${val}`);
                  } else {
                    router.push("/");
                  }
                }}
                className="bg-transparent text-white text-xs font-medium focus:outline-none cursor-pointer"
              >
                {availablePerspectives.map((p) => (
                  <option key={p.id} value={p.id} className="bg-neutral-900 text-white">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isUserZero && (
            <EndorsementsManagerModal isUserZero={isUserZero} buttonLabel="Respaldos" />
          )}
        </div>
      </div>

      {convertResult && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
            convertResult.ok
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
              : "bg-red-950/40 border-red-800/60 text-red-200"
          }`}
        >
          {convertResult.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <span>{convertResult.text}</span>
        </div>
      )}

      {/* Grid de Miembros */}
      {filteredMembers.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-neutral-800 rounded-2xl bg-neutral-950/40">
          <Users className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
          <p className="text-xs text-neutral-400">
            No se encontraron familiares en esta categoría.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {filteredMembers.map((member) => (
            <PersonCard
              key={member.id}
              person={member}
              stripeColor={DIRECT_CATEGORIES.has(member.relationshipCategory) ? DEFAULT_LINE_COLOR : ROOT_STRIPE_COLOR}
              isCenter={member.relationshipCategory === "self"}
              isSelected={detailsId === member.id}
              onOpenDetails={() => setDetailsId(member.id)}
              onClick={() => setDetailsId(member.id)}
              className="h-[176px]"
            />
          ))}
        </div>
      )}

      {/* Panel lateral de detalles */}
      {detailsMember && (
        <PersonDetailsPanel
          key={detailsMember.id}
          person={detailsMember}
          family={relativesOf({
            personId: detailsMember.id,
            nameOf: (id) => knownNames.get(id),
            parentEdges: directoryParentEdges,
            unions: directoryUnions,
          })}
          onClose={() => {
            setDetailsId(null);
            setConvertingId(null);
          }}
          onSelectRelative={(id) => membersById.has(id) && setDetailsId(id)}
          onViewTree={() => router.push(`/tree?focus=${detailsMember.id}`)}
          onAddRelative={canAddTo(detailsMember) ? () => setActiveAddAnchor(detailsMember) : undefined}
          onEdit={!detailsMember.isClaimed || isUserZero ? () => setActiveEditMember(detailsMember) : undefined}
          onInvite={
            detailsMember.isLiving && !detailsMember.isClaimed ? () => setActiveInviteMember(detailsMember) : undefined
          }
          extra={
            <>
              {detailsMember.isEndorsedByMe && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/40 px-2.5 py-1 rounded-full">
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  Tú respaldas a esta persona
                </span>
              )}
              {/* Noviazgo terminado registrado como pareja: pasarlo a Amigos */}
              {detailsMember.unionInfo && CONVERTIBLE_UNIONS.has(detailsMember.unionInfo.unionType) && (
                <div>
                  {convertingId === detailsMember.id ? (
                    <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2">
                      <p className="text-[11px] text-neutral-300">
                        ¿Qué son ahora? Deja de aparecer como pareja en el árbol y pasa a tu lista de Amigos.
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => convertToSocial(detailsMember, "friend")}
                          disabled={convertBusy}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-[11px] font-semibold flex items-center justify-center gap-1"
                        >
                          {convertBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                          Amigos
                        </button>
                        <button
                          onClick={() => convertToSocial(detailsMember, "dating")}
                          disabled={convertBusy}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 text-white text-[11px] font-semibold"
                        >
                          Novios
                        </button>
                        <button
                          onClick={() => setConvertingId(null)}
                          className="px-2 py-1.5 text-[11px] text-neutral-400 hover:text-white"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setConvertResult(null);
                        setConvertingId(detailsMember.id);
                      }}
                      className="text-[11px] text-sky-300 hover:text-sky-200"
                    >
                      ¿Fue un noviazgo? Pasar a amistad
                    </button>
                  )}
                </div>
              )}
            </>
          }
        />
      )}

      {/* Modal de Añadir Pariente Anclado */}
      {activeAddAnchor && (
        <AddMemberModal
          key={activeAddAnchor.id}
          defaultAnchorId={activeAddAnchor.id}
          defaultAnchorName={formatFullName(activeAddAnchor)}
          availableAnchors={members.filter(canAddTo).map((m) => ({ id: m.id, name: formatFullName(m) }))}
          isOpen={Boolean(activeAddAnchor)}
          onClose={() => setActiveAddAnchor(null)}
        />
      )}

      {/* Modal de Edición Dinámico */}
      {activeEditMember && (
        <EditMemberModal
          key={activeEditMember.id}
          member={activeEditMember}
          availableFamilyMembers={members.map((m) => ({
            id: m.id,
            name: formatFullName(m),
          }))}
          isUserZero={isUserZero}
          isSelf={false}
          isOpen={Boolean(activeEditMember)}
          onClose={() => setActiveEditMember(null)}
        />
      )}

      {/* Modal de Invitación Criptográfica */}
      {activeInviteMember && (
        <InviteModal
          personId={activeInviteMember.id}
          personName={formatFullName(activeInviteMember)}
          relationshipLabel={activeInviteMember.relationshipLabel}
          existingToken={activeInviteMember.invitationToken}
          isOpen={Boolean(activeInviteMember)}
          onClose={() => setActiveInviteMember(null)}
        />
      )}
    </div>
  );
}
