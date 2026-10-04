/**
 * MOTOR DE LAYOUT GENEALÓGICO (puro, sin dependencias de servidor)
 *
 * Diseñado para familias ensambladas / mezcladas: personas con hijos de distintas parejas,
 * medios hermanos maternos y paternos, segundas uniones, etc.
 *
 * Se ejecuta en el servidor (posiciones iniciales en `getFamilyGraph`) y en el cliente
 * (`TreeCanvas`) para recalcular sin huecos cuando se ocultan nodos (p. ej. parejas de hermanos).
 *
 * Algoritmo (forma de "reloj de arena" centrado en la persona foco):
 *
 * 1. ORDEN de cada fila (generación), sin coordenadas todavía:
 *    - Gen -1: orden estructural bilateral (invariante #3):
 *        [tíos maternos (+parejas al exterior)] [otras parejas de la madre] [MADRE] | [PADRE] [otras parejas del padre] [tíos paternos]
 *    - Gen 0: baricentro de los índices de sus progenitores en la fila -1. Así los medios hermanos
 *      maternos quedan a la izquierda, los paternos a la derecha y los primos debajo de sus tíos.
 *      El foco va al final de su grupo de hermanos para que su pareja quede contigua.
 *    - Gen < -1: baricentro de los índices de sus hijos en la fila inferior.
 *    - Gen > 0: baricentro de los índices de sus progenitores en la fila superior.
 *    - Las parejas sin vínculo vertical en la fila (yernos, nueras, tíos políticos, la pareja del foco)
 *      se insertan CONTIGUAS a su pareja. Una persona con varias parejas queda como "eje":
 *      [pareja 2] [persona] [pareja 1], y los hijos de cada unión cuelgan del punto medio correcto.
 *
 * 2. COORDENADAS:
 *    - Gen 0 se empaqueta compacta con la persona foco centrada en x = 0.
 *    - Ancestros (gen < 0), de abajo hacia arriba: cada persona apunta al centro de sus hijos.
 *    - Descendientes (gen > 0), de arriba hacia abajo: cada persona apunta al punto medio de sus
 *      progenitores (invariante #7).
 *    - Las personas sin objetivo (tíos sin hijos visibles, parejas políticas) se "pegan" a su pareja
 *      o al bloque con objetivo más cercano.
 *    - Las colisiones se resuelven con fusión de bloques por mínimos cuadrados (PAVA) respetando
 *      el orden calculado y una separación mínima de GAP_X.
 *
 * Todo es iterativo O(V + E) por fila; no hay recursión (ver Pitfall 1 en AGENTS.md).
 */

export const TREE_LAYOUT = {
  NODE_WIDTH: 220,
  NODE_HEIGHT: 130,
  GAP_X: 50,
  GAP_Y: 150,
} as const;

export interface LayoutNodeInput {
  id: string;
  generation: number;
  gender?: string | null;
  birthDate?: string | null;
  firstName?: string | null;
}

export interface LayoutEdgeInput {
  sourceId: string;
  targetId: string;
  type: "parent-child" | "union";
}

export interface LayoutPosition {
  x: number;
  y: number;
}

type Side = -1 | 0 | 1;

const STEP = TREE_LAYOUT.NODE_WIDTH + TREE_LAYOUT.GAP_X;

