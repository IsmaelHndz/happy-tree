import { describe, expect, it } from "vitest";
import { planLink, type LinkRelation, type PlannerPerson } from "../link-planner";
import { parentsToReplace } from "../parent-replacement";
import { isMissingColumnError } from "../db-errors";
import { formatFullName } from "../../types";
import { genderOf, parentEdges, personsMap, validUnions } from "./fixtures";

const persons = new Map<string, PlannerPerson>(
  Array.from(personsMap.values()).map((p) => [
    p.id,
    { id: p.id, name: `${p.firstName} ${p.lastName}`, gender: p.gender, lockedByOther: false },
  ])
);
persons.set("nuevo", { id: "nuevo", name: "Nuevo Sinpadres", gender: "male", lockedByOther: false });
persons.set("prov", { id: "prov", name: "Progenitor/a Huerta", gender: "unknown", lockedByOther: false });

const plan = (a: string, relation: LinkRelation, b: string, edges = parentEdges, people = persons) =>
  planLink({ personAId: a, personBId: b, relation, persons: people, parentEdges: edges, unions: validUnions });

describe("vincular: padres e hijos", () => {
  it("segundo esposo de la abuela como padre de un tío mal registrado: propone quitar al padre erróneo", () => {
    // Iván quedó registrado como hijo de Audelia y Hernández (error típico al registrar hermanos "completos")
    const edges = [...parentEdges.filter((e) => !(e.parent_id === "juan" && e.child_id === "ivan")), { parent_id: "her", child_id: "ivan" }];
    const p = plan("juan", "parent", "ivan", edges);
    expect(p.errors).toEqual([]);
    expect(p.addParentEdges).toEqual([{ parentId: "juan", childId: "ivan" }]);
    const suggested = p.replaceOptions.filter((o) => o.suggested).map((o) => o.parentId);
    expect(suggested).toEqual(["her"]); // nunca a la madre (Audelia)
  });

  it("'es hijo/a de' es la dirección inversa de 'es padre/madre de'", () => {
    const edges = parentEdges.filter((e) => !(e.parent_id === "juan" && e.child_id === "tere"));
    expect(plan("tere", "child", "juan", edges).addParentEdges).toEqual([{ parentId: "juan", childId: "tere" }]);
  });

  it("bloquea ciclos: un nieto no puede ser padre de su abuela", () => {
    expect(plan("gala", "parent", "aud").errors[0]).toMatch(/ancestro/);
  });

  it("bloquea duplicados", () => {
    expect(plan("rubi", "parent", "ism").errors[0]).toMatch(/ya está registrado/);
  });

  it("bloquea paternidad entre pareja registrada", () => {
    expect(plan("wendy", "parent", "ism").errors[0]).toMatch(/pareja/);
  });

  it("bloquea paternidad entre hermanos", () => {
    expect(plan("jr", "parent", "ism").errors.length).toBeGreaterThan(0);
  });

  it("respeta fichas reclamadas por otra cuenta", () => {
    const locked = new Map(persons);
    locked.set("kiko", { ...locked.get("kiko")!, lockedByOther: true });
    expect(plan("jr", "parent", "kiko", parentEdges, locked).errors[0]).toMatch(/reclamó/);
  });

  it("advierte si quedaría con más de dos progenitores sin sugerencia clara", () => {
    // Nuevo progenitor de género desconocido sobre alguien que ya tiene madre y padre
    const p = plan("prov", "parent", "sofi");
    expect(p.errors).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/más de dos progenitores/);
    expect(p.replaceOptions.map((o) => o.parentId).sort()).toEqual(["ana", "beto"]);
    expect(p.replaceOptions.every((o) => !o.suggested)).toBe(true);
  });
});

