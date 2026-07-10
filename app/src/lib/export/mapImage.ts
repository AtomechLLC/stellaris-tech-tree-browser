import type { TreeLayout } from "../tree/layoutTree";

/**
 * Full-map PNG export. Renders the ENTIRE banded layout (band tints + labels +
 * icon tiles, LodCanvas-style) to an offscreen canvas and triggers a download.
 * Tiles only — no edge lines (they read as noise at poster scale, same call as
 * the zoomed-out LOD view).
 *
 * Scale is capped so the bitmap stays well inside browser canvas limits: the
 * map is ~2000×24000 layout units, so 0.5 → ~1000×12000 px (~12MP) — crisp
 * enough to read icons, small enough to encode quickly.
 */

const MAX_DIM = 14000; // px cap per side (hard browser limits are ~16k)
const BASE_SCALE = 0.5;

/** Resolve a CSS custom property from :root with a fallback. */
function token(name: string, fallback: string): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  );
}

/** Load one image, resolving null on failure (placeholder square drawn instead). */
function loadIcon(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function exportMapPng(
  layout: TreeLayout,
  iconBase: string,
  filename: string,
): Promise<void> {
  const scale = Math.min(BASE_SCALE, MAX_DIM / layout.width, MAX_DIM / layout.height);
  const w = Math.ceil(layout.width * scale);
  const h = Math.ceil(layout.height * scale);

  const colors = {
    bg: token("--tree-bg", "#10141c"),
    panel: token("--tree-card-bg", "#232c3d"),
    text: token("--tree-text", "#dbe2ee"),
    physics: token("--area-physics", "#0072b2"),
    society: token("--area-society", "#e69f00"),
    engineering: token("--area-engineering", "#d55e00"),
    border: token("--tree-border", "#38445c"),
  };
  const areaColor = (area: string | undefined): string =>
    area === "physics"
      ? colors.physics
      : area === "society"
        ? colors.society
        : area === "engineering"
          ? colors.engineering
          : colors.border;

  // Preload every distinct icon (browser-cached from the live map, so fast).
  const iconSrcs = new Set<string>();
  for (const n of layout.nodes) if (n.tech?.icon) iconSrcs.add(`${iconBase}/${n.tech.icon}`);
  const loaded = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    [...iconSrcs].map(async (src) => {
      loaded.set(src, await loadIcon(src));
    }),
  );

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);

  // Band tints + labels.
  for (const band of layout.bands) {
    const col = areaColor(band.area);
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = col;
    ctx.fillRect(0, band.top * scale, w, band.height * scale);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = col;
    ctx.font = `600 ${Math.max(11, 21 * scale)}px system-ui, sans-serif`;
    ctx.fillText(band.label.toUpperCase(), 8, band.top * scale + Math.max(14, 26 * scale));
  }
  ctx.globalAlpha = 1;

  // Tiles (LodCanvas look: panel + icon + area header strip + border).
  for (const n of layout.nodes) {
    if (!n.tech) continue;
    const x = n.x * scale;
    const y = n.y * scale;
    const tw = n.w * scale;
    const th = n.h * scale;
    const col = areaColor(n.tech.area);
    const iconSize = Math.min(th, tw);

    ctx.fillStyle = colors.panel;
    ctx.fillRect(x, y, tw, th);

    const icon = n.tech.icon ? loaded.get(`${iconBase}/${n.tech.icon}`) : null;
    if (icon) {
      ctx.drawImage(icon, x, y, iconSize, th);
    } else {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, iconSize, th);
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = col;
    ctx.fillRect(x + iconSize, y, Math.max(0, tw - iconSize), Math.max(1, th * 0.32));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encoding failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
