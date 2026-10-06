import { describe, expect, it } from "vitest";
import { buildSiblingGroups, DEFAULT_LINE_COLOR, staggerBusRows } from "../sibling-groups";

// Audelia tuvo a luis/eve con Juan y a rubi/sixto con Mason. Rubi tiene a ism (padre fuera de vista).
const names: Record<string, string> = { juan: "Juan", aud: "Audelia", mason: "Mason", rubi: "Rubi" };
const edge = (parentId: string, childId: string) => ({ parentId, childId });
const parentEdges = [
  edge("juan", "luis"), edge("aud", "luis"),
  edge("juan", "eve"), edge("aud", "eve"),
  edge("aud", "rubi"), edge("mason", "rubi"),
  edge("aud", "sixto"), edge("mason", "sixto"),
  edge("rubi", "ism"), edge("jorge", "ism"),
];
const visibleIds = new Set(["juan", "aud", "mason", "luis", "eve", "rubi", "sixto", "ism"]);

const build = (focusId: string) =>
  buildSiblingGroups({ focusId, visibleIds, parentEdges, firstNameOf: (id) => names[id] ?? id });

describe("grupos de hermanos por unión", () => {
  it("agrupa hijos por sus padres visibles", () => {
    const groups = build("sixto");
    expect(groups.map((g) => g.key)).toEqual(["aud_juan", "aud_mason", "rubi"]);
    expect(groups.find((g) => g.key === "aud_juan")!.childIds).toEqual(["luis", "eve"]);
  });

  it("la unión que lleva al foco conserva el verde y la otra recibe un color propio", () => {
    const groups = build("sixto");
    const conMason = groups.find((g) => g.key === "aud_mason")!;
    const conJuan = groups.find((g) => g.key === "aud_juan")!;
    expect(conMason.isDirectLine).toBe(true);
    expect(conMason.color).toBe(DEFAULT_LINE_COLOR);
    expect(conJuan.color).not.toBe(DEFAULT_LINE_COLOR);
  });

  it("etiqueta cada grupo con la pareja que no es compartida", () => {
    const groups = build("sixto");
    expect(groups.find((g) => g.key === "aud_juan")!.label).toBe("con Juan");
    expect(groups.find((g) => g.key === "aud_mason")!.label).toBe("con Mason");
    expect(groups.find((g) => g.key === "rubi")!.label).toBeNull();
    expect(groups.find((g) => g.key === "rubi")!.isMultiPartner).toBe(false);
  });

  it("desde la perspectiva de un medio hermano, su unión es la línea directa", () => {
    const groups = build("luis");
    expect(groups.find((g) => g.key === "aud_juan")!.color).toBe(DEFAULT_LINE_COLOR);
    expect(groups.find((g) => g.key === "aud_mason")!.color).not.toBe(DEFAULT_LINE_COLOR);
  });

  it("tres parejas no repiten color entre grupos que comparten un padre", () => {
    const edges = [...parentEdges, edge("aud", "ana"), edge("pedro", "ana")];
    const groups = buildSiblingGroups({
      focusId: "ism",
      visibleIds: new Set([...visibleIds, "ana", "pedro"]),
      parentEdges: edges,
      firstNameOf: (id) => id,
    });
    const audColors = groups.filter((g) => g.parentIds.includes("aud")).map((g) => g.color);
    expect(new Set(audColors).size).toBe(3);
  });

  it("un hijo con un solo padre visible se marca como 'solo de'", () => {
    const groups = buildSiblingGroups({
      focusId: "sixto",
      visibleIds: new Set([...visibleIds, "ivan"]),
      parentEdges: [...parentEdges, edge("aud", "ivan")],
      firstNameOf: (id) => names[id] ?? id,
    });
    expect(groups.find((g) => g.key === "aud")!.label).toBe("solo de Audelia");
  });
});

describe("barras de hermanos solapadas", () => {
  it("baja la segunda barra si se solapa con la primera en la misma fila", () => {
    const out = staggerBusRows([
      { id: "a", busY: 100, busStartX: 0, busEndX: 300 },
      { id: "b", busY: 100, busStartX: 200, busEndX: 500 },
      { id: "c", busY: 100, busStartX: 600, busEndX: 800 },
    ]);
    const y = Object.fromEntries(out.map((b) => [b.id, b.busY]));
    expect(y).toEqual({ a: 100, b: 114, c: 100 });
  });
});