describe("vincular: hermanos", () => {
  it("medio hermano por parte de madre recibe solo a la madre", () => {
    const p = plan("nuevo", "sibling_maternal", "ism");
    expect(p.addParentEdges).toEqual([{ parentId: "rubi", childId: "nuevo" }]);
  });

  it("hermano completo recibe a ambos padres", () => {
    const p = plan("nuevo", "sibling_both", "ism");
    expect(p.addParentEdges.map((e) => e.parentId).sort()).toEqual(["jorge", "rubi"]);
  });

  it("funciona en cualquier orden: toma los padres de quien sí los tiene", () => {
    const p = plan("ism", "sibling_paternal", "nuevo");
    expect(p.addParentEdges).toEqual([{ parentId: "jorge", childId: "nuevo" }]);
  });

  it("si ninguno tiene padres, pide registrarlos primero", () => {
    const people = new Map(persons);
    people.set("otro", { id: "otro", name: "Otro Sinpadres", gender: "female", lockedByOther: false });
    expect(plan("nuevo", "sibling_both", "otro", parentEdges, people).errors[0]).toMatch(/Registra primero/);
  });

  it("si ya comparten esos padres lo indica", () => {
    expect(plan("jr", "sibling_both", "ism").errors[0]).toMatch(/ya comparten/);
  });
});

describe("vincular: parejas", () => {
  it("bloquea pareja entre madre e hijo, abuela y nieto, y hermanos", () => {
    expect(plan("luis", "married", "aud").errors[0]).toMatch(/padre\/madre e hijo/);
    expect(plan("ism", "partner", "aud").errors[0]).toMatch(/ancestro/);
    expect(plan("ism", "married", "mia").errors[0]).toMatch(/hermanos/);
  });

  it("permite parejas entre hermanastros (no consanguíneos)", () => {
    expect(plan("ism", "partner", "leo").errors).toEqual([]);
  });

  it("cambiar de casados a divorciados actualiza la unión existente", () => {
    const p = plan("ism", "divorced", "wendy");
    expect(p.union?.existingUnionId).toBeUndefined(); // fixtures sin id
    expect(p.steps[0]).toMatch(/Cambiar la unión/);
  });

  it("misma unión ya registrada es un error", () => {
    expect(plan("ism", "married", "wendy").errors[0]).toMatch(/Ya están registrados/);
  });

  it("expareja sin hijos en común avisa que no se dibuja", () => {
    expect(plan("ism", "divorced", "sofi").warnings[0]).toMatch(/no se dibujan/);
  });

  it("la misma persona dos veces", () => {
    expect(plan("ism", "married", "ism").errors[0]).toMatch(/distintas/);
  });
});

describe("utilidades", () => {
  it("parentsToReplace: mismo género y desconocidos; nunca si el nuevo es desconocido", () => {
    const current = [
      { id: "m", gender: "female" },
      { id: "f", gender: "male" },
      { id: "u", gender: "unknown" },
    ];
    expect(parentsToReplace("male", current).map((p) => p.id)).toEqual(["f", "u"]);
    expect(parentsToReplace("female", current).map((p) => p.id)).toEqual(["m", "u"]);
    expect(parentsToReplace("unknown", current)).toEqual([]);
    expect(parentsToReplace("male", current, ["f"]).map((p) => p.id)).toEqual(["u"]);
  });

  it("isMissingColumnError reconoce errores de Postgres y PostgREST", () => {
    expect(isMissingColumnError({ code: "42703", message: 'column "middle_name" does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'middle_name' column of 'persons' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });

  it("formatFullName omite partes vacías", () => {
    expect(formatFullName({ firstName: "Jorge", middleName: "Andrés", lastName: "Zamora", maternalLastName: "Pérez" })).toBe(
      "Jorge Andrés Zamora Pérez"
    );
    expect(formatFullName({ firstName: "Rubi", middleName: null, lastName: "Hernández", maternalLastName: "" })).toBe(
      "Rubi Hernández"
    );
  });

  it("géneros de fixtures coherentes", () => {
    expect(genderOf("rubi")).toBe("female");
  });
});
