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
import { Legend } from "./Legend";
import { LoadingOverlay } from "./LoadingOverlay";
import { ErrorOverlay } from "./ErrorOverlay";

/**
 * Interactive DOM tech tree. Runs `layoutTree` once (async ELK, in an effect),
 * then renders DOM cards + an SVG edge layer inside ONE CSS-transformed
 * `.tree-canvas`. Pan = drag on the viewport (translate state); zoom = wheel
 * toward the cursor + buttons (scale, clamped). Because cards and edges share
 * the canvas coordinate space, pan/zoom is a single CSS transform.
 *
 * The left CategoryNav (quick 260708-2v7) filters which categories render:
 * checkboxes toggle categories on/off (multi-select), clicking a name isolates
 * to just that category (and fits the view to it). Area is conveyed by card
 * color; the layout itself is area-agnostic (ELK optimizes crossings).
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

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

const categoryOf = (n: LayoutNode): string => n.tech.category[0] ?? "";
const catsInArea = (area: Area): string[] =>
  CATEGORY_ORDER.filter((c) => CATEGORY_AREA[c] === area);

export function TechTree({ snapshot }: { snapshot: TechSnapshot }) {
  const [state, setState] = useState<LayoutState>({ status: "loading" });
  const [active, setActive] = useState<Set<string>>(() => new Set<string>(CATEGORY_ORDER));
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  const iconBase = `/data/${snapshot.meta.gameVersion}/icons`;

  // One-shot ELK layout inside the loading state (D-08) — never re-run on
  // pan/zoom/filter. A throw here surfaces the error state, not a blank screen.
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

  // Total tech count per category (stable — from the FULL layout, not filtered).
  const counts = useMemo(() => {
    if (state.status !== "ready") return {};
    const m: Record<string, number> = {};
    for (const n of state.layout.nodes) m[categoryOf(n)] = (m[categoryOf(n)] ?? 0) + 1;
    return m;
  }, [state]);

  // Filter nodes/edges to the active category set (hide, not re-layout — instant).
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
  const fitToNodes = useCallback((nodes: LayoutNode[]) => {
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
    const scale = clampZoom(
      Math.min((rect.width - pad * 2) / bw, (rect.height - pad * 2) / bh),
    );
    setTransform({
      scale,
      x: (rect.width - bw * scale) / 2 - minX * scale,
      y: (rect.height - bh * scale) / 2 - minY * scale,
    });
  }, []);

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
    setTransform(DEFAULT_TRANSFORM);
  }, []);

  // ── Pan (pointer drag on the viewport) ────────────────────────────────────
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: transform.x,
        originY: transform.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [transform.x, transform.y],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setTransform((t) => ({
      ...t,
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    }));
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }, []);

  // ── Zoom toward the cursor (wheel) ────────────────────────────────────────
  const onWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    setTransform((t) => {
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextScale = clampZoom(t.scale * factor);
      const ratio = nextScale / t.scale;
      return {
        scale: nextScale,
        x: cursorX - (cursorX - t.x) * ratio,
        y: cursorY - (cursorY - t.y) * ratio,
      };
    });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 0;
    const cy = rect ? rect.height / 2 : 0;
    setTransform((t) => {
      const nextScale = clampZoom(t.scale * factor);
      const ratio = nextScale / t.scale;
      return {
        scale: nextScale,
        x: cx - (cx - t.x) * ratio,
        y: cy - (cy - t.y) * ratio,
      };
    });
  }, []);

  const resetView = useCallback(() => setTransform(DEFAULT_TRANSFORM), []);

  // Memoize the card + edge elements against the (stable) filtered layout — NOT
  // the transform. A pan/zoom tick then only updates the one canvas transform
  // instead of reconciling hundreds of cards + SVG paths.
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
        />
      )),
    };
  }, [layoutReady, iconBase]);

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
          style={{
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
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
    </div>
  );
}
