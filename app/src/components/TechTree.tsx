import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { TechSnapshot, Tech } from "../types/tech-snapshot";
import { layoutTree, type TreeLayout, type LayoutNode } from "../lib/tree/layoutTree";
import { CATEGORY_ORDER, CATEGORY_AREA } from "../lib/graph/categories";
import { TechCard, CARD_W, CARD_H } from "./TechCard";
import { EdgeLayer } from "./EdgeLayer";
import { BandLayer } from "./BandLayer";
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
// Below this zoom, cards drop to a cheap icon-only tile (text is unreadable that
// far out anyway). Toggled as a class on the canvas so panning while zoomed out
// isn't repainting 678 shadowed/textured/texted cards every frame.
const LOD_THRESHOLD = 0.55;
// Pointer travel (px, from the pointerdown origin) beyond which a gesture is a
// drag, not a click — so a pan that ends on a card doesn't select it.
const DRAG_THRESHOLD = 4;

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
  // Click-selected ("targeted") tech key, or null. Selection highlights the
  // card, thickens its prereq/child edges, and (when it has filter-hidden
  // ancestors) opens the ancestry drill-down panel.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Re-pack busy state (button label + guard). Bumped each time a re-pack
  // starts; the resolving handler ignores its result if this changed meanwhile
  // (stale-result guard) so a rapid re-toggle+re-pack can't swap in old layout.
  const [repacking, setRepacking] = useState(false);
  const repackSeq = useRef(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<Transform>(DEFAULT_TRANSFORM);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );
  // True once a pointer drag has moved past the click threshold — read by the
  // card's onSelect so a pan that ends over a card doesn't count as a click.
  const movedRef = useRef(false);

  const iconBase = `/data/${snapshot.meta.gameVersion}/icons`;

  // key → Tech, for resolving prerequisite/leadsTo names + icons in the tooltip.
  const techByKey = useMemo(() => {
    const m = new Map<string, Tech>();
    for (const t of Object.values(snapshot.techs)) m.set(t.key, t);
    return m;
  }, [snapshot]);

  // ── Imperative transform (no React re-render on pan/zoom) ──────────────────
  const applyTransform = useCallback((t: Transform) => {
    transformRef.current = t;
    const c = canvasRef.current;
    if (c) {
      c.style.transform = cssTransform(t);
      // LOD: pan (scale unchanged) is a no-op toggle; crossing the zoom
      // threshold flips the whole tree between full cards and cheap icon tiles.
      c.classList.toggle("lod-simple", t.scale < LOD_THRESHOLD);
    }
  }, []);

  // Stable ref callback: bind the canvas node and apply the current transform on
  // (re)attach. Stable identity so React only calls it on real mount/unmount.
  const setCanvas = useCallback((el: HTMLDivElement | null) => {
    canvasRef.current = el;
    if (el) {
      const t = transformRef.current;
      el.style.transform = cssTransform(t);
      el.classList.toggle("lod-simple", t.scale < LOD_THRESHOLD);
    }
  }, []);

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
    // Drop toggled-off bands so their tinted backgrounds vanish too (leaving a
    // gap until Re-pack closes it up).
    const bands = layout.bands.filter((b) => active.has(b.category));
    return { ...layout, nodes, edges, bands };
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

  // ── Selection ─────────────────────────────────────────────────────────────
  // Click toggles selection; a drag that ends on a card is suppressed via the
  // movedRef guard. Stable ref so the memoized cards don't re-render on hover/pan.
  const onSelect = useCallback((key: string) => {
    if (movedRef.current) return; // this "click" was actually a drag — ignore
    setSelectedKey((k) => (k === key ? null : key));
  }, []);

  // Escape clears the selection (window listener, mounted once).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Clicking empty viewport background (not a card) clears the selection. A
  // real drag is also suppressed here via movedRef so panning doesn't deselect.
  const onViewportClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (movedRef.current) return;
    if ((e.target as HTMLElement).closest(".tech-card")) return;
    setSelectedKey(null);
  }, []);

  // ── Pan (imperative — no re-render) ───────────────────────────────────────
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    setHover(null); // hide tooltip while dragging
    movedRef.current = false; // reset drag/click discrimination for this gesture
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
      // Once moved past the threshold, mark this gesture a drag so the trailing
      // click on a card is ignored by onSelect.
      if (
        !movedRef.current &&
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD
      ) {
        movedRef.current = true;
      }
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

  // ── Re-pack: re-lay-out only the visible categories so their bands stack
  // with no gaps. Swaps state.layout IN PLACE (status stays "ready", no
  // unmount) and reframes; a stale result (active changed again mid-run) is
  // ignored via a monotonic sequence guard.
  const onRepack = useCallback(() => {
    if (state.status !== "ready" || repacking) return;
    const seq = ++repackSeq.current;
    setRepacking(true);
    layoutTree(snapshot, CARD_W, CARD_H, active)
      .then((layout) => {
        if (seq !== repackSeq.current) return; // stale — a newer re-pack won
        setState({ status: "ready", layout });
        setRepacking(false);
        // Frame the freshly-packed tree.
        if (layout.nodes.length > 0) fitToNodes(layout.nodes);
        else resetView();
      })
      .catch(() => {
        if (seq !== repackSeq.current) return;
        setRepacking(false);
      });
  }, [state.status, repacking, snapshot, active, fitToNodes, resetView]);

  // Memoize the card + edge elements against the (stable) filtered layout — NOT
  // the transform (which is imperative now). Filter/hover re-renders reuse these.
  const layoutReady = state.status === "ready" ? filtered ?? state.layout : null;
  const content = useMemo(() => {
    if (!layoutReady) return null;
    return {
      bands: <BandLayer bands={layoutReady.bands} width={layoutReady.width} />,
      edge: (
        <EdgeLayer
          edges={layoutReady.edges}
          nodes={layoutReady.nodes}
          width={layoutReady.width}
          height={layoutReady.height}
          selectedKey={selectedKey}
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
          selected={node.key === selectedKey}
          onSelect={onSelect}
        />
      )),
    };
    // `selectedKey` in deps means only the 2 changed cards re-render on a
    // selection change (React.memo bails the rest); hover/pan never touch
    // selectedKey so they still reuse this memo cheaply.
  }, [layoutReady, iconBase, onCardEnter, onCardLeave, selectedKey, onSelect]);

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
        onClick={onViewportClick}
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
          {content?.bands}
          {content?.edge}
          {content?.cards}
        </div>

        <button
          type="button"
          className="repack-button"
          onClick={onRepack}
          disabled={repacking}
          aria-busy={repacking}
        >
          {repacking ? "Re-packing…" : "Re-pack layout"}
        </button>

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

      {hover && (
        <TechTooltip
          tech={hover.tech}
          techByKey={techByKey}
          iconBase={iconBase}
          anchor={hover.rect}
        />
      )}
    </div>
  );
}
