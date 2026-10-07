import { describe, expect, it } from "vitest";
import { centerOn, fitToBounds, MAX_SCALE, MIN_SCALE, pinch, zoomAt } from "../viewport";

const toScreen = (v: { x: number; y: number; scale: number }, wx: number, wy: number) => [v.x + wx * v.scale, v.y + wy * v.scale];

describe("vista del lienzo", () => {
  it("el zoom no mueve el punto bajo el cursor", () => {
    const view = { x: 100, y: 50, scale: 1 };
    const next = zoomAt(view, 2, 300, 200);
    // El punto del árbol bajo (300, 200) antes del zoom
    const wx = (300 - view.x) / view.scale;
    const wy = (200 - view.y) / view.scale;
    expect(toScreen(next, wx, wy)).toEqual([300, 200]);
    expect(next.scale).toBe(2);
  });

  it("el zoom respeta los límites", () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 100, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 0.001, 0, 0).scale).toBe(MIN_SCALE);
  });

  it("ajustar a la pantalla deja todo el árbol visible y centrado", () => {
    const bounds = { minX: -1000, minY: 0, maxX: 1000, maxY: 600 };
    const v = fitToBounds(bounds, 400, 700, 20);
    const [left, top] = toScreen(v, bounds.minX, bounds.minY);
    const [right, bottom] = toScreen(v, bounds.maxX, bounds.maxY);
    expect(left).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(right).toBeLessThanOrEqual(380 + 1e-9);
    expect(Math.abs(left + right - 400)).toBeLessThan(1e-9);
    expect(Math.abs(top + bottom - 700)).toBeLessThan(1e-9);
  });

  it("un árbol pequeño no se agranda más allá de su tamaño real", () => {
    expect(fitToBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 1200, 800).scale).toBe(1);
  });

  it("centrar en un punto", () => {
    const v = centerOn(84, 88, 200, 300, 1);
    expect(toScreen(v, 84, 88)).toEqual([200, 300]);
  });

  it("pellizco: separar los dedos acerca y el punto medio sigue a los dedos", () => {
    const start = { view: { x: 0, y: 0, scale: 1 }, distance: 100, midX: 200, midY: 200 };
    const v = pinch(start, { distance: 200, midX: 250, midY: 220 });
    expect(v.scale).toBe(2);
    expect(toScreen(v, 200, 200)).toEqual([250, 220]);
  });
});
