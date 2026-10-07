import { describe, expect, it } from "vitest";
import { classifyUnionIssue, partitionUnionsByIntegrity, wouldCreateParentCycle } from "../graph-integrity";
import { getConnectedFamilyIds, inferKinship } from "../kinship-inference";
import { assignGenerations, selectVisibleNodeIds } from "../visible-nodes";
import { computeTreeLayout, TREE_LAYOUT } from "../tree-layout";
import { ALL_IDS, allUnions, corruptUnions, genderOf, parentEdges, personsMap, validUnions } from "./fixtures";

const { validUnions: saneUnions, issues } = partitionUnionsByIntegrity(allUnions, parentEdges);

const label = (target: string, root = "ism") =>
  inferKinship({
    rootPersonId: root,
    targetPersonId: target,
    targetGender: genderOf(target),
    parentEdges,
    unions: saneUnions,
    personsMap,
  }).relationshipLabel;

describe("integridad de uniones", () => {
  it("descarta exactamente las uniones corruptas", () => {
    expect(issues).toHaveLength(corruptUnions.length);
    expect(saneUnions).toHaveLength(validUnions.length);
  });

  it("clasifica cada contradicción biológica", () => {
    expect(classifyUnionIssue("luis", "aud", parentEdges)).toBe("parent_child");
    expect(classifyUnionIssue("ism", "aud", parentEdges)).toBe("ancestor_descendant");
    expect(classifyUnionIssue("ism", "jr", parentEdges)).toBe("siblings");
    expect(classifyUnionIssue("ism", "mia", parentEdges)).toBe("siblings"); // medios hermanos
    expect(classifyUnionIssue("ism", "ism", parentEdges)).toBe("self");
    expect(classifyUnionIssue("ism", "leo", parentEdges)).toBeNull(); // hermanastros no son consanguíneos
    expect(classifyUnionIssue("ism", "sofi", parentEdges)).toBeNull(); // primos: permitido
  });

  it("detecta ciclos generacionales", () => {
    expect(wouldCreateParentCycle("gala", "aud", parentEdges)).toBe(true);
    expect(wouldCreateParentCycle("ism", "ism", parentEdges)).toBe(true);
    expect(wouldCreateParentCycle("juan", "rubi", parentEdges)).toBe(false);
  });
});

describe("generaciones", () => {
  const gens = assignGenerations({ centerPersonId: "ism", parentEdges, unions: saneUnions });

  it("asigna cada persona a su generación real", () => {
    const expected: Record<string, number> = {
      aud: -2, her: -2, juan: -2, pablo: -2, paula: -2,
      rubi: -1, jorge: -1, luis: -1, ivan: -1, tere: -1, pedro: -1, karla: -1, ana: -1, beto: -1, eva: -1, lupe: -1, exeva: -1,
      ism: 0, jr: 0, mia: 0, nico: 0, leo: 0, dani: 0, sofi: 0, lucy: 0, kevin: 0, karen: 0, wendy: 0, jaz: 0,
      kiko: 1, nora: 1, neto: 1,
      gala: 2,
    };
    for (const [id, gen] of Object.entries(expected)) expect([id, gens.get(id)]).toEqual([id, gen]);
  });

  it("la unión corrupta tío–abuela no arrastra al tío a la generación de la abuela", () => {
    const corrupted = assignGenerations({ centerPersonId: "ism", parentEdges, unions: allUnions });
    const sane = assignGenerations({ centerPersonId: "ism", parentEdges, unions: saneUnions });
    expect(sane.get("luis")).toBe(-1);
    // Documenta por qué se sanea antes del BFS (Pitfall 7)
    expect(corrupted.get("luis")).toBeDefined();
  });

  it("no incluye a familias ajenas", () => {
    expect(gens.has("xavi")).toBe(false);
  });
});

