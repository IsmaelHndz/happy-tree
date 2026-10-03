"use client";

import { useState } from "react";
import type { FamilyMemberItem } from "../types";
import { InviteModal } from "@/features/invitations/components/invite-modal";
import { EditMemberModal } from "@/features/genealogy/components/edit-member-modal";
import {
  Users,
  ShieldCheck,
  Clock,
  KeyRound,
  Pencil,
} from "lucide-react";

interface FamilyDirectoryProps {
  members: FamilyMemberItem[];
}

export function FamilyDirectory({ members }: FamilyDirectoryProps) {
  const [filter, setFilter] = useState<"all" | "parents" | "children" | "spouses" | "siblings">("all");
  const [activeInviteMember, setActiveInviteMember] = useState<FamilyMemberItem | null>(null);
  const [activeEditMember, setActiveEditMember] = useState<FamilyMemberItem | null>(null);

  const filteredMembers = members.filter((m) => {
    if (filter === "parents") return m.relationshipCategory === "parent";
    if (filter === "children") return m.relationshipCategory === "child";
    if (filter === "spouses") return m.relationshipCategory === "spouse";
    if (filter === "siblings") return m.relationshipCategory === "sibling";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Pestañas de Filtrado */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 pb-3">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filter === "all"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          Todos ({members.length})
        </button>
        <button
          onClick={() => setFilter("parents")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filter === "parents"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          Padres ({members.filter((m) => m.relationshipCategory === "parent").length})
        </button>
        <button
          onClick={() => setFilter("children")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filter === "children"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          Hijos ({members.filter((m) => m.relationshipCategory === "child").length})
        </button>
        <button
          onClick={() => setFilter("spouses")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filter === "spouses"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          Pareja ({members.filter((m) => m.relationshipCategory === "spouse").length})
        </button>
        <button
          onClick={() => setFilter("siblings")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filter === "siblings"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          Hermanos ({members.filter((m) => m.relationshipCategory === "sibling").length})
        </button>
      </div>

      {/* Grid de Familiares */}
      {filteredMembers.length === 0 ? (
        <div className="py-12 text-center rounded-2xl bg-neutral-950/40 border border-dashed border-neutral-800 p-8">
          <Users className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-neutral-300">
            No hay familiares en esta categoría
          </h3>
          <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
            Utiliza el botón superior &ldquo;Agregar Familiar&rdquo; para registrar a tus padres, hijos o pareja.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredMembers.map((member) => {
            const initials = `${member.firstName[0] || ""}${member.lastName[0] || ""}`.toUpperCase();
            const isFemale = member.gender === "female";
            const isMale = member.gender === "male";

            return (
              <div
                key={member.id}
                className={`p-5 rounded-2xl bg-neutral-900/70 border transition flex flex-col justify-between ${
                  isFemale
                    ? "border-neutral-800/80 hover:border-pink-500/50"
                    : isMale
                    ? "border-neutral-800/80 hover:border-blue-500/50"
                    : "border-neutral-800/80 hover:border-neutral-700"
                }`}
              >
                <div>
                  {/* Cabecera de la Tarjeta */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl font-bold text-xs flex items-center justify-center border ${
                          isFemale
                            ? "bg-gradient-to-tr from-pink-950 via-rose-900 to-pink-800 border-pink-500/50 text-pink-200"
                            : isMale
                            ? "bg-gradient-to-tr from-blue-950 via-indigo-900 to-blue-800 border-blue-500/50 text-blue-200"
                            : "bg-neutral-800 border-neutral-700 text-neutral-300"
                        }`}
                      >
                        {initials}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold text-white leading-tight">
                            {member.firstName} {member.lastName}
                          </h4>
                          {isFemale && (
                            <span
                              title="Mujer"
                              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-500/20 text-pink-400 font-bold text-[10px] shrink-0"
                            >
                              ♀
                            </span>
                          )}
                          {isMale && (
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
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Reclamado &bull; Cuenta Activa
                      </span>
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

                {/* Acciones */}
                <div className="pt-3 border-t border-neutral-800/60 flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {member.birthDate ? `Nac. ${member.birthDate}` : "Sin fecha"}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setActiveEditMember(member)}
                      title="Editar ficha"
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-neutral-800/80 hover:bg-neutral-700 hover:text-white text-neutral-300 rounded-lg transition"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Editar</span>
                    </button>

                    {member.isLiving && !member.isClaimed && (
                      <button
                        onClick={() => setActiveInviteMember(member)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-neutral-800 hover:bg-emerald-600 hover:text-white text-neutral-200 rounded-lg transition"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{member.invitationStatus === "pending" ? "Ver Enlace" : "Invitar"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Edición Dinámico */}
      {activeEditMember && (
        <EditMemberModal
          member={activeEditMember}
          availableFamilyMembers={members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` }))}
          isOpen={Boolean(activeEditMember)}
          onClose={() => setActiveEditMember(null)}
        />
      )}

      {/* Modal de Invitación Dinámico */}
      {activeInviteMember && (
        <InviteModal
          personId={activeInviteMember.id}
          personName={`${activeInviteMember.firstName} ${activeInviteMember.lastName}`}
          relationshipLabel={activeInviteMember.relationshipLabel}
          existingToken={activeInviteMember.invitationToken}
          existingEmail={activeInviteMember.invitedEmail}
          isOpen={Boolean(activeInviteMember)}
          onClose={() => setActiveInviteMember(null)}
        />
      )}
    </div>
  );
}
