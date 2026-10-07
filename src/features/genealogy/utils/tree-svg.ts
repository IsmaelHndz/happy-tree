// Árbol como SVG autónomo (vista previa y PDF de "Exportar"). Dibuja la misma escena que el
// lienzo: posiciones, colores de familia, uniones y resaltado. Pura, sin DOM.
// Solo usa texto que las fuentes estándar del PDF (WinAnsi) pueden escribir: los íconos
// (corazón, pastel, insignias, "≠") se dibujan como trazos.
import { formatFullName } from "../types";
import { TREE_LAYOUT } from "./tree-layout";
import type { TreeScene } from "./tree-scene";
import { ageLabel, personStatus } from "./person-display";

export type PdfTheme = "light" | "dark";

interface Palette {
  bg: string;
  card: string;
  cardBorder: string;
  centerCard: string;
  centerBorder: string;
  text: string;
  muted: string;
  chipBg: string;
  heartBg: string;
  female: string;
  male: string;
  avatar: { female: string; male: string; other: string };
  avatarText: { female: string; male: string; other: string };
  // Colores de familia más oscuros en papel blanco para que contrasten
  lineColor: (c: string) => string;
}

const LIGHT_LINES: Record<string, string> = {
  "#10b981": "#059669",
  "#38bdf8": "#0284c7",
  "#f59e0b": "#d97706",
  "#a78bfa": "#7c3aed",
  "#fb7185": "#e11d48",
  "#22d3ee": "#0891b2",
  "#a3e635": "#65a30d",
  "#3f3f46": "#a1a1aa",
  "#f472b6": "#db2777",
  "#ec4899": "#db2777",
};

const PALETTES: Record<PdfTheme, Palette> = {
  dark: {
    bg: "#0a0a0a",
    card: "#18181b",
    cardBorder: "#27272a",
    centerCard: "#052e1f",
    centerBorder: "#10b981",
    text: "#f4f4f5",
    muted: "#a1a1aa",
    chipBg: "#0a0a0a",
    heartBg: "#0f172a",
    female: "#f472b6",
    male: "#60a5fa",
    avatar: { female: "#831843", male: "#312e81", other: "#3f3f46" },
    avatarText: { female: "#fce7f3", male: "#e0e7ff", other: "#e4e4e7" },
    lineColor: (c) => c,
  },
  light: {
    bg: "#ffffff",
    card: "#ffffff",
    cardBorder: "#d4d4d8",
    centerCard: "#ecfdf5",
    centerBorder: "#059669",
    text: "#18181b",
    muted: "#52525b",
    chipBg: "#ffffff",
    heartBg: "#ffffff",
    female: "#be185d",
    male: "#1d4ed8",
    avatar: { female: "#fce7f3", male: "#e0e7ff", other: "#e4e4e7" },
    avatarText: { female: "#9d174d", male: "#3730a3", other: "#3f3f46" },
    lineColor: (c) => LIGHT_LINES[c.toLowerCase()] ?? c,
  },
};

const FONT = "Helvetica, Arial, sans-serif";
const MARGIN = 48;
const HEADER = 84;
const FOOTER = 44;
const DIM = 0.18;

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Parte un nombre en hasta `maxLines` líneas de ~`maxChars` caracteres; corta con "…" si no cabe. */
export function wrapName(name: string, maxChars = 18, maxLines = 2): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of name.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  // Lo que no cabe se junta en la última línea y se corta con "…"
  const kept = lines.length > maxLines ? [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")] : lines;
  return kept.map((line) => (line.length > maxChars ? `${line.slice(0, maxChars - 1).trimEnd()}…` : line));
}

const CAKE_PATHS = [
  "M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8",
  "M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1",
  "M2 21h20",
  "M7 8v3",
  "M12 8v3",
  "M17 8v3",
];

export interface TreeSvgOptions {
  theme: PdfTheme;
  title: string;
  subtitle: string;
}

