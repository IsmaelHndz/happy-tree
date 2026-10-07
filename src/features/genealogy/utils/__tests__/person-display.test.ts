import { describe, expect, it } from "vitest";
import { ageLabel, displayAge, formatLifeDate, personStatus, relativesOf } from "../person-display";

const alive = { isLiving: true, isClaimed: false };

describe("presentación de una persona", () => {
  it("solo los estados especiales se muestran", () => {
    expect(personStatus(alive)).toBeNull();
    expect(personStatus({ ...alive, invitationStatus: "pending" })).toBe("invited");
    expect(personStatus({ ...alive, isClaimed: true, invitationStatus: "pending" })).toBe("claimed");
    expect(personStatus({ isLiving: false, isClaimed: false })).toBe("deceased");
  });

  it("edad al fallecer, o ninguna si no hay fecha de muerte", () => {
    expect(displayAge({ isLiving: false, isClaimed: false, birthDate: "1950-06-01", deathDate: "2010-05-31" })).toBe(59);
    expect(displayAge({ isLiving: false, isClaimed: false, birthDate: "1950-06-01" })).toBeNull();
    expect(displayAge({ ...alive })).toBeNull();
  });

  it("singular y plural", () => {
    expect(ageLabel({ isLiving: false, isClaimed: false, birthDate: "2020-01-01", deathDate: "2021-06-01" })).toBe("1 año");
    expect(ageLabel({ isLiving: false, isClaimed: false, birthDate: "2000-01-01", deathDate: "2010-06-01" })).toBe("10 años");
  });

  it("fechas en español con la precisión disponible", () => {
    expect(formatLifeDate("1978-03-12")).toBe("12 de marzo de 1978");
    expect(formatLifeDate("1978-03")).toBe("marzo de 1978");
    expect(formatLifeDate("1978")).toBe("1978");
    expect(formatLifeDate(null)).toBeNull();
  });
});

describe("familiares para el panel", () => {
  const names: Record<string, string> = { aud: "Audelia", juan: "Juan", mason: "Mason", luis: "Luis", rubi: "Rubi", sixto: "Sixto", ism: "Ismael" };
  const edge = (parentId: string, childId: string) => ({ parentId, childId });
  const parentEdges = [
    edge("aud", "rubi"), edge("mason", "rubi"), edge("aud", "sixto"), edge("mason", "sixto"),
    edge("aud", "luis"), edge("juan", "luis"), edge("rubi", "ism"),
  ];
  const unions = [
    { personAId: "aud", personBId: "mason", unionType: "married" },
    { personAId: "juan", personBId: "aud", unionType: "divorced" },
  ];
  const rel = (personId: string) => relativesOf({ personId, nameOf: (id) => names[id], parentEdges, unions });

  it("padres, hermanos completos y medios hermanos", () => {
    const r = rel("rubi");
    expect(r.parents.map((p) => p.name)).toEqual(["Audelia", "Mason"]);
    expect(r.siblings).toEqual([{ id: "sixto", name: "Sixto" }, { id: "luis", name: "Luis", note: "medio hermano/a" }]);
    expect(r.children.map((c) => c.name)).toEqual(["Ismael"]);
  });

  it("todas las parejas con su tipo de unión", () => {
    expect(rel("aud").partners).toEqual([
      { id: "mason", name: "Mason", note: "casados" },
      { id: "juan", name: "Juan", note: "divorciados" },
    ]);
  });

  it("omite a quien no está disponible en la vista", () => {
    const r = relativesOf({ personId: "ism", nameOf: (id) => (id === "rubi" ? "Rubi" : undefined), parentEdges, unions });
    expect(r.parents).toEqual([{ id: "rubi", name: "Rubi" }]);
    expect(r.siblings).toEqual([]);
  });
});