describe("personas visibles", () => {
  const visible = (tier: "profile" | "basic" | "intermediate" | "advanced" | "owner") =>
    new Set(selectVisibleNodeIds({ centerPersonId: "ism", parentEdges, unions: saneUnions, tier }).nodeIds);

  it("nivel básico: solo familia de casa", () => {
    const v = visible("basic");
    for (const id of ["ism", "rubi", "jorge", "jr", "mia", "nico", "wendy", "kiko"]) expect(v.has(id)).toBe(true);
    for (const id of ["aud", "luis", "sofi", "pedro", "karla", "gala", "eva"]) expect(v.has(id)).toBe(false);
  });

  it("árbol propio: incluye a toda la familia ensamblada", () => {
    const v = visible("owner");
    const mustSee = [
      "aud", "her", "juan", "pablo", "paula", // abuelos y segundo esposo de la abuela
      "luis", "ivan", "tere", "ana", "beto", "eva", // tíos y tíos políticos
      "pedro", "karla", // padrastro y madrastra
      "leo", "dani", // hermanastros
      "lucy", "sofi", "kevin", "karen", // primos e hijastros del tío
      "kiko", "nora", "gala", "jaz", "neto", // descendientes y parejas
    ];
    for (const id of mustSee) expect([id, v.has(id)]).toEqual([id, true]);
  });

  it("nivel solo ficha: únicamente la persona central, sin familia", () => {
    const res = selectVisibleNodeIds({ centerPersonId: "ism", parentEdges, unions: saneUnions, tier: "profile" });
    expect(res.nodeIds).toEqual(["ism"]);
    expect(res.parentIds).toEqual([]);
    expect(res.spouseIds).toEqual([]);
  });

  it("los niveles son crecientes: ficha ⊂ básico ⊂ intermedio ⊆ avanzado", () => {
    const tiers = ["profile", "basic", "intermediate", "advanced"] as const;
    for (let i = 1; i < tiers.length; i++) {
      const smaller = visible(tiers[i - 1]);
      const bigger = visible(tiers[i]);
      for (const id of smaller) expect([tiers[i], id, bigger.has(id)]).toEqual([tiers[i], id, true]);
    }
    expect(visible("basic").size).toBeGreaterThan(visible("profile").size);
    expect(visible("intermediate").size).toBeGreaterThan(visible("basic").size);
  });

  it("avanzado: exactamente el componente conectado de la persona", () => {
    const component = getConnectedFamilyIds("ism", parentEdges, saneUnions);
    expect(visible("advanced")).toEqual(component);
  });

  it("nunca filtra personas de otras familias", () => {
    for (const tier of ["profile", "basic", "intermediate", "advanced", "owner"] as const) {
      const v = visible(tier);
      for (const id of ["xavi", "xime", "xoel"]) expect(v.has(id)).toBe(false);
    }
  });

  it("persona sin ningún vínculo", () => {
    const res = selectVisibleNodeIds({ centerPersonId: "solo", parentEdges, unions: saneUnions, tier: "owner" });
    expect(res.nodeIds).toEqual(["solo"]);
  });
});

describe("etiquetas de parentesco desde Ismael", () => {
  const cases: Record<string, string> = {
    rubi: "Madre",
    jorge: "Padre",
    jr: "Hermano",
    mia: "Media hermana",
    nico: "Medio hermano",
    aud: "Abuela materna",
    her: "Abuelo materno",
    pablo: "Abuelo paterno",
    juan: "Pareja de tu abuela",
    pedro: "Padrastro",
    karla: "Madrastra",
    wendy: "Esposa",
    kiko: "Hijo",
    nora: "Nuera",
    gala: "Nieta",
    neto: "Sobrino",
    sofi: "Prima hermana",
    kevin: "Hijastro de Luis",
    karen: "Hijastra de Luis",
    leo: "Hermanastro",
    dani: "Hermanastro",
  };
  for (const [id, expected] of Object.entries(cases)) {
    it(`${id} → ${expected}`, () => expect(label(id)).toBe(expected));
  }

  it("tíos por parte de madre, aunque sean medios hermanos de ella", () => {
    expect(label("luis")).toMatch(/^Tío/);
    expect(label("tere")).toMatch(/^Tía/);
  });

  it("es simétrico en relaciones básicas", () => {
    expect(label("ism", "rubi")).toBe("Hijo");
    expect(label("ism", "mia")).toBe("Medio hermano");
    expect(label("ism", "wendy")).toBe("Esposo");
    expect(label("ism", "kiko")).toBe("Padre");
  });

  it("padre de un medio hermano sin unión registrada con la madre", () => {
    const unions = saneUnions.filter((x) => !(x.person_a_id === "rubi" && x.person_b_id === "pedro"));
    const res = inferKinship({ rootPersonId: "ism", targetPersonId: "pedro", targetGender: "male", parentEdges, unions, personsMap });
    expect(res.relationshipLabel).toBe("Padre de tu medio hermano/a");
  });

  it("expareja de la madre con hijos en común", () => {
    const unions = saneUnions.map((x) =>
      x.person_a_id === "rubi" && x.person_b_id === "pedro" ? { ...x, union_type: "separated" } : x
    );
    const res = inferKinship({ rootPersonId: "ism", targetPersonId: "pedro", targetGender: "male", parentEdges, unions, personsMap });
    expect(res.relationshipLabel).toBe("Expareja de tu madre");
  });
});

