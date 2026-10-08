// Reducción de cruces en el orden de las filas del árbol (pura, sin coordenadas).
//
// Dos líneas padre→hijo entre filas vecinas se cruzan cuando sus extremos están en orden
// invertido. Cada hijo cuelga del "punto medio" de sus padres en la fila de arriba (índice
// promedio), igual que en el dibujo con barras de hermanos.
//
// La búsqueda prueba movimientos pequeños sobre el orden de cada fila y se queda con el de
// menos cruces, respetando las reglas del acomodo:
//   - quien estaba junto a su pareja sigue junto a ella (nadie entre una pareja);
//   - en la fila de los padres del foco: madre antes que padre, rama materna a la izquierda
//     de la madre y paterna a la derecha del padre (invariante #3).

export type Orders = Map<number, string[]>;

/** Regla de acomodo elegida por la persona: `left` va a la izquierda de `right` (misma fila). */
// Alias (no interface) para que sea asignable al tipo Json de Supabase
export type LayoutRule = {
  left: string;
  right: string;
};

/** Lee reglas guardadas (JSON de la base) descartando lo que no tenga la forma esperada. */
export function parseLayoutRules(value: unknown): LayoutRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is LayoutRule => typeof r?.left === "string" && typeof r?.right === "string" && r.left !== r.right)
    .map((r) => ({ left: r.left, right: r.right }));
}

/** Agrega una regla quitando antes cualquier regla sobre el mismo par (la nueva manda). */
export function addLayoutRule(rules: LayoutRule[], rule: LayoutRule): LayoutRule[] {
  const samePair = (r: LayoutRule) =>
    (r.left === rule.left && r.right === rule.right) || (r.left === rule.right && r.right === rule.left);
  return [...rules.filter((r) => !samePair(r)), rule];
}

// Cambia cuando cambia el algoritmo de acomodo; se guarda en cada reporte
export const LAYOUT_ALGORITHM_VERSION = "2026-10-08";

export interface CrossingContext {
  getParents: (id: string) => string[];
  getPartners: (id: string) => string[];
  genOf: (id: string) => number;
  motherId?: string;
  fatherId?: string;
  // -1 materno, 1 paterno, 0 centro
  sideOf: (id: string) => -1 | 0 | 1;
  // Reglas manuales que ya se cumplen y deben seguir cumpliéndose
  rules?: LayoutRule[];
}

function rowEdges(order: string[], above: string[], ctx: CrossingContext): [number, number][] {
  const indexAbove = new Map(above.map((id, i) => [id, i]));
  const edges: [number, number][] = [];
  order.forEach((id, i) => {
    const idx = ctx.getParents(id)
      .map((p) => indexAbove.get(p))
      .filter((v): v is number => v !== undefined);
    if (idx.length > 0) edges.push([idx.reduce((s, v) => s + v, 0) / idx.length, i]);
  });
  return edges;
}

/** Cruces entre la fila `g - 1` y la fila `g`. */
export function countRowCrossings(order: string[], above: string[], ctx: CrossingContext): number {
  const edges = rowEdges(order, above, ctx);
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if ((edges[i][0] - edges[j][0]) * (edges[i][1] - edges[j][1]) < 0) crossings++;
    }
  }
  return crossings;
}

export function countCrossings(orders: Orders, ctx: CrossingContext): number {
  let total = 0;
  for (const [g, order] of orders) {
    const above = orders.get(g - 1);
    if (above) total += countRowCrossings(order, above, ctx);
  }
  return total;
}

function adjacentPartnerPairs(order: string[], ctx: CrossingContext): Set<string> {
  const pairs = new Set<string>();
  for (let i = 0; i + 1 < order.length; i++) {
    if (ctx.getPartners(order[i]).includes(order[i + 1])) pairs.add([order[i], order[i + 1]].sort().join("|"));
  }
  return pairs;
}

function isValidRow(order: string[], required: Set<string>, ctx: CrossingContext): boolean {
  const now = adjacentPartnerPairs(order, ctx);
  for (const pair of required) if (!now.has(pair)) return false;
  const { motherId, fatherId } = ctx;
  const mi = motherId ? order.indexOf(motherId) : -1;
  const fi = fatherId ? order.indexOf(fatherId) : -1;
  if (mi >= 0 && fi >= 0 && mi > fi) return false;
  if (mi >= 0 || fi >= 0) {
    for (let i = 0; i < order.length; i++) {
      const side = ctx.sideOf(order[i]);
      if (side === -1 && mi >= 0 && i > mi) return false;
      if (side === 1 && fi >= 0 && i < fi) return false;
    }
  }
  for (const rule of ctx.rules ?? []) {
    const l = order.indexOf(rule.left);
    const r = order.indexOf(rule.right);
    if (l >= 0 && r >= 0 && l > r) return false;
  }
  return true;
}

