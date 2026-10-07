"use client";

import { useEffect, type ReactNode } from "react";
import { Cake, Compass, KeyRound, Pencil, ShieldCheck, Clock, UserPlus, X } from "lucide-react";
import { formatFullName } from "../types";
import type { PersonCardData } from "./person-card";
import {
  ageLabel,
  type FamilyRelative,
  formatLifeDate,
  PERSON_STATUS_LABEL,
  personStatus,
} from "../utils/person-display";


export interface PersonDetailsData extends PersonCardData {
  maidenName?: string | null;
  birthPlace?: string | null;
  bio?: string | null;
  relationshipExplanation?: string;
  accountEmail?: string | null;
}

interface PersonDetailsPanelProps {
  person: PersonDetailsData;
  family: { parents: FamilyRelative[]; partners: FamilyRelative[]; children: FamilyRelative[]; siblings: FamilyRelative[] };
  onClose: () => void;
  // Abre en el panel a un familiar listado (si está disponible en esta vista)
  onSelectRelative?: (id: string) => void;
  onViewTree?: () => void;
  onAddRelative?: () => void;
  onEdit?: () => void;
  onInvite?: () => void;
  // Contenido extra propio de cada vista (p. ej. el directorio)
  extra?: ReactNode;
}

/**
 * Panel lateral con toda la información de una persona y sus acciones.
 * Cada acción solo aparece si quien mira tiene permiso (el padre decide pasando o no el callback).
 */
export function PersonDetailsPanel({
  person,
  family,
  onClose,
  onSelectRelative,
  onViewTree,
  onAddRelative,
  onEdit,
  onInvite,
  extra,
}: PersonDetailsPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fullName = formatFullName(person);
  const status = personStatus(person);
  const age = ageLabel(person);
  const born = formatLifeDate(person.birthDate);
  const died = formatLifeDate(person.deathDate);
  const isFemale = person.gender === "female";
  const isMale = person.gender === "male";
  const initials = `${person.firstName[0] || ""}${person.lastName[0] || ""}`.toUpperCase();

  const facts: { label: string; value: string }[] = [
    ...(age ? [{ label: person.isLiving ? "Edad" : "Edad al fallecer", value: age }] : []),
    ...(born ? [{ label: "Nació", value: born }] : []),
    ...(died ? [{ label: "Falleció", value: died }] : []),
    ...(person.birthPlace ? [{ label: "Lugar de nacimiento", value: person.birthPlace }] : []),
    ...(person.maidenName ? [{ label: "Otro apellido", value: person.maidenName }] : []),
    ...(person.accountEmail ? [{ label: "Correo de la cuenta", value: person.accountEmail }] : []),
  ];

  const groups: { title: string; people: FamilyRelative[] }[] = [
    { title: "Padres", people: family.parents },
    { title: "Pareja", people: family.partners },
    { title: "Hermanos", people: family.siblings },
    { title: "Hijos", people: family.children },
  ].filter((g) => g.people.length > 0);

  return (
    <aside
      role="dialog"
      aria-label={`Detalles de ${fullName}`}
      className="tree-controls fixed inset-y-0 right-0 z-40 w-full sm:w-[380px] bg-neutral-950 border-l border-neutral-800 shadow-2xl flex flex-col cursor-default"
    >
      <div className="flex items-start justify-between gap-3 p-5 border-b border-neutral-800">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${
              isFemale
                ? "bg-gradient-to-tr from-pink-950 via-rose-900 to-pink-800 text-pink-100"
                : isMale
                ? "bg-gradient-to-tr from-blue-950 via-indigo-900 to-blue-800 text-blue-100"
                : "bg-neutral-800 text-neutral-200"
            } ${status === "deceased" ? "opacity-60 grayscale" : ""}`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white leading-tight">{fullName}</h2>
            <p className={`text-xs font-medium ${isFemale ? "text-pink-400" : isMale ? "text-blue-400" : "text-emerald-400"}`}>
              {person.relationshipLabel}
            </p>
            {person.relationshipExplanation && (
              <p className="text-[11px] text-neutral-500 mt-0.5">{person.relationshipExplanation}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar detalles"
          className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {status && (
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
              status === "claimed"
                ? "text-emerald-300 bg-emerald-950/60 border-emerald-800/50"
                : status === "invited"
                ? "text-amber-300 bg-amber-950/60 border-amber-800/50"
                : "text-neutral-300 bg-neutral-900 border-neutral-800"
            }`}
          >
            {status === "claimed" ? (
              <ShieldCheck className="w-3 h-3" />
            ) : status === "invited" ? (
              <Clock className="w-3 h-3" />
            ) : null}
            {PERSON_STATUS_LABEL[status]}
          </span>
        )}

        {facts.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[11px] text-neutral-500 flex items-center gap-1">
                  {f.label.startsWith("Edad") && <Cake className="w-3 h-3" />}
                  {f.label}
                </dt>
                <dd className="text-neutral-100 break-words">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-neutral-500">Aún no hay fechas ni lugares registrados.</p>
        )}

        {person.bio && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">Notas</h3>
            <p className="text-sm text-neutral-300 whitespace-pre-line">{person.bio}</p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-[11px] uppercase tracking-wider text-neutral-500">Familia</h3>
            {groups.map((g) => (
              <div key={g.title}>
                <div className="text-xs text-neutral-400 mb-1.5">{g.title}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.people.map((r) =>
                    onSelectRelative ? (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelectRelative(r.id)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-emerald-600 text-neutral-200 transition text-left"
                      >
                        {r.name}
                        {r.note && <span className="text-neutral-500"> · {r.note}</span>}
                      </button>
                    ) : (
                      <span key={r.id} className="text-xs px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-200">
                        {r.name}
                        {r.note && <span className="text-neutral-500"> · {r.note}</span>}
                      </span>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {extra}
      </div>

      {(onInvite || onViewTree || onAddRelative || onEdit) && (
        <div className="p-5 border-t border-neutral-800 space-y-2">
          {onInvite && (
            <button
              type="button"
              onClick={onInvite}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition"
            >
              <KeyRound className="w-4 h-4" />
              {person.invitationStatus === "pending" ? "Ver enlace de invitación" : `Invitar a ${person.firstName}`}
            </button>
          )}
          <div className="grid grid-cols-3 gap-2">
            {onViewTree && (
              <button
                type="button"
                onClick={onViewTree}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-200 transition"
              >
                <Compass className="w-4 h-4 text-emerald-400" />
                Ver su árbol
              </button>
            )}
            {onAddRelative && (
              <button
                type="button"
                onClick={onAddRelative}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-200 transition"
              >
                <UserPlus className="w-4 h-4 text-emerald-400" />
                Agregar familiar
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-200 transition"
              >
                <Pencil className="w-4 h-4 text-neutral-300" />
                Editar
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
