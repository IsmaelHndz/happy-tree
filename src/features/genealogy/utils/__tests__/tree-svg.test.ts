import { describe, expect, it } from "vitest";
import { buildTreeScene, busSegments } from "../tree-scene";
import { buildTreeSvg, escapeXml, wrapName } from "../tree-svg";
import { computeTreeLayout, TREE_LAYOUT } from "../tree-layout";
import type { FamilyGraphData, TreeNodeData } from "../../types/graph.types";

const node = (id: string, firstName: string, x: number, y: number, extra: Partial<TreeNodeData> = {}): TreeNodeData => ({
  id,
  firstName,
  lastName: "Campos",
  gender: "female",
  birthDate: "1990-01-01",
  isLiving: true,
  isClaimed: false,
  generation: 0,
  relationshipLabel: "Prima",
  relationshipCategory: "other",
  validationsCount: 0,
  validationsNeeded: 0,
  isReadyForInvite: false,
  x,
  y,
  ...extra,
});

const graph: FamilyGraphData = {
  nodes: [
    node("mama", "Ana", 0, 0, { relationshipLabel: "Madre", relationshipCategory: "parent" }),
    node("papa", "Juan", 218, 0, { gender: "male", relationshipLabel: "Padre", relationshipCategory: "parent" }),
    node("yo", "Lyndsay <Paola>", 109, 326, { relationshipLabel: "Tú", relationshipCategory: "self", isClaimed: true }),
    node("abuelo", "Mason", 600, 0, { gender: "male", isLiving: false, relationshipLabel: "Abuelo" }),
  ],
  edges: [
    { id: "e1", sourceId: "mama", targetId: "yo", type: "parent-child" },
    { id: "e2", sourceId: "papa", targetId: "yo", type: "parent-child" },
    { id: "u1", sourceId: "mama", targetId: "papa", type: "union", unionType: "married" },
  ],
  focusPerson: { id: "yo", firstName: "Lyndsay", lastName: "Campos", gender: "female", relationshipLabel: "Tú", isSelf: true },
  availableMembers: [],
  isUserZero: false,
};

describe("árbol en SVG para el PDF", () => {
  it("corta nombres largos en dos líneas", () => {
    expect(wrapName("Lyndsay Paola Bernabe Campos")).toEqual(["Lyndsay Paola", "Bernabe Campos"]);
    expect(wrapName("Ana")).toEqual(["Ana"]);
    const long = wrapName("Maria de los Angeles Guadalupe Hernandez Rodriguez");
    expect(long).toHaveLength(2);
    expect(long[1].endsWith("…")).toBe(true);
    expect(long.every((l) => l.length <= 18)).toBe(true);
  });

  it("escapa el texto para que un nombre no rompa el SVG", () => {
    expect(escapeXml(`<a & "b">`)).toBe("&lt;a &amp; &quot;b&quot;&gt;");
    const { svg } = buildTreeSvg(buildTreeScene({ graph, hideSiblingSpouses: true, activeBranchKey: null }), {
      theme: "light",
      title: "Árbol",
      subtitle: "x",
    });
    expect(svg).toContain("Lyndsay &lt;Paola&gt;");
    expect(svg).not.toContain("<Paola>");
  });

  it("el tamaño de la hoja abarca todo el árbol más márgenes", () => {
    const scene = buildTreeScene({ graph, hideSiblingSpouses: true, activeBranchKey: null });
    const { width, height } = buildTreeSvg(scene, { theme: "dark", title: "t", subtitle: "s" });
    expect(width).toBeGreaterThanOrEqual(600 + TREE_LAYOUT.NODE_WIDTH);
    expect(height).toBeGreaterThan(326 + TREE_LAYOUT.NODE_HEIGHT);
  });

  it("los temas cambian el fondo", () => {
    const scene = buildTreeScene({ graph, hideSiblingSpouses: true, activeBranchKey: null });
    expect(buildTreeSvg(scene, { theme: "light", title: "t", subtitle: "s" }).svg).toContain('fill="#ffffff"');
    expect(buildTreeSvg(scene, { theme: "dark", title: "t", subtitle: "s" }).svg).toContain('fill="#0a0a0a"');
  });

  it("respeta el resaltado: lo que no es de la familia sale atenuado", () => {
    const scene = buildTreeScene({ graph, hideSiblingSpouses: true, activeBranchKey: "mama_papa" });
    expect(scene.hasHighlight).toBe(true);
    expect(scene.nodes.find((n) => n.node.id === "abuelo")!.isDimmed).toBe(true);
    expect(scene.nodes.find((n) => n.node.id === "yo")!.isDimmed).toBe(false);
    const { svg } = buildTreeSvg(scene, { theme: "light", title: "t", subtitle: "s" });
    expect(svg).toContain('opacity="0.18"');
  });

  it("solo usa caracteres que las fuentes estándar del PDF pueden escribir", () => {
    const { svg } = buildTreeSvg(buildTreeScene({ graph, hideSiblingSpouses: true, activeBranchKey: null }), {
      theme: "light",
      title: "Árbol familiar de Lyndsay · Extendida",
      subtitle: "6 de octubre de 2026",
    });
    // WinAnsi (Windows-1252): sin "≠", "♥", "✓" ni emojis
    expect(svg).not.toMatch(/[≠♥✓\u{1F300}-\u{1FAFF}]/u);
  });
});

