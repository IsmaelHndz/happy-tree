// Matemática de la vista del lienzo (pan y zoom), sin dependencias del DOM.
// Un punto del árbol (wx, wy) se ve en pantalla en (x + wx * scale, y + wy * scale).

export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 2.5;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Cambia el zoom manteniendo fijo el punto de pantalla (px, py): lo que estaba bajo el dedo o el cursor no se mueve. */
export function zoomAt(view: View, nextScale: number, px: number, py: number): View {
  const scale = clampScale(nextScale);
  const ratio = scale / view.scale;
  return {
    scale,
    x: px - (px - view.x) * ratio,
    y: py - (py - view.y) * ratio,
  };
}

/** Encuadra todo el árbol dentro del contenedor, con margen, sin pasar de tamaño real. */
export function fitToBounds(bounds: Bounds, width: number, height: number, padding = 32): View {
  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  const scale = clampScale(Math.min(1, availW / contentW, availH / contentH));
  return {
    scale,
    x: (width - contentW * scale) / 2 - bounds.minX * scale,
    y: (height - contentH * scale) / 2 - bounds.minY * scale,
  };
}

/** Centra un punto del árbol en (px, py) de la pantalla con el zoom dado. */
export function centerOn(wx: number, wy: number, px: number, py: number, scale = 1): View {
  const s = clampScale(scale);
  return { scale: s, x: px - wx * s, y: py - wy * s };
}

/** Pellizco con dos dedos: zoom según la distancia entre dedos y desplazamiento según su punto medio. */
export function pinch(
  start: { view: View; distance: number; midX: number; midY: number },
  now: { distance: number; midX: number; midY: number }
): View {
  const scale = clampScale(start.view.scale * (now.distance / Math.max(1, start.distance)));
  // El punto del árbol que estaba bajo el punto medio inicial queda bajo el punto medio actual
  const wx = (start.midX - start.view.x) / start.view.scale;
  const wy = (start.midY - start.view.y) / start.view.scale;
  return { scale, x: now.midX - wx * scale, y: now.midY - wy * scale };
}
