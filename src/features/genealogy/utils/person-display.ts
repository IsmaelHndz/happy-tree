// Textos de presentación de una persona en tarjetas y en el panel de detalles.
import { calculateAge } from "../types";

export type PersonStatus = "claimed" | "invited" | "deceased" | null;

export interface PersonDisplayInput {
  birthDate?: string | null;
  deathDate?: string | null;
  isLiving: boolean;
  isClaimed: boolean;
  invitationStatus?: string | null;
}

/** Estado que merece mostrarse; el estado normal (ficha sin cuenta) no muestra nada. */
export function personStatus(p: PersonDisplayInput): PersonStatus {
  if (p.isClaimed) return "claimed";
  if (!p.isLiving) return "deceased";
  if (p.invitationStatus === "pending") return "invited";
  return null;
}

export const PERSON_STATUS_LABEL: Record<Exclude<PersonStatus, null>, string> = {
  claimed: "Tiene cuenta",
  invited: "Invitación enviada",
  deceased: "Fallecido",
};

/**
 * Edad para la tarjeta: la actual, o la que tenía al fallecer. Sin fecha de muerte
 * registrada no se puede saber la edad de alguien fallecido, así que no se muestra.
 */
export function displayAge(p: PersonDisplayInput): number | null {
  if (!p.isLiving && !p.deathDate) return null;
  return calculateAge(p.birthDate, p.isLiving ? null : p.deathDate);
}

export function ageLabel(p: PersonDisplayInput): string | null {
  const age = displayAge(p);
  if (age === null) return null;
  return `${age} ${age === 1 ? "año" : "años"}`;
}

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "1978-03-12" → "12 de marzo de 1978"; acepta también solo el año o año-mes. */
export function formatLifeDate(date?: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || Number.isNaN(y)) return null;
  if (!m || Number.isNaN(m) || m < 1 || m > 12) return String(y);
  if (!d || Number.isNaN(d)) return `${MONTHS[m - 1]} de ${y}`;
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

export interface FamilyRelative {
  id: string;
  name: string;
  note?: string;
}

const UNION_NOTES: Record<string, string> = {
  married: "casados",
  civil_union: "unión civil",
  partner: "unión libre",
  separated: "separados",
  divorced: "divorciados",
};

/**
 * Padres, parejas, hermanos e hijos de una persona a partir de las aristas disponibles
 * en la vista. Los hermanos que comparten solo un progenitor se marcan como medios hermanos.
 */
export function relativesOf(input: {
  personId: string;
  nameOf: (id: string) => string | undefined;
  parentEdges: { parentId: string; childId: string }[];
  unions: { personAId: string; personBId: string; unionType?: string | null }[];
}): { parents: FamilyRelative[]; partners: FamilyRelative[]; siblings: FamilyRelative[]; children: FamilyRelative[] } {
  const { personId, nameOf, parentEdges, unions } = input;
  const named = (id: string, note?: string): FamilyRelative[] => {
    const name = nameOf(id);
    return name ? [{ id, name, ...(note ? { note } : {}) }] : [];
  };
  const unique = (ids: string[]) => [...new Set(ids)].filter((id) => id !== personId);

  const parentIds = unique(parentEdges.filter((e) => e.childId === personId).map((e) => e.parentId));
  const childIds = unique(parentEdges.filter((e) => e.parentId === personId).map((e) => e.childId));

  const siblingShared = new Map<string, number>();
  for (const e of parentEdges) {
    if (e.childId !== personId && parentIds.includes(e.parentId)) {
      siblingShared.set(e.childId, (siblingShared.get(e.childId) ?? 0) + 1);
    }
  }
  const siblings = [...siblingShared.entries()].flatMap(([id, shared]) =>
    named(id, parentIds.length >= 2 && shared < parentIds.length ? "medio hermano/a" : undefined)
  );

  const seenPartners = new Set<string>();
  const partners = unions.flatMap((u) => {
    const other = u.personAId === personId ? u.personBId : u.personBId === personId ? u.personAId : null;
    if (!other || other === personId || seenPartners.has(other)) return [];
    seenPartners.add(other);
    return named(other, u.unionType ? UNION_NOTES[u.unionType] : undefined);
  });

  return {
    parents: parentIds.flatMap((id) => named(id)),
    partners,
    siblings,
    children: childIds.flatMap((id) => named(id)),
  };
}
