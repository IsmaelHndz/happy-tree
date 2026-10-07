import { describe, expect, it } from "vitest";
import { buildTreeScene } from "../tree-scene";
import { buildTreeSvg, escapeXml, wrapName } from "../tree-svg";
import { TREE_LAYOUT } from "../tree-layout";
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