describe("acomodo visual del árbol", () => {
  const { nodeIds } = selectVisibleNodeIds({ centerPersonId: "ism", parentEdges, unions: saneUnions, tier: "owner" });
  const gens = assignGenerations({ centerPersonId: "ism", parentEdges, unions: saneUnions });
  const visible = new Set(nodeIds);
  const edges = [
    ...parentEdges
      .filter((e) => visible.has(e.parent_id) && visible.has(e.child_id))
      .map((e) => ({ sourceId: e.parent_id, targetId: e.child_id, type: "parent-child" as const })),
    ...saneUnions
      .filter((x) => visible.has(x.person_a_id) && visible.has(x.person_b_id))
      .map((x) => ({ sourceId: x.person_a_id, targetId: x.person_b_id, type: "union" as const })),
  ];
  const pos = computeTreeLayout({
    nodes: nodeIds.map((id) => ({ id, generation: gens.get(id) ?? 0, gender: genderOf(id), firstName: id })),
    edges,
    focusId: "ism",
  });
  const x = (id: string) => pos.get(id)!.x;

  it("posiciona a todas las personas visibles", () => {
    for (const id of nodeIds) expect(pos.has(id)).toBe(true);
  });

  it("no encima tarjetas en ninguna fila", () => {
    const rows = new Map<number, string[]>();
    nodeIds.forEach((id) => rows.set(gens.get(id)!, [...(rows.get(gens.get(id)!) ?? []), id]));
    for (const ids of rows.values()) {
      const xs = ids.map(x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(TREE_LAYOUT.NODE_WIDTH);
    }
  });

  it("filas en orden vertical por generación", () => {
    expect(pos.get("aud")!.y).toBeLessThan(pos.get("rubi")!.y);
    expect(pos.get("rubi")!.y).toBeLessThan(pos.get("ism")!.y);
    expect(pos.get("ism")!.y).toBeLessThan(pos.get("kiko")!.y);
  });

  it("madre a la izquierda y padre a la derecha; ramas sin cruzarse", () => {
    expect(x("rubi")).toBeLessThan(x("jorge"));
    for (const maternal of ["luis", "ivan", "tere", "eva"]) expect(x(maternal)).toBeLessThan(x("rubi"));
    for (const paternal of ["ana", "beto"]) expect(x(paternal)).toBeGreaterThan(x("jorge"));
  });

  it("nadie queda entre una persona y su nueva pareja", () => {
    for (const [a, b] of [["pedro", "rubi"], ["karla", "jorge"], ["juan", "aud"], ["eva", "luis"], ["wendy", "ism"]]) {
      const [lo, hi] = [Math.min(x(a), x(b)), Math.max(x(a), x(b))];
      const between = nodeIds.filter((id) => gens.get(id) === gens.get(a) && x(id) > lo && x(id) < hi);
      expect([a, b, between]).toEqual([a, b, []]);
    }
  });

  it("los hijos quedan bajo el punto medio de sus padres (tolerancia de una tarjeta)", () => {
    const center = (id: string) => x(id) + TREE_LAYOUT.NODE_WIDTH / 2;
    const mid = (a: string, b: string) => (center(a) + center(b)) / 2;
    expect(Math.abs(center("kiko") - mid("ism", "wendy"))).toBeLessThanOrEqual(TREE_LAYOUT.NODE_WIDTH);
    expect(Math.abs(center("gala") - mid("kiko", "nora"))).toBeLessThanOrEqual(TREE_LAYOUT.NODE_WIDTH);
  });

  // Fixture extremo (varias familias ensambladas cruzadas): los hijos de una pareja quedan a
  // menos de una tarjeta de su punto medio. Los hijos "solo de" alguien que además tiene hijos
  // con su pareja (p. ej. leo, solo de pedro) compiten por el mismo espacio y se excluyen.
  it("en todas las filas, cada pareja tiene a sus hijos a menos de una tarjeta de su punto medio", () => {
    const center = (id: string) => x(id) + TREE_LAYOUT.NODE_WIDTH / 2;
    const groups = new Map<string, { parents: string[]; kids: string[] }>();
    for (const id of nodeIds) {
      const parents = edges
        .filter((e) => e.type === "parent-child" && e.targetId === id)
        .map((e) => e.sourceId)
        .sort();
      if (parents.length < 2) continue;
      const key = parents.join("_");
      groups.set(key, { parents, kids: [...(groups.get(key)?.kids ?? []), id] });
    }
    const offsets = [...groups.entries()].map(([key, { parents, kids }]) => {
      const parentMid = parents.reduce((s, p) => s + center(p), 0) / parents.length;
      const kidXs = kids.map(center);
      const kidMid = (Math.min(...kidXs) + Math.max(...kidXs)) / 2;
      return [key, Math.round(Math.abs(kidMid - parentMid))] as const;
    });
    const off = offsets.filter(([, d]) => d > TREE_LAYOUT.NODE_WIDTH);
    expect(off).toEqual([]);
  });

  it("los medios hermanos quedan del lado de su progenitor compartido", () => {
    expect(x("mia")).toBeLessThan(x("ism"));
    expect(x("nico")).toBeGreaterThan(x("ism"));
  });

  it("es determinista", () => {
    const again = computeTreeLayout({
      nodes: nodeIds.map((id) => ({ id, generation: gens.get(id) ?? 0, gender: genderOf(id), firstName: id })),
      edges,
      focusId: "ism",
    });
    for (const id of nodeIds) expect(again.get(id)).toEqual(pos.get(id));
  });
});

describe("acomodo: casos límite", () => {
  it("una sola persona", () => {
    const pos = computeTreeLayout({ nodes: [{ id: "a", generation: 0 }], edges: [], focusId: "a" });
    expect(pos.get("a")).toEqual({ x: -TREE_LAYOUT.NODE_WIDTH / 2, y: expect.any(Number) });
  });

  it("persona con tres progenitores registrados (dato erróneo) no rompe el acomodo", () => {
    const pos = computeTreeLayout({
      nodes: [
        { id: "c", generation: 0 },
        { id: "p1", generation: -1, gender: "female" },
        { id: "p2", generation: -1, gender: "male" },
        { id: "p3", generation: -1, gender: "male" },
      ],
      edges: ["p1", "p2", "p3"].map((p) => ({ sourceId: p, targetId: "c", type: "parent-child" as const })),
      focusId: "c",
    });
    expect(pos.size).toBe(4);
  });

  it("aristas hacia personas que no están en el árbol se ignoran", () => {
    const pos = computeTreeLayout({
      nodes: [{ id: "a", generation: 0 }],
      edges: [{ sourceId: "ghost", targetId: "a", type: "parent-child" }],
      focusId: "a",
    });
    expect(pos.size).toBe(1);
  });

  it("árbol grande (≈1,000 personas) en menos de 2 segundos", () => {
    const nodes: { id: string; generation: number }[] = [{ id: "r", generation: 0 }];
    const edges: { sourceId: string; targetId: string; type: "parent-child" | "union" }[] = [];
    let frontier = ["r"];
    for (let g = 1; g <= 4; g++) {
      const next: string[] = [];
      frontier.forEach((p, i) => {
        const spouse = `s${g}-${i}`;
        nodes.push({ id: spouse, generation: g - 1 });
        edges.push({ sourceId: p, targetId: spouse, type: "union" });
        for (let k = 0; k < 5; k++) {
          const c = `${p}-${k}`;
          nodes.push({ id: c, generation: g });
          edges.push({ sourceId: p, targetId: c, type: "parent-child" });
          edges.push({ sourceId: spouse, targetId: c, type: "parent-child" });
          next.push(c);
        }
      });
      frontier = next;
    }
    const start = Date.now();
    const pos = computeTreeLayout({ nodes, edges, focusId: "r" });
    expect(pos.size).toBe(nodes.length);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

it("las identidades de fixtures son únicas", () => {
  expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
});

describe("acomodo: hijos centrados bajo sus padres (árbol real de la captura)", () => {
  // Juan+Audelia → Luis, Everardo, Ivan · Audelia+Mason → Sixto, Rubi · Miguel+Esthela → Jorge, Ana, Miguel Ángel
  // Luis+Eva → Rosita · Sixto+Juanis → Waldo · Rubi+Jorge → Jorge Jr, Ismael · Ana+Roberto → Brian, Laura
  const gen: Record<string, number> = {
    juan: -2, aud: -2, mason: -2, miguel: -2, esthela: -2,
    eva: -1, luis: -1, everardo: -1, ivan: -1, juanis: -1, sixto: -1, rubi: -1, jorge: -1, ana: -1, roberto: -1, miguelangel: -1,
    ruben: -1, analilia: -1,
    rosita: 0, waldo: 0, jorgejr: 0, ism: 0, brian: 0, laura: 0,
  };
  const female = new Set(["aud", "esthela", "eva", "juanis", "rubi", "ana", "rosita", "laura", "analilia"]);
  const kids: [string[], string[]][] = [
    [["juan", "aud"], ["luis", "everardo", "ivan"]],
    [["aud", "mason"], ["sixto", "rubi"]],
    [["miguel", "esthela"], ["jorge", "ruben", "ana", "miguelangel"]],
    [["luis", "eva"], ["rosita"]],
    [["sixto", "juanis"], ["waldo"]],
    [["rubi", "jorge"], ["jorgejr", "ism"]],
    [["ana", "roberto"], ["brian", "laura"]],
  ];
  const edges = [
    ...kids.flatMap(([ps, cs]) => ps.flatMap((p) => cs.map((c) => ({ sourceId: p, targetId: c, type: "parent-child" as const })))),
    ...kids.map(([[a, b]]) => ({ sourceId: a, targetId: b, type: "union" as const })),
    // Miguel Ángel y Ana Lilia: pareja sin hijos
    { sourceId: "miguelangel", targetId: "analilia", type: "union" as const },
  ];
  const pos = computeTreeLayout({
    nodes: Object.keys(gen).map((id) => ({ id, generation: gen[id], gender: female.has(id) ? "female" : "male", firstName: id })),
    edges,
    focusId: "ism",
  });
  const center = (id: string) => pos.get(id)!.x + TREE_LAYOUT.NODE_WIDTH / 2;

  it.each(kids.map(([ps, cs]) => [ps.join("+"), ps, cs] as const))("hijos de %s centrados", (_, ps, cs) => {
    const parentMid = (center(ps[0]) + center(ps[1])) / 2;
    const xs = cs.map(center);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - parentMid)).toBeLessThanOrEqual(2);
  });

  it("ninguna pareja queda separada por otras personas", () => {
    const pairs = edges.filter((e) => e.type === "union").map((e) => [e.sourceId, e.targetId]);
    for (const [a, b] of pairs) {
      const [lo, hi] = [Math.min(center(a), center(b)), Math.max(center(a), center(b))];
      const between = Object.keys(gen).filter((id) => gen[id] === gen[a] && center(id) > lo && center(id) < hi);
      expect([a, b, between]).toEqual([a, b, []]);
    }
  });

  it("la persona foco queda en x = 0", () => {
    expect(center("ism")).toBe(0);
  });
});
