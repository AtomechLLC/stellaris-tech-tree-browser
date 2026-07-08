import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { TechSnapshot, Tech } from "../types/tech-snapshot";
import { layoutTree, type TreeLayout, type LayoutNode } from "../lib/tree/layoutTree";
import { CATEGORY_ORDER, CATEGORY_AREA } from "../lib/graph/categories";
import { TechCard, CARD_W, CARD_H } from "./TechCard";
import { EdgeLayer } from "./EdgeLayer";
import { CategoryNav } from "./CategoryNav";
import { TechTooltip } from "./TechTooltip";
import { Legend } from "./Legend";
import { LoadingOverlay } from "./LoadingOverlay";
import { ErrorOverlay } from "./ErrorOverlay";

/**
 * Interactive DOM tech tree. Runs `layoutTree` once (async ELK), then renders
 * DOM cards + a single-path SVG edge layer inside ONE `.tree-canvas`.
 *
 * PERF: the pan/zoom transform is applied IMPERATIVELY (a ref + direct DOM style
 * write), so dragging never triggers a React re-render — the browser just
 * translates the already-composited layer. Combined with memoized cards/edges,
 * a single edge <path>, and content-visibility on cards, pan/zoom stays smooth
 * at 678 nodes.
 *
 * The left CategoryNav filters which categories render; hovering a card shows a
 * TechTooltip with its detail (like the reference tool).
 */

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 1.15;

type Area = Tech["area"];

type LayoutState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; layout: TreeLayout };

interface Transform {
  x: number;
  y: number;
  scale: number;
}