export function buildTreeSvg(scene: TreeScene, { theme, title, subtitle }: TreeSvgOptions): {
  svg: string;
  width: number;
  height: number;
} {
  const p = PALETTES[theme];
  const { NODE_WIDTH: W, NODE_HEIGHT: H } = TREE_LAYOUT;
  const treeW = scene.bounds.maxX - scene.bounds.minX;
  const treeH = scene.bounds.maxY - scene.bounds.minY;
  const width = Math.max(treeW + MARGIN * 2, 760);
  const height = HEADER + treeH + FOOTER + MARGIN * 2;
  // El árbol queda centrado horizontalmente bajo el encabezado
  const tx = (width - treeW) / 2 - scene.bounds.minX;
  const ty = MARGIN + HEADER - scene.bounds.minY;
  const out: string[] = [];
  const op = (dimmed: boolean) => (dimmed ? ` opacity="${DIM}"` : "");

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${p.bg}"/>`,
    `<text x="${MARGIN}" y="${MARGIN + 22}" font-size="22" font-weight="bold" fill="${p.text}">${escapeXml(title)}</text>`,
    `<text x="${MARGIN}" y="${MARGIN + 44}" font-size="12" fill="${p.muted}">${escapeXml(subtitle)}</text>`,
    `<g transform="translate(${tx} ${ty})">`
  );

  // Barras de hermanos
  for (const bus of scene.buses) {
    const c = p.lineColor(bus.color);
    out.push(`<g${op(bus.isDimmed)} stroke="${c}" stroke-width="2.5" stroke-linecap="round" fill="none">`);
    out.push(`<line x1="${bus.parentMidX}" y1="${bus.dropStartY}" x2="${bus.parentMidX}" y2="${bus.busY}"/>`);
    out.push(`<line x1="${bus.busStartX}" y1="${bus.busY}" x2="${bus.busEndX}" y2="${bus.busY}"/>`);
    for (const child of bus.children) {
      out.push(`<line x1="${child.x}" y1="${bus.busY}" x2="${child.x}" y2="${child.topY}"/>`);
    }
    out.push(`</g>`);
    if (bus.label) {
      const labelW = bus.label.length * 6 + 16;
      const ly = (bus.parentMaxY + bus.busY) / 2;
      out.push(
        `<g${op(bus.isDimmed)}>`,
        `<rect x="${bus.parentMidX + 8}" y="${ly - 10}" width="${labelW}" height="20" rx="10" fill="${p.chipBg}" stroke="${c}" stroke-width="1"/>`,
        `<text x="${bus.parentMidX + 8 + labelW / 2}" y="${ly + 4}" font-size="11" text-anchor="middle" fill="${c}">${escapeXml(bus.label)}</text>`,
        `</g>`
      );
    }
  }

  // Uniones
  for (const u of scene.unions) {
    const line = p.lineColor(u.lineColor);
    const ring = p.lineColor(u.ringColor);
    out.push(`<g${op(u.isDimmed)}>`);
    out.push(
      `<line x1="${u.x1}" y1="${u.y1}" x2="${u.x2}" y2="${u.y2}" stroke="${line}" stroke-width="2"${u.isEnded ? ' stroke-dasharray="4 4"' : ""}/>`
    );
    out.push(`<circle cx="${u.midX}" cy="${u.y1}" r="10" fill="${p.heartBg}" stroke="${ring}" stroke-width="1.5"/>`);
    if (u.isEnded) {
      // "≠" dibujado: dos rayas y una diagonal
      out.push(
        `<g stroke="#ef4444" stroke-width="1.6" stroke-linecap="round">`,
        `<line x1="${u.midX - 4}" y1="${u.y1 - 2}" x2="${u.midX + 4}" y2="${u.y1 - 2}"/>`,
        `<line x1="${u.midX - 4}" y1="${u.y1 + 2}" x2="${u.midX + 4}" y2="${u.y1 + 2}"/>`,
        `<line x1="${u.midX + 2.5}" y1="${u.y1 - 5}" x2="${u.midX - 2.5}" y2="${u.y1 + 5}"/>`,
        `</g>`
      );
    } else {
      out.push(
        `<path d="M ${u.midX - 3.5} ${u.y1 - 1.5} a 2 2 0 0 1 3.5 -1.5 a 2 2 0 0 1 3.5 1.5 c 0 2 -3.5 4 -3.5 4 s -3.5 -2 -3.5 -4 z" fill="#ec4899"/>`
      );
    }
    out.push(`</g>`);
  }

  // Tarjetas
  for (const s of scene.nodes) {
    const n = s.node;
    const { x, y } = s;
    const cx = x + W / 2;
    const sex = n.gender === "female" ? "female" : n.gender === "male" ? "male" : "other";
    const status = personStatus(n);
    const age = ageLabel(n);
    const initials = `${n.firstName[0] || ""}${n.lastName[0] || ""}`.toUpperCase();
    const nameLines = wrapName(formatFullName(n));
    const relColor = s.isCenter ? p.lineColor("#10b981") : sex === "female" ? p.female : sex === "male" ? p.male : p.muted;

    out.push(`<g${op(s.isDimmed)}>`);
    out.push(
      `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="16" fill="${s.isCenter ? p.centerCard : p.card}" stroke="${
        s.isCenter ? p.centerBorder : p.cardBorder
      }" stroke-width="${s.isCenter ? 2 : 1}"/>`,
      `<rect x="${x + 24}" y="${y}" width="${W - 48}" height="3" rx="1.5" fill="${p.lineColor(s.stripeColor)}"/>`
    );
    if (s.isCenter) {
      out.push(`<text x="${x + 12}" y="${y + 18}" font-size="8" font-weight="bold" fill="${p.lineColor("#10b981")}">CENTRO</text>`);
    }
    // Avatar e insignia de estado
    const ay = y + 48;
    out.push(
      `<circle cx="${cx}" cy="${ay}" r="28" fill="${p.avatar[sex]}"${status === "deceased" ? ' opacity="0.55"' : ""}${
        s.isCenter ? ` stroke="${p.centerBorder}" stroke-width="3"` : ""
      }/>`,
      `<text x="${cx}" y="${ay + 6}" font-size="16" font-weight="bold" text-anchor="middle" fill="${p.avatarText[sex]}">${escapeXml(initials)}</text>`
    );
    if (status) {
      const bx = cx + 21;
      const by = ay + 21;
      const badgeFill = status === "claimed" ? "#047857" : status === "invited" ? "#b45309" : "#52525b";
      out.push(`<circle cx="${bx}" cy="${by}" r="9" fill="${badgeFill}" stroke="${s.isCenter ? p.centerCard : p.card}" stroke-width="2"/>`);
      if (status === "claimed") {
        out.push(`<path d="M ${bx - 4} ${by} l 2.8 2.8 l 5 -5.2" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
      } else if (status === "invited") {
        out.push(
          `<circle cx="${bx}" cy="${by}" r="4.5" fill="none" stroke="#ffffff" stroke-width="1.3"/>`,
          `<path d="M ${bx} ${by - 2.6} V ${by} l 1.8 1.2" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>`
        );
      } else {
        out.push(`<text x="${bx}" y="${by + 3.5}" font-size="10" font-weight="bold" text-anchor="middle" fill="#ffffff">†</text>`);
      }
    }
    // Nombre (hasta dos líneas), parentesco y edad
    nameLines.forEach((line, i) => {
      out.push(
        `<text x="${cx}" y="${y + 98 + i * 16}" font-size="13" font-weight="bold" text-anchor="middle" fill="${p.text}">${escapeXml(line)}</text>`
      );
    });
    const relY = y + 98 + nameLines.length * 16;
    out.push(`<text x="${cx}" y="${relY}" font-size="11" text-anchor="middle" fill="${relColor}">${escapeXml(n.relationshipLabel)}</text>`);
    if (age) {
      const textW = age.length * 5.6;
      const iconX = cx - (textW + 16) / 2;
      out.push(
        `<g transform="translate(${iconX} ${y + H - 25}) scale(0.5)" fill="none" stroke="${p.muted}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">`,
        ...CAKE_PATHS.map((d) => `<path d="${d}"/>`),
        `</g>`,
        `<text x="${iconX + 16}" y="${y + H - 15}" font-size="11" fill="${p.muted}">${escapeXml(age)}</text>`
      );
    } else {
      out.push(`<text x="${cx}" y="${y + H - 15}" font-size="11" text-anchor="middle" fill="${p.muted}">-</text>`);
    }
    out.push(`</g>`);
  }

  out.push(`</g>`);

  // Leyenda al pie
  const fy = height - MARGIN - 6;
  const legend: { color: string; label: string }[] = [
    { color: "#10b981", label: "Línea directa" },
    { color: "#38bdf8", label: "Otras familias (un color cada una)" },
  ];
  let lx = MARGIN;
  for (const item of legend) {
    out.push(
      `<rect x="${lx}" y="${fy - 6}" width="18" height="4" rx="2" fill="${p.lineColor(item.color)}"/>`,
      `<text x="${lx + 26}" y="${fy}" font-size="11" fill="${p.muted}">${escapeXml(item.label)}</text>`
    );
    lx += 26 + item.label.length * 5.8 + 28;
  }
  out.push(
    `<line x1="${lx}" y1="${fy - 4}" x2="${lx + 18}" y2="${fy - 4}" stroke="#71717a" stroke-width="2" stroke-dasharray="4 4"/>`,
    `<text x="${lx + 26}" y="${fy}" font-size="11" fill="${p.muted}">Separados / divorciados</text>`,
    `<text x="${width - MARGIN}" y="${fy}" font-size="11" text-anchor="end" fill="${p.muted}">Happy Tree</text>`
  );

  out.push(`</svg>`);
  return { svg: out.join(""), width, height };
}
