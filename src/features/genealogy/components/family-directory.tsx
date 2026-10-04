"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FamilyMemberItem } from "../types";
import { formatFullName, calculateAge } from "../types";
import { InviteModal } from "@/features/invitations/components/invite-modal";
import { EditMemberModal } from "@/features/genealogy/components/edit-member-modal";
import { AddMemberModal } from "@/features/genealogy/components/add-member-modal";
import { EndorsementsManagerModal } from "@/features/genealogy/components/endorsements-manager-modal";
import {
  Users,
  ShieldCheck,
  Clock,
  KeyRound,
  Pencil,
  UserPlus,
  Cake,
} from "lucide-react";

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

      {/* Grid de Miembros */}
      {filteredMembers.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-neutral-800 rounded-2xl bg-neutral-950/40">
          <Users className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
          <p className="text-xs text-neutral-400">
            No se encontraron familiares en esta categoría.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMembers.map((member) => {
            const isFemale = member.gender === "female";
            const isMale = member.gender === "male";
            const initials = `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();
            const age = calculateAge(member.birthDate, member.deathDate);

            return (
              <div
                key={member.id}
                className="flex flex-col justify-between p-5 rounded-2xl bg-neutral-950/70 border border-neutral-800/80 hover:border-neutral-700/80 transition-all shadow-md group"
              >
                <div>
                  {/* Fila Superior: Avatar, Nombre Completo y Rol */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          isFemale
                            ? "bg-pink-950 text-pink-300 border border-pink-800/60"
                            : isMale
                            ? "bg-blue-950 text-blue-300 border border-blue-800/60"
                            : "bg-emerald-950 text-emerald-300 border border-emerald-800/60"
                        }`}
                      >
                        {initials}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-semibold text-white tracking-tight truncate">
                            {formatFullName(member)}
                          </h3>
                          {isFemale ? (
                            <span
                              title="Mujer"
                              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-500/20 text-pink-400 font-bold text-[10px] shrink-0"
                            >
                              ♀
                            </span>
                          ) : (
                            <span
                              title="Hombre"
                              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500/20 text-blue-400 font-bold text-[10px] shrink-0"
                            >
                              ♂
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[11px] font-medium ${
                            isFemale ? "text-pink-400" : isMale ? "text-blue-400" : "text-emerald-400"
                          }`}
                        >
                          {member.relationshipLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Estado de Reclamación / Vida */}
                  <div className="mb-4">
                    {member.isClaimed ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          Reclamado &bull; Cuenta Activa
                        </span>
                        {member.isEndorsedByMe && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-300 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full">
                            <ShieldCheck className="w-2.5 h-2.5 text-amber-400" />
                            Respaldado
                          </span>
                        )}
                      </div>
                    ) : !member.isLiving ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-400 bg-neutral-950 border border-neutral-800 px-2.5 py-0.5 rounded-full">
                        Ancestro / Fallecido
                      </span>
                    ) : member.invitationStatus === "pending" ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300 bg-amber-950/60 border border-amber-800/50 px-2.5 py-0.5 rounded-full">
                        <Clock className="w-3 h-3 text-amber-400" />
                        Invitación Emitida
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-400 bg-neutral-950 border border-neutral-800 px-2.5 py-0.5 rounded-full">
                        Sin Reclamar (Unclaimed)
                      </span>
                    )}
                  </div>
                </div>

                {/* Acciones & Edad Actual */}
                <div className="pt-3 border-t border-neutral-800/60 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium shrink-0">
                    {age !== null ? (
                      <span
                        title={member.isLiving ? "Edad actual" : "Edad al fallecer"}
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-400 font-medium"
                      >
                        <Cake className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span>{age} {age === 1 ? "año" : "años"}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-600 font-mono" title="Fecha de nacimiento no registrada">—</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {/* Botón para agregar familiares anclados a esta persona */}
                    <button
                      onClick={() => setActiveAddAnchor(member)}
                      title={`Añadir pariente respecto a ${member.firstName}`}
                      className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-medium bg-emerald-950/60 hover:bg-emerald-600 hover:text-white text-emerald-300 border border-emerald-800/50 rounded-lg transition whitespace-nowrap shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5 shrink-0" />
                      <span>Pariente</span>
                    </button>

                    {/* Solo se puede editar si la ficha NO ha sido reclamada */}
                    {!member.isClaimed && (
                      <button
                        onClick={() => setActiveEditMember(member)}
                        title="Editar ficha"
                        className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-medium bg-neutral-800/80 hover:bg-neutral-700 hover:text-white text-neutral-300 border border-neutral-700/60 rounded-lg transition whitespace-nowrap shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5 shrink-0" />
                        <span>Editar</span>
                      </button>
                    )}

                    {member.isLiving && !member.isClaimed && (
                      <button
                        onClick={() => setActiveInviteMember(member)}
                        title={member.invitationStatus === "pending" ? "Ver enlace de invitación" : "Generar invitación criptográfica"}
                        className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-medium bg-neutral-800/80 hover:bg-emerald-600 hover:text-white text-neutral-200 border border-neutral-700/60 rounded-lg transition whitespace-nowrap shrink-0"
                      >
                        <KeyRound className="w-3.5 h-3.5 shrink-0" />
                        <span>{member.invitationStatus === "pending" ? "Enlace" : "Invitar"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Añadir Pariente Anclado */}
      {activeAddAnchor && (
        <AddMemberModal
          key={activeAddAnchor.id}
          defaultAnchorId={activeAddAnchor.id}
          defaultAnchorName={formatFullName(activeAddAnchor)}
          availableAnchors={members.map((m) => ({ id: m.id, name: formatFullName(m) }))}
          isOpen={Boolean(activeAddAnchor)}
          onClose={() => setActiveAddAnchor(null)}
        />
      )}

      {/* Modal de Edición Dinámico */}
      {activeEditMember && (
        <EditMemberModal
          member={activeEditMember}
          availableFamilyMembers={members.map((m) => ({
            id: m.id,
            name: formatFullName(m),
          }))}
          viewerParents={members
            .filter((m) => m.relationshipCategory === "parent")
            .map((p) => ({ id: p.id, name: formatFullName(p) }))}
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