/**
 * Bloques de una fila: tramos seguidos de hermanos (mismos padres en la fila de arriba).
 * Quien no tiene padres arriba (parejas políticas, la fila superior) va con su pareja.
 */
function rowBlocks(order: string[], above: string[] | undefined, ctx: CrossingContext): [number, number][] {
  const aboveSet = new Set(above ?? []);
  const ownKey = (id: string) => {
    const ps = ctx.getParents(id).filter((p) => aboveSet.has(p));
    return ps.length > 0 ? ps.sort().join("_") : null;
  };
  const keys = order.map((id, i) => {
    const own = ownKey(id);
    if (own) return own;
    // Pareja vecina con padres arriba: se mueve con ella
    for (const j of [i - 1, i + 1]) {
      const n = order[j];
      if (n && ctx.getPartners(id).includes(n)) {
        const k = ownKey(n);
        if (k) return k;
      }
    }
    return `solo:${id}`;
  });
  const blocks: [number, number][] = [];
  let start = 0;
  for (let i = 1; i <= order.length; i++) {
    if (i === order.length || keys[i] !== keys[start]) {
      blocks.push([start, i]);
      start = i;
    }
  }
  return blocks;
}

type Move = { gen: number; apply: (order: string[]) => string[] };

/** Saca el bloque que contiene `id` y lo pone justo antes del bloque que contiene `beforeId`. */
function moveBlockBefore(order: string[], above: string[] | undefined, id: string, beforeId: string, ctx: CrossingContext): string[] {
  const blocks = rowBlocks(order, above, ctx);
  const blockOf = (x: string) => blocks.find(([s, e]) => order.slice(s, e).includes(x));
  const a = blockOf(id);
  const b = blockOf(beforeId);
  if (!a || !b || a === b) return order;
  const moving = order.slice(a[0], a[1]);
  const rest = [...order.slice(0, a[0]), ...order.slice(a[1])];
  const at = rest.indexOf(order[b[0]]);
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/**
 * Aplica las reglas manuales: voltea la pareja o mueve el grupo de hermanos para cumplir
 * cada regla, solo si el resultado sigue respetando las reglas del acomodo. Devuelve las
 * reglas que quedaron cumplidas (las demás no aplican a este árbol o son imposibles).
 */
export function applyLayoutRules(orders: Orders, rules: LayoutRule[], ctx: CrossingContext): { orders: Orders; active: LayoutRule[] } {
  const current: Orders = new Map([...orders].map(([g, o]) => [g, [...o]]));
  const active: LayoutRule[] = [];
  for (const rule of rules) {
    for (const [g, order] of current) {
      const l = order.indexOf(rule.left);
      const r = order.indexOf(rule.right);
      if (l < 0 || r < 0) continue;
      if (l < r) {
        active.push(rule);
        break;
      }
      const required = adjacentPartnerPairs(order, ctx);
      const candidates =
        l === r + 1 && ctx.getPartners(rule.left).includes(rule.right)
          ? [[...order.slice(0, r), rule.left, rule.right, ...order.slice(l + 1)]]
          : [moveBlockBefore(order, current.get(g - 1), rule.left, rule.right, ctx)];
      const next = candidates.find((c) =>
        c.indexOf(rule.left) < c.indexOf(rule.right) && isValidRow(c, required, { ...ctx, rules: active })
      );
      if (next) {
        current.set(g, next);
        active.push(rule);
      }
      break;
    }
  }
  return { orders: current, active };
}

/** Cruces de un acomodo ya calculado (filas por generación, ordenadas por x). */
export function countLayoutCrossings(
  nodes: { id: string; generation: number; x: number }[],
  getParents: (id: string) => string[]
): number {
  const orders: Orders = new Map();
  for (const n of [...nodes].sort((a, b) => a.x - b.x)) {
    orders.set(n.generation, [...(orders.get(n.generation) ?? []), n.id]);
  }
  return countCrossings(orders, { getParents, getPartners: () => [], genOf: () => 0, sideOf: () => 0 });
}

function candidateMoves(orders: Orders, ctx: CrossingContext): Move[] {
  const moves: Move[] = [];
  for (const [gen, order] of orders) {
    // 1. Voltear una pareja (cada quien al otro lado)
    for (let i = 0; i + 1 < order.length; i++) {
      const [a, b] = [order[i], order[i + 1]];
      if (!ctx.getPartners(a).includes(b)) continue;
      moves.push({
        gen,
        apply: (o) => {
          const next = [...o];
          const ia = next.indexOf(a);
          const ib = next.indexOf(b);
          if (Math.abs(ia - ib) !== 1) return next;
          [next[ia], next[ib]] = [next[ib], next[ia]];
          return next;
        },
      });
    }
    // 2. Intercambiar dos bloques vecinos (p. ej. el hijo "solo de" alguien con sus medios hermanos)
    const blocks = rowBlocks(order, orders.get(gen - 1), ctx);
    for (let k = 0; k + 1 < blocks.length; k++) {
      const [s1, e1] = blocks[k];
      const [, e2] = blocks[k + 1];
      const first = order.slice(s1, e1);
      const second = order.slice(e1, e2);
      moves.push({
        gen,
        apply: (o) => {
          const start = o.indexOf(first[0]);
          if (start < 0 || o.slice(start, start + first.length + second.length).join() !== [...first, ...second].join()) return o;
          return [...o.slice(0, start), ...second, ...first, ...o.slice(start + first.length + second.length)];
        },
      });
    }
  }
  return moves;
}

/**
 * Búsqueda local: aplica el primer movimiento (o par de movimientos) que reduce los cruces,
 * hasta que ninguno mejora. Mismo árbol, mismo resultado, salvo que se agote el tope de
 * tiempo (árboles enormes), en cuyo caso se queda con la mejor versión encontrada.
 */
export function reduceCrossings(
  initial: Orders,
  ctx: CrossingContext,
  {
    maxRounds = 60,
    allowPairs = true,
    timeBudgetMs = 120,
  }: { maxRounds?: number; allowPairs?: boolean; timeBudgetMs?: number } = {}
): Orders {
  // Tope de tiempo: si se agota, se queda con lo mejor encontrado hasta ahí
  const deadline = Date.now() + timeBudgetMs;
  let current: Orders = new Map([...initial].map(([g, o]) => [g, [...o]]));
  let score = countCrossings(current, ctx);
  if (score === 0) return current;
  const required = new Map([...current].map(([g, o]) => [g, adjacentPartnerPairs(o, ctx)]));

  const applyMoves = (base: Orders, moves: Move[]) => {
    const next = new Map(base);
    for (const m of moves) next.set(m.gen, m.apply(next.get(m.gen)!));
    return next;
  };
  const valid = (orders: Orders, touched: number[]) =>
    touched.every((g) => isValidRow(orders.get(g)!, required.get(g)!, ctx));

  for (let round = 0; round < maxRounds && score > 0; round++) {
    let improved = false;
    const moves = candidateMoves(current, ctx);
    for (const m of moves) {
      if (Date.now() > deadline) return current;
      const next = applyMoves(current, [m]);
      if (!valid(next, [m.gen])) continue;
      const s = countCrossings(next, ctx);
      if (s < score) {
        current = next;
        score = s;
        improved = true;
        break;
      }
    }
    if (!improved && allowPairs) {
      search: for (const m1 of moves) {
        if (Date.now() > deadline) return current;
        const mid = applyMoves(current, [m1]);
        for (const m2 of candidateMoves(mid, ctx)) {
          if (m2.gen === m1.gen && m2.apply === m1.apply) continue;
          const next = applyMoves(mid, [m2]);
          if (!valid(next, [m1.gen, m2.gen])) continue;
          const s = countCrossings(next, ctx);
          if (s < score) {
            current = next;
            score = s;
            improved = true;
            break search;
          }
        }
      }
    }
    if (!improved) break;
  }
  return current;
}

/**
 * Lo que se puede hacer con una persona en el modo "Acomodar": voltearla con su pareja de al
 * lado o mover su grupo de hermanos un lugar a la izquierda o a la derecha. Cada opción es la
 * regla que lo logra (o ausente si no aplica).
 */
export function arrangeOptions(
  orders: Orders,
  personId: string,
  ctx: Pick<CrossingContext, "getParents" | "getPartners">
): { flip?: LayoutRule; moveLeft?: LayoutRule; moveRight?: LayoutRule } {
  const fullCtx: CrossingContext = { ...ctx, genOf: () => 0, sideOf: () => 0 };
  for (const [g, order] of orders) {
    const i = order.indexOf(personId);
    if (i < 0) continue;
    const options: { flip?: LayoutRule; moveLeft?: LayoutRule; moveRight?: LayoutRule } = {};
    const partners = ctx.getPartners(personId);
    if (order[i + 1] && partners.includes(order[i + 1])) options.flip = { left: order[i + 1], right: personId };
    else if (order[i - 1] && partners.includes(order[i - 1])) options.flip = { left: personId, right: order[i - 1] };
    const block = rowBlocks(order, orders.get(g - 1), fullCtx).find(([s, e]) => i >= s && i < e);
    if (block) {
      const [s, e] = block;
      if (s > 0) options.moveLeft = { left: order[s], right: order[s - 1] };
      if (e < order.length) options.moveRight = { left: order[e], right: order[s] };
    }
    return options;
  }
  return {};
}

/** Orden de cada fila (generación) a partir de las posiciones dibujadas. */
export function ordersFromPositions(nodes: { id: string; generation: number; x?: number }[]): Orders {
  const orders: Orders = new Map();
  for (const n of [...nodes].filter((n) => n.x !== undefined).sort((a, b) => a.x! - b.x!)) {
    orders.set(n.generation, [...(orders.get(n.generation) ?? []), n.id]);
  }
  return orders;
}
