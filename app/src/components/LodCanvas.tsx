import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { RefObject } from "react";
import type { LayoutNode, LayoutEdge } from "../lib/tree/layoutTree";

/**
 * Zoomed-out level-of-detail renderer (map only). When the view is zoomed past
 * the LOD threshold, culling stops helping — the whole tree fits on screen, so
 * hundreds of DOM cards + the full-height SVG edge layer all render and re-paint
 * every pan/zoom frame, which is the one regime where the DOM approach chokes.
 *
 * This draws the ENTIRE field (every node as an icon tile + every edge as a thin
 * straight line) into a SINGLE screen-space <canvas> from the shared imperative
 * transform — no per-card DOM, no giant SVG. It's non-interactive by design:
 * below the LOD threshold cards are tiny tiles nobody clicks, so TechTree swaps
 * the DOM card/edge layers out for this while zoomed out and back in once you
 * zoom past the threshold (where full DOM interactivity resumes).
 */

interface Transform {
  scale: number;
  x: number;
  y: number;
}

export interface LodCanvasHandle {
  draw(): void;
}

interface Props {
  /** ALL layout nodes (this screen-culls internally — no pre-culling needed). */
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** Icon URL base (`${iconBase}/${tech.icon}`). */
  iconBase: string;
  viewportRef: RefObject<HTMLDivElement | null>;
  transformRef: RefObject<Transform>;
  /** Currently selected tech key — drawn with a gold outline. */
  selectedKey?: string | null;
  /** Hit-test-hovered tech key — drawn with a lighter emphasis outline. */
  hoverKey?: string | null;
}

/** Icon cache shared across draws (the browser already has these decoded from
 *  the DOM cards, so hits are instant). */
const iconCache = new Map<string, HTMLImageElement>();

export const LodCanvas = forwardRef<LodCanvasHandle, Props>(function LodCanvas(
  { nodes, edges, iconBase, viewportRef, transformRef, selectedKey, hoverKey },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeByKey = useRef<Map<string, LayoutNode>>(new Map());
  const drawRef = useRef<() => void>(() => {});
  const colors = useRef({
    physics: "#0072b2",
    society: "#e69f00",
    engineering: "#d55e00",
    select: "#ffd23f",
    edge: "#cbd5e1",
    panel: "#161c28",
  });

  // Resolve theme tokens once so the canvas matches the DOM palette (fallbacks
  // keep it sane if a token is renamed).
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    colors.current = {
      physics: get("--area-physics", "#0072b2"),
      society: get("--area-society", "#e69f00"),
      engineering: get("--area-engineering", "#d55e00"),
      select: get("--color-select", "#ffd23f"),
      edge: get("--color-edge", "#cbd5e1"),
      panel: get("--tree-card-bg", "#161c28"),
    };
  }, []);

  useEffect(() => {
    nodeByKey.current = new Map(nodes.map((n) => [n.key, n]));
  }, [nodes]);

  // Fetch (and cache) an icon; trigger a redraw once it decodes so tiles fill in.
  const getIcon = useCallback((src: string): HTMLImageElement => {
    const hit = iconCache.get(src);
    if (hit) return hit;
    const img = new Image();
    img.onload = () => drawRef.current();
    img.src = src;
    iconCache.set(src, img);
    return img;
  }, []);

  const areaColor = useCallback((area: string | undefined): string => {
    const c = colors.current;
    return area === "physics"
      ? c.physics
      : area === "society"
        ? c.society
        : area === "engineering"
          ? c.engineering
          : c.edge;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const vp = viewportRef.current;
    if (!canvas || !vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const C = colors.current;
    const t = transformRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    // Edges: one batched path of straight source-right → target-left lines
    // (elbows are invisible at this zoom, and one stroke is far cheaper).
    ctx.strokeStyle = C.edge;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const e of edges) {
      const a = nodeByKey.current.get(e.from);
      const b = nodeByKey.current.get(e.to);
      if (!a || !b) continue;
      const sx = (a.x + a.w) * t.scale + t.x;
      const sy = (a.y + a.h / 2) * t.scale + t.y;
      const tx = b.x * t.scale + t.x;
      const ty = (b.y + b.h / 2) * t.scale + t.y;
      if ((sx < 0 && tx < 0) || (sy < 0 && ty < 0) || (sx > vw && tx > vw) || (sy > vh && ty > vh)) {
        continue; // both endpoints off the same edge of the screen
      }
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Nodes: icon tile (or a colored square while it loads) + area strip + border.
    for (const n of nodes) {
      const x = n.x * t.scale + t.x;
      const y = n.y * t.scale + t.y;
      const w = n.w * t.scale;
      const h = n.h * t.scale;
      if (x + w < 0 || y + h < 0 || x > vw || y > vh) continue;
      const col = areaColor(n.tech?.area);
      const iconSize = Math.min(h, w);

      ctx.fillStyle = C.panel;
      ctx.fillRect(x, y, w, h);

      const icon = n.tech?.icon ? getIcon(`${iconBase}/${n.tech.icon}`) : null;
      if (icon && icon.complete && icon.naturalWidth > 0) {
        ctx.drawImage(icon, x, y, iconSize, h);
      } else {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, iconSize, h);
        ctx.globalAlpha = 1;
      }

      // Area-colored header strip (the card's title bar, at a glance).
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = col;
      ctx.fillRect(x + iconSize, y, Math.max(0, w - iconSize), Math.max(1, h * 0.32));
      ctx.globalAlpha = 1;

      const selected = n.key === selectedKey || n.tech?.key === selectedKey;
      const hovered = !selected && (n.key === hoverKey || n.tech?.key === hoverKey);
      ctx.strokeStyle = selected || hovered ? C.select : col;
      ctx.lineWidth = selected ? 2 : 1;
      if (hovered) ctx.globalAlpha = 0.8;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (hovered) ctx.globalAlpha = 1;
    }
  }, [nodes, edges, iconBase, viewportRef, transformRef, selectedKey, hoverKey, getIcon, areaColor]);

  drawRef.current = draw;
  useImperativeHandle(ref, () => ({ draw }), [draw]);
  // Redraw when the node/edge set, selection, or size dependencies change.
  useEffect(() => {
    draw();
  }, [draw]);

  return <canvas ref={canvasRef} className="lod-canvas" />;
});
