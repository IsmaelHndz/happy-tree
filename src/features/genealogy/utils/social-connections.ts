/**
 * VÍNCULOS SOCIALES (amigos y noviazgos) — lógica pura, sin dependencias de servidor.
 *
 * Los vínculos sociales viven en `social_connections`, nunca en `union_edges`:
 * no se dibujan en el árbol, no cuentan para el componente familiar
 * (`getConnectedFamilyIds`) y no generan parentesco.
 */

export type SocialConnectionKind = "friend" | "dating";

export const SOCIAL_KIND_LABELS: Record<SocialConnectionKind, string> = {
  friend: "Amistad",
  dating: "Noviazgo",
};

export interface SocialConnectionRow {
  id: string;
  person_a_id: string;
  person_b_id: string;
  kind: SocialConnectionKind;
}

/** La otra persona del vínculo, o null si `personId` no participa en él. */
export function otherParty(connection: { person_a_id: string; person_b_id: string }, personId: string): string | null {
  if (connection.person_a_id === personId) return connection.person_b_id;
  if (connection.person_b_id === personId) return connection.person_a_id;
  return null;
}

/**
 * Personas que son SOLO vínculo social de `personId`: tienen un vínculo social con él
 * y no pertenecen a su familia (`familyIds`, el componente conectado por parentesco).
 * Son las que salen del directorio familiar y aparecen únicamente en la vista de Amigos.
 * Un primo que además es amigo sigue siendo familia y no se excluye.
 */
export function socialOnlyPersonIds({
  personId,
  connections,
  familyIds,
}: {
  personId: string;
  connections: { person_a_id: string; person_b_id: string }[];
  familyIds: Set<string>;
}): Set<string> {
  const result = new Set<string>();
  connections.forEach((c) => {
    const other = otherParty(c, personId);
    if (other && !familyIds.has(other)) result.add(other);
  });
  return result;
}