const DEFAULT_TRANSFORM: Transform = { x: 40, y: 40, scale: 0.4 };
const cssTransform = (t: Transform) =>
  `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

const categoryOf = (n: LayoutNode): string => n.tech.category[0] ?? "";
const catsInArea = (area: Area): string[] =>
  CATEGORY_ORDER.filter((c) => CATEGORY_AREA[c] === area);

export function TechTree({ snapshot }: { snapshot: TechSnapshot }) {
  const [state, setState] = useState<LayoutState>({ status: "loading" });
  const [active, setActive] = useState<Set<string>>(() => new Set<string>(CATEGORY_ORDER));
  const [hover, setHover] = useState<{ tech: Tech; rect: DOMRect } | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<Transform>(DEFAULT_TRANSFORM);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  const iconBase = `/data/${snapshot.meta.gameVersion}/icons`;

  // key → display name, for resolving prerequisite/leadsTo lists in the tooltip.
  const nameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of Object.values(snapshot.techs)) m.set(t.key, t.name);
    return m;
  }, [snapshot]);

  // ── Imperative transform (no React re-render on pan/zoom) ──────────────────
  const applyTransform = useCallback((t: Transform) => {
    transformRef.current = t;
    if (canvasRef.current) canvasRef.current.style.transform = cssTransform(t);
  }, []);

  // Stable ref callback: bind the canvas node and apply the current transform on
  // (re)attach. Stable identity so React only calls it on real mount/unmount.
  const setCanvas = useCallback(
    (el: HTMLDivElement | null) => {
      canvasRef.current = el;
      if (el) el.style.transform = cssTransform(transformRef.current);
    },
    [],
  );

  // One-shot ELK layout inside the loading state (never re-run on pan/zoom/filter).
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    layoutTree(snapshot, CARD_W, CARD_H)
      .then((layout) => {
        if (!cancelled) setState({ status: "ready", layout });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot]);

  const counts = useMemo(() => {
    if (state.status !== "ready") return {};
    const m: Record<string, number> = {};
    for (const n of state.layout.nodes) m[categoryOf(n)] = (m[categoryOf(n)] ?? 0) + 1;
    return m;
  }, [state]);

  const filtered = useMemo(() => {
    if (state.status !== "ready") return null;
    const { layout } = state;
    if (active.size === CATEGORY_ORDER.length) return layout;
    const nodes = layout.nodes.filter((n) => active.has(categoryOf(n)));
    const visible = new Set(nodes.map((n) => n.key));
    const edges = layout.edges.filter((e) => visible.has(e.from) && visible.has(e.to));
    return { ...layout, nodes, edges };
  }, [state, active]);

  // Frame a set of nodes to fill the viewport (used when isolating a category).
  const fitToNodes = useCallback(
    (nodes: LayoutNode[]) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect || nodes.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.w);
        maxY = Math.max(maxY, n.y + n.h);
      }
      const pad = 60;
      const bw = Math.max(1, maxX - minX);
      const bh = Math.max(1, maxY - minY);
      const scale = clampZoom(Math.min((rect.width - pad * 2) / bw, (rect.height - pad * 2) / bh));
      applyTransform({
        scale,
        x: (rect.width - bw * scale) / 2 - minX * scale,
        y: (rect.height - bh * scale) / 2 - minY * scale,
      });
    },
    [applyTransform],
  );

  // ── Filter actions (from CategoryNav) ─────────────────────────────────────
  const onToggleCategory = useCallback((cat: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const onIsolateCategory = useCallback(
    (cat: string) => {
      setActive(new Set([cat]));
      if (state.status === "ready") {
        fitToNodes(state.layout.nodes.filter((n) => categoryOf(n) === cat));
      }
    },
    [state, fitToNodes],
  );

  const onToggleArea = useCallback((area: Area) => {
    const cats = catsInArea(area);
    setActive((prev) => {
      const next = new Set(prev);
      const allOn = cats.every((c) => next.has(c));
      for (const c of cats) {
        if (allOn) next.delete(c);
        else next.add(c);
      }
      return next;
    });
  }, []);

  const onIsolateArea = useCallback(
    (area: Area) => {
      setActive(new Set(catsInArea(area)));
      if (state.status === "ready") {
        fitToNodes(state.layout.nodes.filter((n) => n.tech.area === area));
      }
    },
    [state, fitToNodes],
  );

  const onShowAll = useCallback(() => {
    setActive(new Set(CATEGORY_ORDER));
    applyTransform(DEFAULT_TRANSFORM);
  }, [applyTransform]);

  // ── Hover (tooltip) — stable callbacks so cards stay memoized ──────────────
  const onCardEnter = useCallback((tech: Tech, rect: DOMRect) => {
    setHover({ tech, rect });
  }, []);
  const onCardLeave = useCallback(() => setHover(null), []);

  // ── Pan (imperative — no re-render) ───────────────────────────────────────
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    setHover(null); // hide tooltip while dragging
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: transformRef.current.x,
      originY: transformRef.current.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const t = transformRef.current;
      applyTransform({
        scale: t.scale,
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      });
    },
    [applyTransform],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }, []);

  // ── Zoom toward the cursor (wheel — imperative) ───────────────────────────
  const onWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const t = transformRef.current;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextScale = clampZoom(t.scale * factor);
      const ratio = nextScale / t.scale;
      applyTransform({
        scale: nextScale,
        x: cursorX - (cursorX - t.x) * ratio,
        y: cursorY - (cursorY - t.y) * ratio,
      });
    },
    [applyTransform],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      const cx = rect ? rect.width / 2 : 0;
      const cy = rect ? rect.height / 2 : 0;
      const t = transformRef.current;
      const nextScale = clampZoom(t.scale * factor);
      const ratio = nextScale / t.scale;
      applyTransform({
        scale: nextScale,
        x: cx - (cx - t.x) * ratio,
        y: cy - (cy - t.y) * ratio,
      });
    },
    [applyTransform],
  );

  const resetView = useCallback(() => applyTransform(DEFAULT_TRANSFORM), [applyTransform]);

  // Memoize the card + edge elements against the (stable) filtered layout — NOT
  // the transform (which is imperative now). Filter/hover re-renders reuse these.
  const layoutReady = state.status === "ready" ? filtered ?? state.layout : null;
  const content = useMemo(() => {
    if (!layoutReady) return null;
    return {
      edge: (
        <EdgeLayer
          edges={layoutReady.edges}
          nodes={layoutReady.nodes}
          width={layoutReady.width}
          height={layoutReady.height}
        />
      ),
      cards: layoutReady.nodes.map((node) => (
        <TechCard
          key={node.key}
          tech={node.tech}
          image={node.tech.icon ? `${iconBase}/${node.tech.icon}` : undefined}
          x={node.x}
          y={node.y}
          onEnter={onCardEnter}
          onLeave={onCardLeave}
        />
      )),
    };
  }, [layoutReady, iconBase, onCardEnter, onCardLeave]);

  if (state.status === "loading") return <LoadingOverlay />;
  if (state.status === "error") {
    return <ErrorOverlay onRetry={() => setState({ status: "loading" })} />;
  }

  const layout = filtered ?? state.layout;

  return (
    <div className="tech-tree">
      <CategoryNav
        active={active}
        counts={counts}
        onToggleCategory={onToggleCategory}
        onIsolateCategory={onIsolateCategory}
        onToggleArea={onToggleArea}
        onIsolateArea={onIsolateArea}
        onShowAll={onShowAll}
      />

      <div
        className="tree-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <div
          className="tree-canvas"
          ref={setCanvas}
          style={{
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {content?.edge}
          {content?.cards}
        </div>

        <div className="zoom-controls" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={resetView} aria-label="Reset view">
            ⟲
          </button>
        </div>

        <Legend />
      </div>

      {hover && <TechTooltip tech={hover.tech} nameByKey={nameByKey} anchor={hover.rect} />}
    </div>
  );
}
