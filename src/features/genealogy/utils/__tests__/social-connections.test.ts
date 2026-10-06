import { describe, expect, it } from "vitest";
import { getConnectedFamilyIds } from "../kinship-inference";
import { otherParty, socialOnlyPersonIds } from "../social-connections";
import { isMissingTableError } from "../db-errors";
import { parentEdges, validUnions } from "./fixtures";

const familyIds = getConnectedFamilyIds("ism", parentEdges, validUnions);
const conn = (a: string, b: string) => ({ person_a_id: a, person_b_id: b });

describe("vínculos sociales (amigos y noviazgos)", () => {
  it("otherParty devuelve a la otra persona sin importar el orden", () => {
    expect(otherParty(conn("ism", "lyn"), "ism")).toBe("lyn");
    expect(otherParty(conn("lyn", "ism"), "ism")).toBe("lyn");
    expect(otherParty(conn("lyn", "xavi"), "ism")).toBeNull();
  });

  it("un amigo sin parentesco sale del directorio familiar", () => {
    const ids = socialOnlyPersonIds({ personId: "ism", connections: [conn("ism", "lyn")], familyIds });
    expect(ids.has("lyn")).toBe(true);
  });

  it("un amigo con su propia familia registrada sigue sin ser familia", () => {
    // xavi pertenece a otra familia (con hijos y esposa), no a la de ism
    const ids = socialOnlyPersonIds({ personId: "ism", connections: [conn("xavi", "ism")], familyIds });
    expect(ids.has("xavi")).toBe(true);
  });

  it("un primo que además es amigo sigue en el directorio familiar", () => {
    const ids = socialOnlyPersonIds({ personId: "ism", connections: [conn("ism", "sofi")], familyIds });
    expect(ids.has("sofi")).toBe(false);
  });

  it("los vínculos sociales no unen familias", () => {
    // Aunque ism tenga una amiga o novia, la familia de ella no entra en su componente familiar
    expect(familyIds.has("xavi")).toBe(false);
    expect(familyIds.has("xoel")).toBe(false);
  });

  it("detecta la tabla faltante para pedir la migración", () => {
    expect(isMissingTableError({ code: "PGRST205", message: "Could not find the table 'public.social_connections'" })).toBe(true);
    expect(isMissingTableError({ code: "42P01", message: 'relation "social_connections" does not exist' })).toBe(true);
    expect(isMissingTableError({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});
