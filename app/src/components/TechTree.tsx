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
import { layoutExplore, layoutFocus } from "../lib/tree/exploreLayout";
import { CATEGORY_ORDER, CATEGORY_AREA } from "../lib/graph/categories";
import { TechCard, CARD_W, CARD_H } from "./TechCard";
import { BucketCard } from "./BucketCard";
import { EdgeLayer } from "./EdgeLayer";
import { BandLayer } from "./BandLayer";
import { CategoryNav } from "./CategoryNav";
import { EmpirePanel } from "./EmpirePanel";
import type { Bucket } from "../lib/empire/classify";
import { TechTooltip } from "./TechTooltip";
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

/** A snapshot of the navigation state, for the Back (Backspace) history stack. */
interface ViewSnapshot {
  viewMode: ViewMode;
  selectedKey: string | null;
  focusKey: string | null;
  focusExpanded: Set<string>;
  expandedKeys: Set<string>;
  active: Set<string>;
  transform: Transform;
}

const DEFAULT_TRANSFORM: Transform = { x: 40, y: 40, scale: 0.4 };
const cssTransform = (t: Transform) =>
  `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// Synthetic bucket nodes carry no `tech`; they only exist in Explore mode and
// never reach the map-only callers of this helper, so "" is a safe fallback.
const categoryOf = (n: LayoutNode): string => n.tech?.category[0] ?? "";
const catsInArea = (area: Area): string[] =>
  CATEGORY_ORDER.filter((c) => CATEGORY_AREA[c] === area);

// ── Shareable URL state ──────────────────────────────────────────────────────
// The navigation state is mirrored into the URL query string so a shared link
// reproduces the same view: `v=e` (explore; map is the default), `f`/`s` the
// focused / selected tech, `c` the active categories (omitted when all are on),
// `x`/`fx` the browse / focus expansion. Ids are joined with "." (URL-safe —
// tech and category ids never contain a dot).
const URL_SEP = ".";

interface UrlNavState {
  viewMode: ViewMode;
  active: Set<string>;
  selectedKey: string | null;
  focusKey: string | null;
  focusExpanded: Set<string>;
  expandedKeys: Set<string>;
}

/** Parse the current URL into partial nav state, validating ids against the
 *  snapshot / category list (unknown ids are dropped — never throws). */
function parseUrlNav(snapshot: TechSnapshot): Partial<UrlNavState> {
  const p = new URLSearchParams(window.location.search);
  const isTech = (k: string) => snapshot.techs[k] !== undefined;
  const validCats = new Set<string>(CATEGORY_ORDER);
  const techSet = (v: string | null) =>
    v == null ? undefined : new Set(v.split(URL_SEP).filter((k) => k && isTech(k)));

  const out: Partial<UrlNavState> = {};
  if (p.get("v") === "e") out.viewMode = "explore";
  const f = p.get("f");
  if (f && isTech(f)) out.focusKey = f;
  const s = p.get("s");
  if (s && isTech(s)) out.selectedKey = s;
  const c = p.get("c");
  if (c != null) out.active = new Set(c.split(URL_SEP).filter((x) => validCats.has(x)));
  const fx = techSet(p.get("fx"));
  if (fx) out.focusExpanded = fx;
  const x = techSet(p.get("x"));
  if (x) out.expandedKeys = x;
  // A focused tech is always part of its own forward-expansion set.
  if (out.focusKey) (out.focusExpanded ??= new Set()).add(out.focusKey);
  return out;
}

/** Serialize nav state into a query string ("?…" or "") for replaceState. */
function serializeUrlNav(s: UrlNavState): string {
  const p = new URLSearchParams();
  if (s.viewMode === "explore") {
    p.set("v", "e");
    if (s.focusKey) p.set("f", s.focusKey);
    else if (s.expandedKeys.size > 0) p.set("x", [...s.expandedKeys].join(URL_SEP));
    if (s.focusKey && s.focusExpanded.size > 1) {
      p.set("fx", [...s.focusExpanded].join(URL_SEP));
    }
  } else if (s.selectedKey) {
    p.set("s", s.selectedKey);
  }
  if (s.active.size !== CATEGORY_ORDER.length) p.set("c", [...s.active].join(URL_SEP));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function TechTree({ snapshot }: { snapshot: TechSnapshot }) {
  const [state, setState] = useState<LayoutState>({ status: "loading" });
  // Parse the shareable URL ONCE (at mount) to seed the initial nav state below.
  const urlInitRef = useRef<Partial<UrlNavState> | null>(null);
  if (urlInitRef.current === null) urlInitRef.current = parseUrlNav(snapshot);
  const urlInit = urlInitRef.current;
  const [active, setActive] = useState<Set<string>>(
    () => urlInit.active ?? new Set<string>(CATEGORY_ORDER),
  );
  const [hover, setHover] = useState<{ tech: Tech; rect: DOMRect } | null>(null);
  // Click-selected ("targeted") tech key, or null. Selection highlights the
  // card, thickens its prereq/child edges, and (when it has filter-hidden
  // ancestors) opens the ancestry drill-down panel.
  const [selectedKey, setSelectedKey] = useState<string | null>(() => urlInit.selectedKey ?? null);
  // Explore FOCUS target (double-click / find). Separate from `selectedKey`:
  // a single click just highlights + expands in the browse tree, whereas
  // focusing swaps the canvas to the tech's full dependency neighborhood.
  const [focusKey, setFocusKey] = useState<string | null>(() => urlInit.focusKey ?? null);
  // Which nodes are EXPANDED in the focus view's forward (dependents) direction.
  // Seeded to just the focus on entry; a single click in the focus view adds a
  // node so its dependents appear WITHOUT hiding siblings. A double-click
  // re-focuses and resets this to the new focus.
  const [focusExpanded, setFocusExpanded] = useState<Set<string>>(
    () => urlInit.focusExpanded ?? new Set(),
  );
  // View-history stack for the Back (Backspace) shortcut — snapshots of the
  // navigation state pushed before each view change, popped to go back.
  const historyRef = useRef<ViewSnapshot[]>([]);
  // Re-pack busy state (button label + guard). Bumped each time a re-pack
  // starts; the resolving handler ignores its result if this changed meanwhile
  // (stale-result guard) so a rapid re-toggle+re-pack can't swap in old layout.
  const [repacking, setRepacking] = useState(false);
  const repackSeq = useRef(0);
  // F-Find overlay open state (quick 260708-4y2).
  const [findOpen, setFindOpen] = useState(false);
  // Which view is active (quick 260708-5di). "map" = the banded swimlane ELK
  // layout; "explore" = the pure collapsible forward tree from the roots.
  const [viewMode, setViewMode] = useState<ViewMode>(() => urlInit.viewMode ?? "map");
  // Explore-mode expand state: the set of tech keys currently expanded (open).
  // Collapsed by default → Explore opens at just the entry-point techs.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => urlInit.expandedKeys ?? new Set(),
  );
  // ── Saved Empire tab (spike 005) ───────────────────────────────────────────
  // When on, the left panel becomes the empire loader/picker and every card is
  // recolored by its classification bucket for the selected empire. The base
  // layout stays the Map (coloring is orthogonal to layout).
  const [empireOn, setEmpireOn] = useState(false);
  const [bucketMap, setBucketMap] = useState<Map<string, Bucket> | null>(null);
  // Stable callback so <EmpirePanel>'s classify effect isn't re-triggered every render.
  const onBuckets = useCallback((buckets: Map<string, Bucket> | null) => {
    setBucketMap(buckets);
  }, []);

  // Mirror the nav state into the URL (replaceState → shareable link, no history
  // spam). Runs on every nav change; parseUrlNav above restores it on load.
  useEffect(() => {
    const qs = serializeUrlNav({ viewMode, active, selectedKey, focusKey, focusExpanded, expandedKeys });
    window.history.replaceState(null, "", window.location.pathname + qs + window.location.hash);
  }, [viewMode, active, selectedKey, focusKey, focusExpanded, expandedKeys]);

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

  // Explore FOCUS view (quick 260708-7fx): when a real tech is selected in
  // Explore, the canvas switches from the browse spanning tree to the focus
  // tech's full dependency neighborhood — its ENTIRE recursive prerequisite tree
  // fanned out to the left, and the techs that DIRECTLY depend on it to the
  // right, all as real cards with connecting edges. `null` when browsing (no
  // selection) or when the selection isn't a real tech (e.g. a bucket card).
  const exploreFocus = useMemo<TreeLayout | null>(() => {
    if (viewMode !== "explore" || !focusKey) return null;
    if (!snapshot.techs[focusKey]) return null; // bucket keys etc.
    return layoutFocus(snapshot, focusKey, focusExpanded, CARD_W, CARD_H);
  }, [viewMode, focusKey, focusExpanded, snapshot]);

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

  // Auto-frame the focus neighborhood ONLY when the focus tech CHANGES (entering
  // focus, or a double-click re-focus) — "zoom in on this". A single-click
  // expand keeps the same focusKey, so this does NOT re-fit: the tree just grows
  // in place without the viewport jumping. A rAF lets the DOM cards mount first.
  const fitFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!exploreFocus || exploreFocus.nodes.length === 0) {
      fitFocusRef.current = null;
      return;
    }
    if (focusKey === fitFocusRef.current) return; // same focus (an expand) — don't refit
    fitFocusRef.current = focusKey;
    const id = requestAnimationFrame(() => fitToNodes(exploreFocus.nodes));
    return () => cancelAnimationFrame(id);
  }, [exploreFocus, focusKey, fitToNodes]);

  // ── View history (Back / Backspace) ───────────────────────────────────────
  // A live mirror of the navigation state, so a history push captures the
  // CURRENT view without stale-closure hazards. Updated every render.
  const navRef = useRef<ViewSnapshot>({
    viewMode: "map",
    selectedKey: null,
    focusKey: null,
    focusExpanded: new Set(),
    expandedKeys: new Set(),
    active: new Set(CATEGORY_ORDER),
    transform: DEFAULT_TRANSFORM,
  });
  useEffect(() => {
    navRef.current = {
      viewMode,
      selectedKey,
      focusKey,
      focusExpanded,
      expandedKeys,
      active,
      transform: transformRef.current,
    };
  });

  // Snapshot the current view onto the history stack (called before a nav change).
  const pushHistory = useCallback(() => {
    historyRef.current.push({ ...navRef.current });
    if (historyRef.current.length > 100) historyRef.current.shift();
  }, []);

  // Back: pop the last view and restore it exactly (layout + selection + frame).
  // Pre-seed fitFocusRef so the focus auto-fit doesn't override the restored
  // camera when the restored focusKey differs from the current one.
  const onBack = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    fitFocusRef.current = prev.focusKey;
    setViewMode(prev.viewMode);
    setSelectedKey(prev.selectedKey);
    setFocusKey(prev.focusKey);
    setFocusExpanded(prev.focusExpanded);
    setExpandedKeys(prev.expandedKeys);
    setActive(prev.active);
    applyTransform(prev.transform);
  }, [applyTransform]);

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
        fitToNodes(state.layout.nodes.filter((n) => n.tech?.area === area));
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
  // SINGLE click. A drag that ends on a card is suppressed via the movedRef
  // guard. Behaviour by mode:
  //  • Explore FOCUS view → EXPAND the clicked card: reveal its dependents in
  //    place, WITHOUT hiding siblings or re-centering. (Double-click re-focuses.)
  //  • Explore browse tree → highlight + expand the card so its children appear
  //    to the right, without collapsing anything else. Chevron still collapses.
  //  • Map → just highlight (toggle).
  const onSelect = useCallback(
    (key: string) => {
      if (movedRef.current) return; // this "click" was actually a drag — ignore
      pushHistory();
      if (viewMode === "explore" && focusKey) {
        setFocusExpanded((prev) => {
          if (prev.has(key)) return prev;
          const next = new Set(prev);
          next.add(key);
          return next;
        });
        return;
      }
      setSelectedKey((k) => (k === key ? null : key));
      if (viewMode === "explore") {
        setExpandedKeys((prev) => {
          if (prev.has(key)) return prev;
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      }
    },
    [viewMode, focusKey, pushHistory],
  );

  // DOUBLE click "activate": open (or RE-FOCUS) the Explore FOCUS view on this
  // tech — its full dependency tree (recursive prereqs left, dependents right),
  // auto-zoomed. Resets the forward expansion so siblings of the old focus are
  // hidden. From the map this also switches into Explore.
  const onActivate = useCallback(
    (key: string) => {
      if (movedRef.current) return;
      pushHistory();
      setViewMode("explore");
      setFocusKey(key);
      setFocusExpanded(new Set([key]));
    },
    [pushHistory],
  );

  // Deselect: exit any focus view (back to browse) and clear the selection.
  // Shared by the Escape key and the mobile/touch Deselect button.
  const onDeselect = useCallback(() => {
    pushHistory();
    setFocusKey(null);
    setFocusExpanded(new Set());
    setSelectedKey(null);
  }, [pushHistory]);

  // Escape deselects; Backspace goes BACK to the previous view (history). Both
  // ignore keystrokes typed into a form field (e.g. the find box) so they don't
  // hijack editing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "Escape") {
        onDeselect();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDeselect, onBack]);

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
      pushHistory();
      const tech = techByKey.get(key);
      if (tech) {
        // Reveal the tech AND its recursive prerequisites: collect every
        // category on the picked tech's upstream prereq chain and un-hide them
        // all, so a filter-hidden tech shows up together with the path to it.
        const cats = new Set<string>();
        const seen = new Set<string>();
        const stack = [key];
        while (stack.length > 0) {
          const k = stack.pop()!;
          if (seen.has(k)) continue;
          seen.add(k);
          const t = techByKey.get(k);
          if (!t) continue;
          const c = t.category[0] ?? "";
          if (c) cats.add(c);
          for (const p of t.prerequisites) stack.push(p);
        }
        setActive((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const c of cats) if (!next.has(c)) (next.add(c), (changed = true));
          return changed ? next : prev;
        });
      }
      // In Explore, finding a tech opens its FOCUS view (full recursive prereq
      // tree + direct dependents) and the auto-fit effect frames it. In Map,
      // select + frame the picked node directly from the banded layout.
      if (viewMode === "explore") {
        setFocusKey(key);
        setFocusExpanded(new Set([key]));
      } else {
        setSelectedKey(key);
        if (state.status === "ready") {
          const node = state.layout.nodes.find((n) => n.key === key);
          if (node) fitToNodes([node]);
        }
      }
      setFindOpen(false);
    },
    [techByKey, state, fitToNodes, viewMode, pushHistory],
  );

  // Clicking empty viewport background (not a card) clears the selection. A real
  // drag is suppressed via movedRef so panning doesn't reset. EXCEPTION: in the
  // Explore focus view, an empty-space tap is inert — it must NOT act as "back"
  // out of the focused tech (especially on touch, where stray taps are common).
  const onViewportClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (movedRef.current) return;
      if ((e.target as HTMLElement).closest(".tech-card, .bucket-card")) return;
      if (viewMode === "explore" && focusKey) return;
      pushHistory();
      setSelectedKey(null);
      setFocusKey(null);
      setFocusExpanded(new Set());
    },
    [pushHistory, viewMode, focusKey],
  );

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

  // A bucket card's WHOLE box is the toggle, so a pan that ends over one would
  // otherwise fire a click — guard on movedRef exactly like the card onSelect.
  const onBucketToggle = useCallback(
    (key: string) => {
      if (movedRef.current) return;
      onToggleExpand(key);
    },
    [onToggleExpand],
  );

  // "Open all children" (shortcut: C): reveal every tech that directly depends
  // on the currently selected/focused tech. In Explore this expands the tech AND
  // each child (so their subtrees are open); in Map — where every card is already
  // laid out — it un-hides any filtered-out child categories and frames the tech
  // together with its children. No-op when nothing is selected or it's childless.
  const onExpandChildren = useCallback(() => {
    const key = viewMode === "explore" && focusKey ? focusKey : selectedKey;
    if (!key || !snapshot.techs[key]) return;
    const kids = childrenByKey.get(key) ?? [];
    if (kids.length === 0) return;
    pushHistory();
    // Un-hide the children's categories so none stay filtered out of view.
    setActive((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const ck of kids) {
        const c = techByKey.get(ck)?.category[0];
        if (c && !next.has(c)) {
          next.add(c);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    if (viewMode === "explore") {
      const add = (prev: Set<string>) => {
        const next = new Set(prev);
        next.add(key);
        for (const ck of kids) next.add(ck);
        return next;
      };
      if (focusKey) setFocusExpanded(add);
      else setExpandedKeys(add);
    } else if (state.status === "ready") {
      const keys = new Set<string>([key, ...kids]);
      const nodes = state.layout.nodes.filter((n) => keys.has(n.key));
      if (nodes.length > 0) fitToNodes(nodes);
    }
  }, [
    viewMode,
    focusKey,
    selectedKey,
    snapshot,
    childrenByKey,
    techByKey,
    state,
    fitToNodes,
    pushHistory,
  ]);

  // C reveals the selected/focused tech's direct children (see onExpandChildren).
  // Ignored while typing in a form field or with a modifier held.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "c" && e.key !== "C") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      onExpandChildren();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExpandChildren]);

  // Switch views. Entering Explore fits/resets to the collapsed root column;
  // returning to Map restores its default frame. (Selection/filter persist.)
  const onSelectView = useCallback(
    (mode: ViewMode) => {
      if (viewMode === mode) return;
      pushHistory();
      setViewMode(mode);
      setFocusKey(null); // a mode toggle always returns to the browse view
      setFocusExpanded(new Set());
      if (mode === "explore") {
        // Frame the collapsed explore roots after the switch commits.
        requestAnimationFrame(() => {
          if (exploreLayout.nodes.length > 0) fitToNodes(exploreLayout.nodes);
          else resetView();
        });
      } else {
        applyTransform(DEFAULT_TRANSFORM);
      }
    },
    [viewMode, exploreLayout, fitToNodes, resetView, applyTransform, pushHistory],
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
        ? exploreFocus ?? exploreLayout
        : filtered ?? state.layout;
  const explore = viewMode === "explore";
  // In Explore, a focused tech shows its dependency neighborhood (focus view);
  // otherwise the browse spanning tree. `focused` gates chevrons/expansion off.
  const focused = explore && exploreFocus !== null;
  // The card + edges to highlight gold: the focus tech in the focus view, else
  // the single-click selection.
  const highlightKey = focused ? focusKey : selectedKey;
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
          selectedKey={highlightKey}
        />
      ),
      cards: layoutReady.nodes.map((node) =>
        // Synthetic Explore bucket root → a BucketCard (no tech/tooltip/select;
        // click just toggles its expansion). Real tech → the normal TechCard.
        node.bucket ? (
          <BucketCard
            key={node.key}
            nodeKey={node.key}
            bucketId={node.bucket.id}
            label={node.bucket.label}
            descriptor={node.bucket.descriptor}
            count={node.bucket.count}
            x={node.x}
            y={node.y}
            expandable={!!node.expandable}
            expanded={!!node.expanded}
            onToggle={onBucketToggle}
          />
        ) : (
          <TechCard
            key={node.key}
            tech={node.tech!}
            image={node.tech!.icon ? `${iconBase}/${node.tech!.icon}` : undefined}
            costIcon={`${iconBase}/_research_${node.tech!.area}.webp`}
            categoryIcon={
              node.tech!.category[0]
                ? `${iconBase}/_category_${node.tech!.category[0]}.webp`
                : undefined
            }
            x={node.x}
            y={node.y}
            onEnter={onCardEnter}
            onLeave={onCardLeave}
            selected={node.key === highlightKey}
            onSelect={onSelect}
            onActivate={onActivate}
            // Chevron/expansion belong to the Explore BROWSE tree only. The focus
            // view is a static neighborhood (no chevrons); the map has none either.
            expandable={explore && !focused ? node.expandable : undefined}
            expanded={explore && !focused ? node.expanded : undefined}
            onToggleExpand={explore && !focused ? onToggleExpand : undefined}
            bucket={empireOn ? bucketMap?.get(node.key) : undefined}
          />
        ),
      ),
    };
    // `highlightKey` in deps means only the 2 changed cards re-render on a
    // selection/focus change (React.memo bails the rest); hover/pan never touch
    // it so they still reuse this memo cheaply.
  }, [
    layoutReady,
    explore,
    focused,
    iconBase,
    onCardEnter,
    onCardLeave,
    highlightKey,
    onSelect,
    onActivate,
    onToggleExpand,
    onBucketToggle,
    empireOn,
    bucketMap,
  ]);

  if (state.status === "loading") return <LoadingOverlay />;
  if (state.status === "error") {
    return <ErrorOverlay onRetry={() => setState({ status: "loading" })} />;
  }

  const layout = explore ? exploreFocus ?? exploreLayout : filtered ?? state.layout;

  return (
    <div className="tech-tree">
      {empireOn ? (
        <EmpirePanel snapshot={snapshot} onBuckets={onBuckets} />
      ) : (
        <CategoryNav
          active={active}
          counts={counts}
          iconBase={iconBase}
          onToggleCategory={onToggleCategory}
          onIsolateCategory={onIsolateCategory}
          onToggleArea={onToggleArea}
          onIsolateArea={onIsolateArea}
          onShowAll={onShowAll}
        />
      )}

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
            data-active={!empireOn && viewMode === "map" ? "" : undefined}
            aria-pressed={!empireOn && viewMode === "map"}
            onClick={() => {
              setEmpireOn(false);
              onSelectView("map");
            }}
          >
            Map
          </button>
          <button
            type="button"
            className="view-toggle__btn"
            data-active={!empireOn && viewMode === "explore" ? "" : undefined}
            aria-pressed={!empireOn && viewMode === "explore"}
            onClick={() => {
              setEmpireOn(false);
              onSelectView("explore");
            }}
          >
            Explore
          </button>
          <button
            type="button"
            className="view-toggle__btn"
            data-active={empireOn ? "" : undefined}
            aria-pressed={empireOn}
            onClick={() => {
              setEmpireOn(true);
              onSelectView("map");
            }}
          >
            Saved Empire
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