export function computeTreeLayout({
  nodes,
  edges,
  focusId,
}: {
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  focusId: string;
}): Map<string, LayoutPosition> {
  const result = new Map<string, LayoutPosition>();
  if (nodes.length === 0) return result;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const genOf = (id: string) => nodeById.get(id)?.generation ?? 0;

  // ---------------------------------------------------------------------------
  // Índices de adyacencia (solo entre nodos presentes)
  // ---------------------------------------------------------------------------
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const partnersOf = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, val: string) => {
    const list = map.get(key);
    if (list) {
      if (!list.includes(val)) list.push(val);
    } else {
      map.set(key, [val]);
    }
  };

  for (const e of edges) {
    if (!nodeById.has(e.sourceId) || !nodeById.has(e.targetId) || e.sourceId === e.targetId) continue;
    if (e.type === "parent-child") {
      push(childrenOf, e.sourceId, e.targetId);
      push(parentsOf, e.targetId, e.sourceId);
    } else {
      push(partnersOf, e.sourceId, e.targetId);
      push(partnersOf, e.targetId, e.sourceId);
    }
  }

  // Co-progenitores sin unión registrada (p. ej. el padre de un medio hermano) se tratan como pareja
  // solo para el acomodo, para que queden contiguos y sus hijos cuelguen entre ambos.
  for (const parents of parentsOf.values()) {
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        const [a, b] = [parents[i], parents[j]];
        if (genOf(a) !== genOf(b)) continue;
        push(partnersOf, a, b);
        push(partnersOf, b, a);
      }
    }
  }

  const getParents = (id: string) => parentsOf.get(id) ?? [];
  const getChildren = (id: string) => childrenOf.get(id) ?? [];
  const getPartners = (id: string) => partnersOf.get(id) ?? [];

  // ---------------------------------------------------------------------------
  // Progenitores del foco y lado (materno -1 / centro 0 / paterno +1) de cada persona
  // ---------------------------------------------------------------------------
  const focusParents = getParents(focusId);
  const motherId =
    focusParents.find((p) => nodeById.get(p)?.gender === "female") ?? focusParents[0];
  const fatherId =
    focusParents.find((p) => p !== motherId && nodeById.get(p)?.gender === "male") ??
    focusParents.find((p) => p !== motherId);

  // Descendientes del foco (siempre al centro)
  const focusDescendants = new Set<string>();
  {
    const queue = [...getChildren(focusId)];
    while (queue.length > 0) {
      const c = queue.shift()!;
      if (focusDescendants.has(c) || c === focusId) continue;
      focusDescendants.add(c);
      queue.push(...getChildren(c));
    }
  }

  // BFS bloqueado: lo alcanzable desde un progenitor sin cruzar al foco, a sus descendientes
  // ni al otro progenitor (aislamiento de la unión de los padres, Pitfall 2).
  const reachFrom = (startId: string | undefined, otherParentId: string | undefined) => {
    const reached = new Set<string>();
    if (!startId) return reached;
    const blocked = new Set<string>([focusId, ...focusDescendants]);
    if (otherParentId) blocked.add(otherParentId);
    const queue = [startId];
    reached.add(startId);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const next of [...getParents(curr), ...getChildren(curr), ...getPartners(curr)]) {
        if (blocked.has(next) || reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }
    return reached;
  };

  const maternalReach = reachFrom(motherId, fatherId);
  const paternalReach = reachFrom(fatherId, motherId);

  const sideOf = (id: string): Side => {
    if (id === motherId) return -1;
    if (id === fatherId) return 1;
    if (id === focusId || focusDescendants.has(id)) return 0;
    const m = maternalReach.has(id);
    const p = paternalReach.has(id);
    if (m && !p) return -1;
    if (p && !m) return 1;
    return 0;
  };

  // ---------------------------------------------------------------------------
  // Utilidades de ordenamiento
  // ---------------------------------------------------------------------------
  const tieBreak = (a: string, b: string) => {
    const na = nodeById.get(a)!;
    const nb = nodeById.get(b)!;
    const ba = na.birthDate || "";
    const bb = nb.birthDate || "";
    if (ba && bb && ba !== bb) return ba < bb ? -1 : 1;
    if (ba && !bb) return -1;
    if (!ba && bb) return 1;
    const fa = (na.firstName || "").toLowerCase();
    const fb = (nb.firstName || "").toLowerCase();
    if (fa !== fb) return fa < fb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

  const gens = Array.from(new Set(nodes.map((n) => n.generation))).sort((a, b) => a - b);
  const minGen = Math.min(...gens, 0);
  const rowsByGen = new Map<number, string[]>();
  for (const n of nodes) {
    const list = rowsByGen.get(n.generation);
    if (list) {
      if (!list.includes(n.id)) list.push(n.id);
    } else {
      rowsByGen.set(n.generation, [n.id]);
    }
  }
  const rowMembers = (gen: number) => rowsByGen.get(gen) ?? [];

  const orders = new Map<number, string[]>();

  /**
   * Inserta en `order` a las personas restantes de la fila que tienen pareja ya colocada,
   * contiguas a ella; las que no tienen relación se mandan a los extremos según su lado.
   */
  const insertAttached = (gen: number, order: string[], remaining: string[]) => {
    const leftCount = new Map<string, number>();
    const rightCount = new Map<string, number>();
    const attachedCount = new Map<string, number>();
    let pending = [...remaining].sort(tieBreak);

    let progress = true;
    while (pending.length > 0 && progress) {
      progress = false;
      const next: string[] = [];
      for (const id of pending) {
        const placedPartners = getPartners(id).filter((p) => order.includes(p));
        if (placedPartners.length === 0) {
          next.push(id);
          continue;
        }
        // Preferir la pareja con vínculo vertical en la fila (primaria) o la primera disponible
        const anchor = placedPartners[0];
        const anchorIdx = order.indexOf(anchor);
        const focusIdx = order.indexOf(focusId);

        let preferred: "L" | "R";
        if (anchor === focusId) preferred = "R";
        else if (focusIdx >= 0) preferred = anchorIdx < focusIdx ? "L" : "R";
        else preferred = sideOf(anchor) === -1 ? "L" : "R";

        const k = attachedCount.get(anchor) ?? 0;
        const sideToUse: "L" | "R" = k % 2 === 0 ? preferred : preferred === "L" ? "R" : "L";
        attachedCount.set(anchor, k + 1);

        if (sideToUse === "L") {
          const lc = leftCount.get(anchor) ?? 0;
          order.splice(anchorIdx - lc, 0, id);
          leftCount.set(anchor, lc + 1);
        } else {
          const rc = rightCount.get(anchor) ?? 0;
          order.splice(anchorIdx + rc + 1, 0, id);
          rightCount.set(anchor, rc + 1);
        }
        progress = true;
      }
      pending = next;
    }

    // Huérfanos de la fila (sin vínculo vertical ni pareja colocada)
    const leftOrphans = pending.filter((id) => sideOf(id) === -1);
    const rightOrphans = pending.filter((id) => sideOf(id) !== -1);
    order.unshift(...leftOrphans);
    order.push(...rightOrphans);
    void gen;
  };

  /** Orden por baricentro respecto a una fila de referencia ya ordenada. */
  const orderByBarycenter = (
    gen: number,
    refOrder: string[],
    relatives: (id: string) => string[],
    extraTie?: (a: string, b: string) => number
  ) => {
    const refIndex = new Map(refOrder.map((id, i) => [id, i]));
    const members = rowMembers(gen);
    const keyed: { id: string; key: number }[] = [];
    const remaining: string[] = [];
    for (const id of members) {
      const idx = relatives(id)
        .map((r) => refIndex.get(r))
        .filter((v): v is number => v !== undefined);
      if (idx.length > 0) keyed.push({ id, key: mean(idx) });
      else remaining.push(id);
    }
    keyed.sort((a, b) => {
      if (Math.abs(a.key - b.key) > 1e-9) return a.key - b.key;
      if (extraTie) {
        const t = extraTie(a.id, b.id);
        if (t !== 0) return t;
      }
      return tieBreak(a.id, b.id);
    });
    const order = keyed.map((k) => k.id);
    insertAttached(gen, order, remaining);
    return order;
  };

  // --- Gen -1: orden estructural bilateral -----------------------------------
  if (rowMembers(-1).length > 0) {
    const members = rowMembers(-1);
    const motherParents = motherId ? getParents(motherId) : [];
    const fatherParents = fatherId ? getParents(fatherId) : [];
    const sharedCount = (id: string, ref: string[]) => getParents(id).filter((p) => ref.includes(p)).length;
    const signature = (id: string) => [...getParents(id)].sort().join("_");

    const used = new Set<string>();
    const maternalUncles = members.filter(
      (id) => id !== motherId && id !== fatherId && motherParents.length > 0 && sharedCount(id, motherParents) > 0
    );
    maternalUncles.forEach((id) => used.add(id));
    const paternalUncles = members.filter(
      (id) =>
        !used.has(id) && id !== motherId && id !== fatherId && fatherParents.length > 0 && sharedCount(id, fatherParents) > 0
    );
    paternalUncles.forEach((id) => used.add(id));

    // Tíos maternos: medios tíos más al exterior (izquierda), hermanos completos junto a la madre
    maternalUncles.sort((a, b) => {
      const d = sharedCount(a, motherParents) - sharedCount(b, motherParents);
      if (d !== 0) return d;
      const sa = signature(a);
      const sb = signature(b);
      if (sa !== sb) return sa < sb ? -1 : 1;
      return tieBreak(a, b);
    });
    // Tíos paternos: hermanos completos junto al padre, medios tíos al exterior (derecha)
    paternalUncles.sort((a, b) => {
      const d = sharedCount(b, fatherParents) - sharedCount(a, fatherParents);
      if (d !== 0) return d;
      const sa = signature(a);
      const sb = signature(b);
      if (sa !== sb) return sa < sb ? -1 : 1;
      return tieBreak(a, b);
    });

    const motherOtherPartners = motherId
      ? getPartners(motherId).filter((p) => p !== fatherId && members.includes(p) && !used.has(p))
      : [];
    motherOtherPartners.forEach((id) => used.add(id));
    const fatherOtherPartners = fatherId
      ? getPartners(fatherId).filter((p) => p !== motherId && members.includes(p) && !used.has(p))
      : [];
    fatherOtherPartners.forEach((id) => used.add(id));

    const order: string[] = [
      ...maternalUncles,
      ...motherOtherPartners.sort(tieBreak),
      ...(motherId && members.includes(motherId) ? [motherId] : []),
      ...(fatherId && members.includes(fatherId) ? [fatherId] : []),
      ...fatherOtherPartners.sort(tieBreak),
      ...paternalUncles,
    ];
    order.forEach((id) => used.add(id));
    insertAttached(-1, order, members.filter((id) => !used.has(id)));
    orders.set(-1, order);
  }

  // --- Gen 0: baricentro de progenitores; el foco cierra su grupo de hermanos -----
  if (rowMembers(0).length > 0) {
    const ref = orders.get(-1) ?? [];
    const focusLast = (a: string, b: string) => (a === focusId ? 1 : b === focusId ? -1 : 0);
    let order = orderByBarycenter(0, ref, getParents, focusLast);
    if (!order.includes(focusId) && nodeById.has(focusId)) {
      order = [focusId, ...order];
    }
    orders.set(0, order);
  }

  // --- Ancestros superiores (gen < -1): baricentro de hijos en la fila inferior ---
  for (let g = -2; g >= minGen; g--) {
    if (rowMembers(g).length === 0) continue;
    const ref = orders.get(g + 1) ?? [];
    const maleFirst = (a: string, b: string) => {
      const ga = nodeById.get(a)?.gender === "male" ? 0 : 1;
      const gb = nodeById.get(b)?.gender === "male" ? 0 : 1;
      return ga - gb;
    };
    orders.set(g, orderByBarycenter(g, ref, getChildren, maleFirst));
  }

  // --- Descendientes (gen > 0): baricentro de progenitores en la fila superior ---
  const maxGen = Math.max(...gens, 0);
  for (let g = 1; g <= maxGen; g++) {
    if (rowMembers(g).length === 0) continue;
    const ref = orders.get(g - 1) ?? [];
    orders.set(g, orderByBarycenter(g, ref, getParents));
  }

  // ---------------------------------------------------------------------------
  // Coordenadas: empaquetado con objetivos + fusión de bloques (PAVA)
  // ---------------------------------------------------------------------------
  const centers = new Map<string, number>();
  const W = TREE_LAYOUT.NODE_WIDTH;

  const packRow = (order: string[], targets: Map<string, number>, fallbackAnchorId?: string) => {
    const n = order.length;
    if (n === 0) return;
    const hasTarget = (i: number) => targets.has(order[i]);
    const anyTarget = order.some((id) => targets.has(id));

    // Dirección de "pegado" para nodos sin objetivo
    const glue: ("L" | "R" | null)[] = new Array(n).fill(null);
    if (anyTarget) {
      for (let i = 0; i < n; i++) {
        if (hasTarget(i)) continue;
        const id = order[i];
        const partners = getPartners(id);
        const leftIsPartner = i > 0 && partners.includes(order[i - 1]);
        const rightIsPartner = i < n - 1 && partners.includes(order[i + 1]);
        if (leftIsPartner && (!rightIsPartner || hasTarget(i - 1))) {
          glue[i] = "L";
          continue;
        }
        if (rightIsPartner) {
          glue[i] = "R";
          continue;
        }
        let dl = Infinity;
        let dr = Infinity;
        for (let j = i - 1; j >= 0; j--) if (hasTarget(j)) { dl = i - j; break; }
        for (let j = i + 1; j < n; j++) if (hasTarget(j)) { dr = j - i; break; }
        glue[i] = dl < dr ? "L" : "R";
        if (dl === Infinity && dr === Infinity) glue[i] = "R";
      }
    }

    type Block = { ids: string[]; constraints: { offset: number; target: number }[]; start: number };
    const solve = (b: Block) => {
      if (b.constraints.length === 0) return b.start;
      return mean(b.constraints.map((c) => c.target - c.offset));
    };

    const blocks: Block[] = [];
    for (let i = 0; i < n; i++) {
      const id = order[i];
      const joinPrev = anyTarget ? i > 0 && (glue[i] === "L" || glue[i - 1] === "R") : i > 0;
      const t = targets.get(id);
      if (joinPrev && blocks.length > 0) {
        const b = blocks[blocks.length - 1];
        const offset = b.ids.length * STEP;
        b.ids.push(id);
        if (t !== undefined) b.constraints.push({ offset, target: t - W / 2 });
      } else {
        blocks.push({ ids: [id], constraints: t !== undefined ? [{ offset: 0, target: t - W / 2 }] : [], start: 0 });
      }
    }

    // Fila sin objetivos: un solo bloque centrado en el ancla (foco) o en x = 0
    if (!anyTarget) {
      const b = blocks[0];
      const anchorIdx = fallbackAnchorId ? b.ids.indexOf(fallbackAnchorId) : -1;
      if (anchorIdx >= 0) {
        b.start = -W / 2 - anchorIdx * STEP;
      } else {
        const width = b.ids.length * STEP - TREE_LAYOUT.GAP_X;
        b.start = -width / 2;
      }
    }

    for (const b of blocks) b.start = solve(b);

    // Fusión de bloques que colisionan, preservando el orden (mínimos cuadrados)
    const stack: Block[] = [];
    for (const b of blocks) {
      stack.push(b);
      while (stack.length >= 2) {
        const top = stack[stack.length - 1];
        const prev = stack[stack.length - 2];
        const prevEnd = prev.start + prev.ids.length * STEP - TREE_LAYOUT.GAP_X;
        if (prevEnd + TREE_LAYOUT.GAP_X <= top.start + 1e-6) break;
        const shift = prev.ids.length * STEP;
        const merged: Block = {
          ids: [...prev.ids, ...top.ids],
          constraints: [...prev.constraints, ...top.constraints.map((c) => ({ offset: c.offset + shift, target: c.target }))],
          start: prev.start,
        };
        merged.start = solve(merged);
        stack.splice(stack.length - 2, 2, merged);
      }
    }

    for (const b of stack) {
      b.ids.forEach((id, k) => centers.set(id, b.start + k * STEP + W / 2));
    }
  };

  // Gen 0: compacta y centrada en la persona foco
  packRow(orders.get(0) ?? [], new Map(), focusId);

  // Ancestros: de abajo hacia arriba, cada quien sobre el centro de sus hijos
  for (let g = -1; g >= minGen; g--) {
    const order = orders.get(g);
    if (!order) continue;
    const targets = new Map<string, number>();
    for (const id of order) {
      const kidCenters = getChildren(id)
        .filter((c) => genOf(c) === g + 1 && centers.has(c))
        .map((c) => centers.get(c)!);
      if (kidCenters.length > 0) targets.set(id, (Math.min(...kidCenters) + Math.max(...kidCenters)) / 2);
    }
    packRow(order, targets);
  }

  // Descendientes: de arriba hacia abajo, cada quien bajo el punto medio de sus progenitores
  for (let g = 1; g <= maxGen; g++) {
    const order = orders.get(g);
    if (!order) continue;
    const targets = new Map<string, number>();
    for (const id of order) {
      const parentCenters = getParents(id)
        .filter((p) => genOf(p) === g - 1 && centers.has(p))
        .map((p) => centers.get(p)!);
      if (parentCenters.length > 0) targets.set(id, mean(parentCenters));
    }
    packRow(order, targets);
  }

  // Filas sin ordenar (generaciones desconectadas) como respaldo
  for (const g of gens) {
    if (orders.has(g)) continue;
    const order = [...rowMembers(g)].sort(tieBreak);
    orders.set(g, order);
    packRow(order, new Map());
  }

  for (const n of nodes) {
    const cx = centers.get(n.id) ?? 0;
    result.set(n.id, {
      x: cx - W / 2,
      y: (n.generation - minGen) * (TREE_LAYOUT.NODE_HEIGHT + TREE_LAYOUT.GAP_Y),
    });
  }

  return result;
}
