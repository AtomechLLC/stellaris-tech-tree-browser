import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { TechSnapshot, Tech } from "../types/tech-snapshot";
import { layoutTree, type TreeLayout, type LayoutNode } from "../lib/tree/layoutTree";
import { layoutExplore } from "../lib/tree/exploreLayout";
import { CATEGORY_ORDER, CATEGORY_AREA } from "../lib/graph/categories";
import { TechCard, CARD_W, CARD_H } from "./TechCard";
import { EdgeLayer } from "./EdgeLayer";
import { BandLayer } from "./BandLayer";
import { CategoryNav } from "./CategoryNav";
import { TechTooltip } from "./TechTooltip";
import { AncestryPanel } from "./AncestryPanel";
import { FindOverlay, type FindEntry } from "./FindOverlay";
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

/** Which of the two views is showing: the banded swimlane Map, or the
 *  collapsible forward Explore tree. */
type ViewMode = "map" | "explore";

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
  // The selected card's on-screen rect — the ancestry panel anchors to its
  // left, like the tooltip anchors to a hovered card. Captured after render.
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);
  // Re-pack busy state (button label + guard). Bumped each time a re-pack
  // starts; the resolving handler ignores its result if this changed meanwhile
  // (stale-result guard) so a rapid re-toggle+re-pack can't swap in old layout.
  const [repacking, setRepacking] = useState(false);
  const repackSeq = useRef(0);
  // F-Find overlay open state (quick 260708-4y2).
  const [findOpen, setFindOpen] = useState(false);
  // Which view is active (quick 260708-5di). "map" = the banded swimlane ELK
  // layout; "explore" = the pure collapsible forward tree from the roots.
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  // Explore-mode expand state: the set of tech keys currently expanded (open).
  // Collapsed by default → Explore opens at just the entry-point techs.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());

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

  // Flattened, searchable list of ALL techs (incl. filter-hidden ones) for the
  // F-Find overlay — so you can find + reveal a tech even if its category is
  // toggled off. Sorted by name for a stable result order.
  const findEntries = useMemo<FindEntry[]>(() => {
    return Object.values(snapshot.techs)
      .map((t) => ({
        key: t.key,
        name: t.name,
        category: t.category[0] ?? "",
        tier: t.tier,
        area: t.area,
        icon: t.icon,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
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

  // Explore-mode layout: a PURE, SYNCHRONOUS collapsible forward tree (no ELK),
  // recomputed on each expand/collapse (cheap). Respects the active category
  // filter internally. Only consumed when viewMode === "explore" (still cheap
  // to memo unconditionally — it's a plain DFS over the reverse-prereq map).
  const exploreLayout = useMemo(
    () => layoutExplore(snapshot, expandedKeys, active, CARD_W, CARD_H),
    [snapshot, expandedKeys, active],
  );

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

  // Toggle: when every category is already on, clicking "Show all" clears them
  // all (everything off); otherwise it turns everything on. Only reset the
  // camera on the show-all direction — clearing shouldn't yank the view.
  const onShowAll = useCallback(() => {
    const turnOff = active.size === CATEGORY_ORDER.length;
    setActive(turnOff ? new Set<string>() : new Set(CATEGORY_ORDER));
    if (!turnOff) applyTransform(DEFAULT_TRANSFORM);
  }, [active, applyTransform]);

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

  // F opens the find overlay. Ignore it when typing in a form field (so 'f'
  // inside the find box or any input types a letter, not a re-open) and when
  // the overlay is already open, and require no modifier keys.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (findOpen) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setFindOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [findOpen]);

  // Find → jump: select the tech, reveal its category if filtered out, and
  // pan/zoom-frame it via the existing fitToNodes (look the node up in the full
  // layout so a filter-hidden tech is still framable). Then close the overlay.
  const onPick = useCallback(
    (key: string) => {
      const tech = techByKey.get(key);
      if (tech) {
        const cat = tech.category[0] ?? "";
        // Un-hide the tech's category if it's currently filtered out.
        setActive((prev) => {
          if (!cat || prev.has(cat)) return prev;
          const next = new Set(prev);
          next.add(cat);
          return next;
        });
      }
      setSelectedKey(key);
      if (state.status === "ready") {
        const node = state.layout.nodes.find((n) => n.key === key);
        if (node) fitToNodes([node]);
      }
      setFindOpen(false);
    },
    [techByKey, state, fitToNodes],
  );

  // Clicking empty viewport background (not a card) clears the selection. A
  // real drag is also suppressed here via movedRef so panning doesn't deselect.
  const onViewportClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (movedRef.current) return;
    if ((e.target as HTMLElement).closest(".tech-card")) return;
    setSelectedKey(null);
  }, []);

  // Capture the selected card's on-screen rect so the ancestry panel can anchor
  // to its left. Runs after the DOM commit (post-render), reading the actual
  // `.tech-card[data-key]` box. Cleared when nothing is selected. (Pan/zoom are
  // imperative and don't re-run this, so the panel anchors at selection time —
  // acceptable, mirroring the hover tooltip's fixed anchor.)
  useLayoutEffect(() => {
    if (!selectedKey) {
      setSelectedRect(null);
      return;
    }
    const el = viewportRef.current?.querySelector<HTMLElement>(
      `.tech-card[data-key="${CSS.escape(selectedKey)}"]`,
    );
    setSelectedRect(el ? el.getBoundingClientRect() : null);
  }, [selectedKey]);

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
    // NOTE: do NOT setPointerCapture here. Capturing on pointerdown makes the
    // browser synthesize the trailing `click` on the capture target (the
    // viewport) instead of the card under the cursor, so card clicks never
    // fire (cards become unselectable). Capture is deferred to onPointerMove,
    // the moment the gesture is confirmed a real drag past the threshold.
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
        // Now that it's a confirmed drag, capture the pointer so panning keeps
        // tracking even if the cursor leaves the viewport. Deferring capture to
        // here (not pointerdown) is what keeps a pure click landing on the card
        // — see the note in onPointerDown.
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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

  // ── Explore mode (quick 260708-5di) ───────────────────────────────────────
  // Reverse-prereq map (tech key → the techs it unlocks), used to prune a
  // collapsed node's now-hidden descendants from expandedKeys.
  const childrenByKey = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of Object.values(snapshot.techs)) {
      for (const prereq of t.prerequisites) {
        if (!snapshot.techs[prereq]) continue;
        const bucket = m.get(prereq);
        if (bucket) bucket.push(t.key);
        else m.set(prereq, [t.key]);
      }
    }
    return m;
  }, [snapshot]);

  // Toggle a node's expansion. Expanding just adds the key. Collapsing removes
  // the key AND every descendant reachable through still-expanded nodes — so
  // re-expanding later starts fresh (its subtree isn't silently pre-opened).
  const onToggleExpand = useCallback(
    (key: string) => {
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        if (!next.has(key)) {
          next.add(key);
          return next;
        }
        // Collapse: BFS the currently-expanded subtree and drop every node in it.
        next.delete(key);
        const queue = [key];
        while (queue.length > 0) {
          const cur = queue.shift()!;
          for (const child of childrenByKey.get(cur) ?? []) {
            if (next.delete(child)) queue.push(child);
          }
        }
        return next;
      });
    },
    [childrenByKey],
  );

  // Switch views. Entering Explore fits/resets to the collapsed root column;
  // returning to Map restores its default frame. (Selection/filter persist.)
  const onSelectView = useCallback(
    (mode: ViewMode) => {
      setViewMode((prev) => {
        if (prev === mode) return prev;
        if (mode === "explore") {
          // Frame the collapsed explore roots after the switch commits.
          requestAnimationFrame(() => {
            if (exploreLayout.nodes.length > 0) fitToNodes(exploreLayout.nodes);
            else resetView();
          });
        } else {
          applyTransform(DEFAULT_TRANSFORM);
        }
        return mode;
      });
    },
    [exploreLayout, fitToNodes, resetView, applyTransform],
  );

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

  // The layout feeding the canvas: the banded map layout in Map mode, the pure
  // collapsible tree in Explore mode. Both are the same TreeLayout shape, so the
  // SAME cards + EdgeLayer + viewport transform render either one.
  const layoutReady =
    state.status !== "ready"
      ? null
      : viewMode === "explore"
        ? exploreLayout
        : filtered ?? state.layout;
  const explore = viewMode === "explore";
  const content = useMemo(() => {
    if (!layoutReady) return null;
    return {
      // Bands are MAP-ONLY — Explore renders no band/watermark backgrounds.
      bands: explore ? null : (
        <BandLayer bands={layoutReady.bands} width={layoutReady.width} />
      ),
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
          // Explore-mode-only expand affordance. Map mode passes nothing →
          // node.expandable is undefined → the chevron never renders.
          expandable={explore ? node.expandable : undefined}
          expanded={explore ? node.expanded : undefined}
          onToggleExpand={explore ? onToggleExpand : undefined}
        />
      )),
    };
    // `selectedKey` in deps means only the 2 changed cards re-render on a
    // selection change (React.memo bails the rest); hover/pan never touch
    // selectedKey so they still reuse this memo cheaply.
  }, [
    layoutReady,
    explore,
    iconBase,
    onCardEnter,
    onCardLeave,
    selectedKey,
    onSelect,
    onToggleExpand,
  ]);

  if (state.status === "loading") return <LoadingOverlay />;
  if (state.status === "error") {
    return <ErrorOverlay onRetry={() => setState({ status: "loading" })} />;
  }

  const layout = explore ? exploreLayout : filtered ?? state.layout;

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

        {/* View toggle (quick 260708-5di): Map (banded swimlanes) ↔ Explore
            (collapsible forward tree). Top-left of the viewport. */}
        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className="view-toggle__btn"
            data-active={viewMode === "map" ? "" : undefined}
            aria-pressed={viewMode === "map"}
            onClick={() => onSelectView("map")}
          >
            Map
          </button>
          <button
            type="button"
            className="view-toggle__btn"
            data-active={viewMode === "explore" ? "" : undefined}
            aria-pressed={viewMode === "explore"}
            onClick={() => onSelectView("explore")}
          >
            Explore
          </button>
        </div>

        {/* Re-pack is MAP-ONLY — the explore tree has no bands to close up. */}
        {!explore && (
          <button
            type="button"
            className="repack-button"
            onClick={onRepack}
            disabled={repacking}
            aria-busy={repacking}
          >
            {repacking ? "Re-packing…" : "Re-pack layout"}
          </button>
        )}

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
      </div>

      {/* Ancestry drill-down is MAP-ONLY: it reveals filter-hidden PREREQUISITE
          chains, which is a swimlane-map concern. Explore is a forward tree, so
          the panel is suppressed there (selection/highlight still work). */}
      {!explore && selectedKey && selectedRect && (
        <AncestryPanel
          selectedKey={selectedKey}
          active={active}
          techByKey={techByKey}
          iconBase={iconBase}
          anchor={selectedRect}
          onEnter={onCardEnter}
          onLeave={onCardLeave}
          onSelect={onSelect}
        />
      )}

      {hover && (
        <TechTooltip
          tech={hover.tech}
          techByKey={techByKey}
          iconBase={iconBase}
          anchor={hover.rect}
        />
      )}

      {findOpen && (
        <FindOverlay
          techs={findEntries}
          iconBase={iconBase}
          onPick={onPick}
          onClose={() => setFindOpen(false)}
        />
      )}
    </div>
  );
}