describe("puentes donde una línea cruza la barra de otra familia", () => {
  it("la barra se interrumpe alrededor de cada cruce", () => {
    expect(busSegments({ busStartX: 0, busEndX: 100, gaps: [50] })).toEqual([[0, 44], [56, 100]]);
    expect(busSegments({ busStartX: 0, busEndX: 100, gaps: [] })).toEqual([[0, 100]]);
    expect(busSegments({ busStartX: 0, busEndX: 100, gaps: [70, 30] })).toEqual([[0, 24], [36, 64], [76, 100]]);
  });

  it("toda línea que atraviesa la barra de otra familia lleva puente", () => {
    // Prieta tiene hijos con "el mocho" y a Jose Luis sola; Jose Luis queda entre sus medios hermanos
    const people: [string, number, "male" | "female"][] = [
      ["prieta", -1, "female"], ["mocho", -1, "male"], ["a", 0, "male"], ["b", 0, "female"], ["joseluis", 0, "male"], ["c", 0, "male"],
    ];
    const edges = [
      ...["a", "b", "joseluis", "c"].map((c, i) => ({ id: `p${i}`, sourceId: "prieta", targetId: c, type: "parent-child" as const })),
      ...["a", "b", "c"].map((c, i) => ({ id: `m${i}`, sourceId: "mocho", targetId: c, type: "parent-child" as const })),
      { id: "u", sourceId: "prieta", targetId: "mocho", type: "union" as const, unionType: "married" as const },
    ];
    const pos = computeTreeLayout({ nodes: people.map(([id, generation, gender]) => ({ id, generation, gender })), edges, focusId: "a" });
    const g: FamilyGraphData = {
      ...graph,
      nodes: people.map(([id, , gender]) => node(id, id, pos.get(id)!.x, pos.get(id)!.y, { gender })),
      edges,
      focusPerson: { ...graph.focusPerson, id: "a" },
    };
    const scene = buildTreeScene({ graph: g, hideSiblingSpouses: true, activeBranchKey: null });
    const shared = scene.buses.find((b) => b.key === "mocho_prieta")!;
    const solo = scene.buses.find((b) => b.key === "prieta")!;
    expect(shared && solo).toBeTruthy();
    // Ninguna línea de la pareja atraviesa sin puente la barra de Prieta sola, y viceversa
    for (const bus of scene.buses) {
      for (const other of scene.buses.filter((o) => o.key !== bus.key)) {
        for (const x of [other.parentMidX, ...other.children.map((c) => c.x)]) {
          const verticalSpans = (x === other.parentMidX ? other.dropStartY : other.busY) < bus.busY && (x === other.parentMidX ? other.busY : other.children.find((c) => c.x === x)!.topY) > bus.busY;
          if (verticalSpans && x > bus.busStartX + 1 && x < bus.busEndX - 1) expect(bus.gaps).toContain(x);
        }
      }
    }
  });
});
