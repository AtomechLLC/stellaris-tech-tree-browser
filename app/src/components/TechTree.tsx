import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { TechSnapshot, Tech } from "../types/tech-snapshot";
import { layoutTree, type TreeLayout, type LayoutNode } from "../lib/tree/layoutTree";
import { layoutExplore, layoutFocus, BUCKET_KEY_PREFIX } from "../lib/tree/exploreLayout";
import { augmentSnapshotWithPerks, isPerkKey, PERK_PREFIX } from "../lib/tree/perks";
import { augmentSnapshotWithEventSources, isSourceKey, sourceKindOf } from "../lib/tree/eventSources";
import { dataUrl } from "../lib/data/paths";
import { formatGrantLine } from "../lib/graph/grants";
import { CATEGORY_ORDER, CATEGORY_AREA } from "../lib/graph/categories";
import { TechCard, CARD_W, CARD_H } from "./TechCard";
import { BucketCard } from "./BucketCard";
import { EdgeLayer } from "./EdgeLayer";
import { MapScrollbars, type ScrollbarsHandle } from "./MapScrollbars";
import { LodCanvas, type LodCanvasHandle } from "./LodCanvas";
import { TierRuler, type TierRulerHandle } from "./TierRuler";
import { exportMapPng } from "../lib/export/mapImage";
import { BandLayer } from "./BandLayer";
import { CategoryNav } from "./CategoryNav";
import { EmpirePanel } from "./EmpirePanel";
import type { Bucket } from "../lib/empire/classify";
import type { SavedEmpire } from "../lib/empire/savLoad";
import { buildEmpireState } from "../lib/empire/gates";
import { computeDrawEstimates } from "../lib/empire/draw";
import {
  isTechAccessibleUnderArchetype,
  hasActiveArchetypeFilter,
  archetypeIconFor,
  type ArchetypeFilters,
} from "../lib/empire/archetype";
import { ArchetypeToggles } from "./ArchetypeToggles";
import { TechTooltip } from "./TechTooltip";
import { TechDetailPanel } from "./TechDetailPanel";
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
// How many prior views the Back (Backspace) stack retains.
const HISTORY_DEPTH = 40;
// Viewport culling: at or below this node count, render every card (cheap). Above
// it (e.g. the full ~678-node map), render only the cards within the viewport plus
// a margin so panning with everything on stays smooth.
const CULL_MIN_NODES = 200;
// Render margin as a FRACTION of the viewport on each side. Smaller → fewer nodes
// rendered (faster) but more frequent re-culls; the drag-LOD keeps those cheap.
const CULL_MARGIN = 0.5;

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

/** localStorage key for the last view's query string (return-visit restore). */
const LAST_VIEW_KEY = "stellaris-tech:last-view";
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

/** A shareable framing rect in canvas coords: the visible region's top-left
 *  (x0,y0) and bottom-right (x1,y1). Resolution-independent — the recipient's
 *  viewport fits this rect, reproducing the same focal point + ~zoom. */
interface Framing {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface UrlNavState {
  viewMode: ViewMode;
  active: Set<string>;
  selectedKey: string | null;
  focusKey: string | null;
  focusExpanded: Set<string>;
  expandedKeys: Set<string>;
  framing?: Framing | null;
}

/** Parse the current URL into partial nav state, validating ids against the
 *  snapshot / category list (unknown ids are dropped — never throws). */
function parseUrlNav(snapshot: TechSnapshot): Partial<UrlNavState> {
  const p = new URLSearchParams(window.location.search);
  const isTech = (k: string) => snapshot.techs[k] !== undefined;
  const validCats = new Set<string>(CATEGORY_ORDER);
  const techSet = (v: string | null) =>
    v == null ? undefined : new Set(v.split(URL_SEP).filter((k) => k && isTech(k)));
  // The Explore expand set (`x`) also contains synthetic bucket keys
  // ("bucket:dangerous", …), which are NOT real techs — keep those too, else a
  // shared Explore link loses every expanded bucket on paste.
  const expandSet = (v: string | null) =>
    v == null
      ? undefined
      : new Set(
          v
            .split(URL_SEP)
            .filter(
              (k) =>
                k && (isTech(k) || k.startsWith(BUCKET_KEY_PREFIX) || k.startsWith(PERK_PREFIX)),
            ),
        );

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
  const x = expandSet(p.get("x"));
  if (x) out.expandedKeys = x;
  // Framing rect `fr=x0.y0.x1.y1` (canvas coords). Only accept a well-formed,
  // positively-sized rect of finite numbers.
  const fr = p.get("fr");
  if (fr) {
    const n = fr.split(URL_SEP).map(Number);
    if (n.length === 4 && n.every(Number.isFinite) && n[2] > n[0] && n[3] > n[1]) {
      out.framing = { x0: n[0], y0: n[1], x1: n[2], y1: n[3] };
    }
  }
  // A focused tech is always part of its own forward-expansion set.
  if (out.focusKey) (out.focusExpanded ??= new Set()).add(out.focusKey);
  return out;
}

/** Serialize nav state into a query string ("?…" or "") for replaceState. */
function serializeUrlNav(s: UrlNavState, dataVersion?: string): string {
  const p = new URLSearchParams();
  // Data-version pin (owned by App's version selector, not by this nav state):
  // always stamp the LOADED version so every synced/copied URL reproduces the
  // exact data the viewer is seeing — and this rebuild would otherwise drop an
  // incoming `?ver=` on the first sync.
  const ver = dataVersion ?? new URLSearchParams(window.location.search).get("ver");
  if (ver) p.set("ver", ver);
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
  if (s.framing) {
    const { x0, y0, x1, y1 } = s.framing;
    p.set("fr", [x0, y0, x1, y1].map(Math.round).join(URL_SEP));
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

/** Imperative handle so components OUTSIDE the tree (e.g. the header's
 *  What's-new panel, a sibling of TechTree under App) can trigger a jump —
 *  reuses the exact same onJumpToTech logic the tooltip/panel rows use. */
export interface TechTreeHandle {
  jumpToTech: (key: string) => void;
}

export const TechTree = forwardRef<TechTreeHandle, { snapshot: TechSnapshot }>(function TechTree(
  { snapshot },
  ref,
) {
  const [state, setState] = useState<LayoutState>({ status: "loading" });
  // Parse the shareable URL ONCE (at mount) to seed the initial nav state below.
  const urlInitRef = useRef<Partial<UrlNavState> | null>(null);
  if (urlInitRef.current === null) {
    // Return-visit restore: a BARE url (no shared link) adopts the last
    // session's saved view before parsing, so a returning visitor lands where
    // they left off. Shared links (any NAV query string) always win. A url
    // whose only param is `ver` (the data-version pick, e.g. right after
    // switching versions) still counts as bare — restore the saved view but
    // keep the CURRENT version param, not the one saved with the old view.
    const current = new URLSearchParams(window.location.search);
    if ([...current.keys()].every((k) => k === "ver")) {
      try {
        const saved = localStorage.getItem(LAST_VIEW_KEY);
        if (saved) {
          const restored = new URLSearchParams(saved);
          const ver = current.get("ver");
          if (ver) restored.set("ver", ver);
          else restored.delete("ver");
          const qs = restored.toString();
          window.history.replaceState(
            null,
            "",
            window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
          );
        }
      } catch {
        /* storage unavailable (private mode) — start at the default view */
      }
    }
    urlInitRef.current = parseUrlNav(snapshot);
  }
  const urlInit = urlInitRef.current;
  const [active, setActive] = useState<Set<string>>(
    () => urlInit.active ?? new Set<string>(CATEGORY_ORDER),
  );
  const [hover, setHover] = useState<{ tech: Tech; rect: DOMRect } | null>(null);
  // Pinned detail panel dismissal: hides the panel for ONE tech key without
  // clearing the selection; reset when the selection moves on (so re-selecting
  // later shows the panel again). See <TechDetailPanel>.
  const [detailHiddenFor, setDetailHiddenFor] = useState<string | null>(null);
  // Panel collapse (title bar only) — a map-mode option for users who want the
  // selection pinned without the full column. (The panel never renders in
  // Explore — see detailVisible.)
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  // Copy-link feedback: flips the 🔗 button to ✓ briefly after a copy.
  const [linkCopied, setLinkCopied] = useState(false);
  // PNG export in-flight (icon preload + encode takes a few seconds).
  const [exporting, setExporting] = useState(false);
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
  const [savedEmpire, setSavedEmpire] = useState<SavedEmpire | null>(null);
  // Stable callback so <EmpirePanel>'s classify effect isn't re-triggered every render.
  const onBuckets = useCallback(
    (
      buckets: Map<string, Bucket> | null,
      _counts: unknown,
      _name: unknown,
      empire: SavedEmpire | null,
    ) => {
      setBucketMap(buckets);
      setSavedEmpire(empire);
    },
    [],
  );

  // Draw-chance estimates for the loaded empire's AVAILABLE techs — effective
  // weight (modifiers evaluated against the empire) over the area pool.
  const drawMap = useMemo(() => {
    if (!bucketMap || !savedEmpire) return null;
    return computeDrawEstimates(
      Object.values(snapshot.techs),
      bucketMap,
      buildEmpireState(savedEmpire),
    );
  }, [bucketMap, savedEmpire, snapshot]);

  // ── Empire-archetype filter (map only) ─────────────────────────────────────
  // A no-save-required, manual version of the same idea: toggle a handful of
  // archetype flags (Nomad/Landed, Machine/Biological, Bioship/Alloy Ship —
  // each an exclusive pair — plus standalone Fauna) and grey out any tech
  // whose potential gate can never be satisfied under them. Independent of
  // the Saved Empire feature (works with or without empireOn).
  const [archetypeFilters, setArchetypeFilters] = useState<ArchetypeFilters>({});
  // Press an already-active value again to clear it back to "unconstrained".
  const onSetArchetype = useCallback((key: keyof ArchetypeFilters, value: boolean) => {
    setArchetypeFilters((prev) => {
      const next = { ...prev };
      if (prev[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);
  const archetypeActive = hasActiveArchetypeFilter(archetypeFilters);
  const archetypeBlockedKeys = useMemo(() => {
    if (!archetypeActive) return null;
    const blocked = new Set<string>();
    for (const t of Object.values(snapshot.techs)) {
      if (!isTechAccessibleUnderArchetype(t.gate, archetypeFilters)) blocked.add(t.key);
    }
    return blocked;
  }, [archetypeFilters, archetypeActive, snapshot]);
  // technology_swap icon reskins (e.g. Alloys 1 shows Wilderness art when
  // Fauna is pressed) — tech key -> override icon filename, for the subset
  // of techs that ship a swap variant matching the pressed toggle.
  const archetypeIconOverrides = useMemo(() => {
    if (!archetypeActive) return null;
    const overrides = new Map<string, string>();
    for (const t of Object.values(snapshot.techs)) {
      const icon = archetypeIconFor(t.archetypeIcons, archetypeFilters);
      if (icon) overrides.set(t.key, icon);
    }
    return overrides;
  }, [archetypeFilters, archetypeActive, snapshot]);

  // Mobile/touch detection: a coarse pointer OR a narrow viewport. Tracked as
  // state (updated on media-query change) so orientation/resize flips it live.
  // Drives the "auto-expand a focused tech's subtree" default further below.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Left sidebar (filters / empire panel) visibility. Open on desktop, collapsed
  // by default on mobile where it would otherwise eat the whole screen.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !window.matchMedia("(pointer: coarse), (max-width: 767px)").matches,
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<Transform>(DEFAULT_TRANSFORM);
  const scrollbarsRef = useRef<ScrollbarsHandle>(null);
  const lodCanvasRef = useRef<LodCanvasHandle>(null);
  const tierRulerRef = useRef<TierRulerHandle>(null);
  // Zoom % readout under the zoom buttons — updated imperatively per transform
  // apply (like the scrollbars) so zooming never forces a React re-render.
  const zoomReadoutRef = useRef<HTMLDivElement>(null);
  // Below the LOD threshold the map swaps its DOM cards + SVG edges for a single
  // canvas (LodCanvas). `lodMode` mirrors "scale < LOD_THRESHOLD"; flipped from
  // applyTransform only when the threshold is crossed (one re-render, not per pan).
  const [lodMode, setLodMode] = useState(false);
  const lodModeRef = useRef(false);
  // LOD hit-testing (the canvas has no DOM cards, so hover/click/double-click
  // are resolved by rect-testing the layout nodes against the pointer).
  const layoutNodesRef = useRef<LayoutNode[]>([]);
  const lodActiveRef = useRef(false);
  const lodHoverKeyRef = useRef<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );
  // True once a pointer drag has moved past the click threshold — read by the
  // card's onSelect so a pan that ends over a card doesn't count as a click.
  const movedRef = useRef(false);
  // Active pointers (touch/mouse) by id, for multi-touch pinch-zoom. Two down →
  // pinch; `pinchRef` holds the last finger distance + midpoint to diff against.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  // URL sync: `syncUrlRef` always points at the latest serializer (which closes
  // over current nav state); `urlTimerRef` debounces framing writes on pan/zoom.
  const syncUrlRef = useRef<() => void>(() => {});
  const urlTimerRef = useRef<number | undefined>(undefined);
  // One-shot guard: apply a shared framing rect from the URL when the canvas
  // first mounts. `fitFocusRef` tracks which focus the auto-fit last framed (so a
  // single-click expand doesn't re-fit) — declared here so setCanvas can pre-seed
  // it to skip the focus auto-fit when a shared frame wins on load.
  const framingAppliedRef = useRef(false);
  const fitFocusRef = useRef<string | null>(null);
  // Viewport culling: `cullRectRef` is the committed canvas rect (viewport +
  // margin) whose cards are rendered; bumping `cullTick` re-renders the card list
  // when the view pans past that margin. Keeps a full-map pan cheap.
  const cullRectRef = useRef<(Framing & { scale: number }) | null>(null);
  const [cullTick, setCullTick] = useState(0);
  // Cached viewport size (ResizeObserver-updated) so the per-frame cull check
  // never forces a getBoundingClientRect reflow.
  const viewportSizeRef = useRef({ w: 0, h: 0 });
  // Node count of the current layout — gates the drag-LOD to the heavy map only.
  const nodeCountRef = useRef(0);
  // rAF-coalesced panning: many pointermove events per frame collapse into ONE
  // transform apply, keeping high-refresh input from over-working the main thread.
  const rafRef = useRef<number | null>(null);
  const pendingTransformRef = useRef<Transform | null>(null);

  const iconBase = dataUrl(`${snapshot.meta.gameVersion}/icons`);

  // Explore-only snapshot: perk-gated techs gain their ascension-perk hexagon as a
  // synthetic PARENT node (Ambition / Crisis lines). The Map keeps the real one.
  const exploreSnapshot = useMemo(
    () => augmentSnapshotWithPerks(augmentSnapshotWithEventSources(snapshot)),
    [snapshot],
  );

  // key → Tech, for resolving prerequisite/leadsTo names + icons in the tooltip.
  // Built from the perk-augmented snapshot so perk nodes resolve too.
  const techByKey = useMemo(() => {
    const m = new Map<string, Tech>();
    for (const t of Object.values(exploreSnapshot.techs)) m.set(t.key, t);
    return m;
  }, [exploreSnapshot]);

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
        // Formatted effect lines, searched alongside the name ("survey speed"
        // → the techs granting it). Literal \n from loc text becomes a space.
        effects: t.unlocks.grants.map((g) => formatGrantLine(g.replace(/\\n/g, " "))),
        dlc: t.dlc,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [snapshot]);

  // Recompute the culling rect from the current transform + viewport. Only bumps
  // `cullTick` (→ re-render) when the visible area has moved OUTSIDE the committed
  // rect (or `force`), so most pan frames do nothing. The margin is one viewport
  // on every side, so you can pan a full screen before the set is recomputed.
  const recomputeCull = useCallback((force = false) => {
    let { w, h } = viewportSizeRef.current;
    if (!w || !h) {
      const vp = viewportRef.current?.getBoundingClientRect();
      if (!vp) return;
      w = vp.width;
      h = vp.height;
    }
    const t = transformRef.current;
    const x0 = -t.x / t.scale;
    const y0 = -t.y / t.scale;
    const x1 = (w - t.x) / t.scale;
    const y1 = (h - t.y) / t.scale;
    const cr = cullRectRef.current;
    // Recompute on: forced, first run, panning outside the committed rect, OR a
    // big zoom change (a smaller viewport should render fewer cards, but panning
    // alone never shrinks the rect).
    const zoomChanged = cr ? Math.abs(t.scale - cr.scale) > cr.scale * 0.3 : true;
    if (force || !cr || zoomChanged || x0 < cr.x0 || y0 < cr.y0 || x1 > cr.x1 || y1 > cr.y1) {
      const mw = (x1 - x0) * CULL_MARGIN;
      const mh = (y1 - y0) * CULL_MARGIN;
      cullRectRef.current = { x0: x0 - mw, y0: y0 - mh, x1: x1 + mw, y1: y1 + mh, scale: t.scale };
      setCullTick((n) => n + 1);
    }
  }, []);

  // ── Imperative transform (no React re-render on pan/zoom) ──────────────────
  const applyTransform = useCallback(
    (t: Transform) => {
      transformRef.current = t;
      const c = canvasRef.current;
      if (c) {
        c.style.transform = cssTransform(t);
        // LOD: pan (scale unchanged) is a no-op toggle; crossing the zoom
        // threshold flips the whole tree between full cards and cheap icon tiles.
        c.classList.toggle("lod-simple", t.scale < LOD_THRESHOLD);
      }
      // Cull: re-render the card set only if the view left the render margin.
      recomputeCull();
      // Keep the map scrollbars' thumbs in sync with the new pan/zoom.
      scrollbarsRef.current?.update();
      // LOD: below the threshold, drive the canvas renderer; flip the mount flag
      // only when the threshold is actually crossed (avoids a per-pan setState).
      const nextLod = t.scale < LOD_THRESHOLD;
      if (nextLod !== lodModeRef.current) {
        lodModeRef.current = nextLod;
        setLodMode(nextLod);
      }
      if (nextLod) lodCanvasRef.current?.draw();
      // Zoom readout (imperative, like the scrollbars — no re-render per zoom).
      const zr = zoomReadoutRef.current;
      if (zr) zr.textContent = `${Math.round(t.scale * 100)}%`;
      // Tier-column labels track the columns across pan/zoom.
      tierRulerRef.current?.update();
      // Debounced: mirror the new framing into the URL so a shared link reproduces
      // the current zoom + focal point. Pan/zoom is imperative (no re-render), so
      // this is the only hook that captures it.
      clearTimeout(urlTimerRef.current);
      urlTimerRef.current = window.setTimeout(() => syncUrlRef.current(), 300);
    },
    [recomputeCull],
  );

  // rAF-coalesced apply for high-frequency PAN moves: store the target and apply
  // at most once per frame (the pinch/zoom/fit paths call applyTransform directly).
  const scheduleTransform = useCallback(
    (t: Transform) => {
      pendingTransformRef.current = t;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const p = pendingTransformRef.current;
          pendingTransformRef.current = null;
          if (p) applyTransform(p);
        });
      }
    },
    [applyTransform],
  );
  // Apply any queued transform immediately (on pointer-up) so the final position
  // isn't left a frame behind.
  const flushTransform = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const p = pendingTransformRef.current;
    pendingTransformRef.current = null;
    if (p) applyTransform(p);
  }, [applyTransform]);

  // Stable ref callback: bind the canvas node and apply the current transform on
  // (re)attach. Stable identity so React only calls it on real mount/unmount.
  const setCanvas = useCallback((el: HTMLDivElement | null) => {
    canvasRef.current = el;
    if (!el) return;
    // Honor a shared framing rect from the URL exactly once, synchronously on the
    // first mount — computed here (not in an effect) so it wins the race with the
    // canvas's own transform apply and any auto-fit.
    const fr = urlInitRef.current?.framing;
    if (fr && !framingAppliedRef.current) {
      framingAppliedRef.current = true;
      fitFocusRef.current = urlInitRef.current?.focusKey ?? null; // skip focus auto-fit
      // Read the viewport from the canvas's PARENT — during commit, child refs
      // (this one) attach before `viewportRef` is assigned, so it may still be null.
      const rect = (el.parentElement ?? viewportRef.current)?.getBoundingClientRect();
      if (rect) {
        const bw = Math.max(1, fr.x1 - fr.x0);
        const bh = Math.max(1, fr.y1 - fr.y0);
        const scale = clampZoom(Math.min(rect.width / bw, rect.height / bh));
        transformRef.current = {
          scale,
          x: (rect.width - bw * scale) / 2 - fr.x0 * scale,
          y: (rect.height - bh * scale) / 2 - fr.y0 * scale,
        };
      }
      // Re-write the URL from the applied framing once syncUrl is wired up.
      clearTimeout(urlTimerRef.current);
      urlTimerRef.current = window.setTimeout(() => syncUrlRef.current(), 350);
    }
    const t = transformRef.current;
    el.style.transform = cssTransform(t);
    el.classList.toggle("lod-simple", t.scale < LOD_THRESHOLD);
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
    // Drop toggled-off bands so their tinted backgrounds vanish too.
    const bands = layout.bands.filter((b) => active.has(b.category));
    return { ...layout, nodes, edges, bands };
  }, [state, active]);

  // Explore-mode layout: a PURE, SYNCHRONOUS collapsible forward tree (no ELK),
  // recomputed on each expand/collapse (cheap). Respects the active category
  // filter internally. Only consumed when viewMode === "explore" (still cheap
  // to memo unconditionally — it's a plain DFS over the reverse-prereq map).
  const exploreLayout = useMemo(
    () => layoutExplore(exploreSnapshot, expandedKeys, active, CARD_W, CARD_H),
    [exploreSnapshot, expandedKeys, active],
  );

  // Explore FOCUS view (quick 260708-7fx): when a real tech is selected in
  // Explore, the canvas switches from the browse spanning tree to the focus
  // tech's full dependency neighborhood — its ENTIRE recursive prerequisite tree
  // fanned out to the left, and the techs that DIRECTLY depend on it to the
  // right, all as real cards with connecting edges. `null` when browsing (no
  // selection) or when the selection isn't a real tech (e.g. a bucket card).
  const exploreFocus = useMemo<TreeLayout | null>(() => {
    if (viewMode !== "explore" || !focusKey) return null;
    if (!exploreSnapshot.techs[focusKey]) return null; // bucket keys etc.
    return layoutFocus(exploreSnapshot, focusKey, focusExpanded, CARD_W, CARD_H);
  }, [viewMode, focusKey, focusExpanded, exploreSnapshot]);

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

  // Pan the given node to the viewport CENTER at the CURRENT zoom (no zoom
  // change) — the "jump to this tech on the map" motion from the tooltip, which
  // should relocate the view without yanking the zoom level around like a fit.
  const panToNode = useCallback(
    (node: LayoutNode) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = transformRef.current.scale;
      const cx = node.x + node.w / 2;
      const cy = node.y + node.h / 2;
      applyTransform({
        scale,
        x: rect.width / 2 - cx * scale,
        y: rect.height / 2 - cy * scale,
      });
    },
    [applyTransform],
  );

  // ── Shareable framing ──────────────────────────────────────────────────────
  // The visible canvas rect (top-left / bottom-right in canvas coords) for the
  // current transform + viewport size — resolution-independent, so it round-trips
  // through the URL to the same focal point + zoom regardless of window size.
  const currentFraming = useCallback((): Framing | null => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const t = transformRef.current;
    return {
      x0: -t.x / t.scale,
      y0: -t.y / t.scale,
      x1: (rect.width - t.x) / t.scale,
      y1: (rect.height - t.y) / t.scale,
    };
  }, []);

  // Write the full nav state + current framing to the URL (replaceState — no
  // history spam). Kept in a ref so the imperative pan/zoom debounce always calls
  // the latest closure without re-subscribing.
  // The URL's MAJOR-navigation signature (view mode / focus / selection). A
  // change here gets a real history entry (pushState) so the browser Back
  // button walks in-app navigation instead of leaving the site; pan/zoom
  // framing and filter churn keep updating the current entry (replaceState).
  const lastNavSigRef = useRef<string | null>(null);
  const navSigOf = (qs: string): string => {
    const p = new URLSearchParams(qs);
    return `${p.get("v") ?? ""}|${p.get("f") ?? ""}|${p.get("s") ?? ""}`;
  };
  const syncUrl = useCallback(() => {
    // Before the canvas mounts (loading) currentFraming is null — keep the URL's
    // incoming framing so a shared link isn't wiped before setCanvas applies it.
    const framing =
      currentFraming() ??
      (framingAppliedRef.current ? null : urlInitRef.current?.framing ?? null);
    const qs = serializeUrlNav(
      {
        viewMode,
        active,
        selectedKey,
        focusKey,
        focusExpanded,
        expandedKeys,
        framing,
      },
      snapshot.meta.gameVersion,
    );
    const url = window.location.pathname + qs + window.location.hash;
    const sig = navSigOf(qs);
    if (lastNavSigRef.current !== null && sig !== lastNavSigRef.current) {
      window.history.pushState(null, "", url);
    } else {
      window.history.replaceState(null, "", url);
    }
    lastNavSigRef.current = sig;
    // Return-visit restore: remember this view for the next bare-URL load.
    if (qs) {
      try {
        localStorage.setItem(LAST_VIEW_KEY, qs);
      } catch {
        /* storage unavailable — restore just won't happen */
      }
    }
  }, [viewMode, active, selectedKey, focusKey, focusExpanded, expandedKeys, currentFraming, snapshot]);
  useEffect(() => {
    syncUrlRef.current = syncUrl;
    syncUrl(); // also fire immediately on any nav-state change
  }, [syncUrl]);

  // Browser Back/Forward: re-parse the URL the browser landed on and restore
  // that view (mode, focus, selection, filters, framing) — mirroring onBack's
  // restore. lastNavSigRef is updated FIRST so the syncUrl fired by these state
  // changes replaces (not re-pushes) the entry we just navigated to.
  useEffect(() => {
    const onPop = () => {
      const parsed = parseUrlNav(snapshot);
      lastNavSigRef.current = navSigOf(window.location.search);
      fitFocusRef.current = parsed.focusKey ?? null; // don't auto-refit over the restored frame
      setViewMode(parsed.viewMode ?? "map");
      setSelectedKey(parsed.selectedKey ?? null);
      setFocusKey(parsed.focusKey ?? null);
      setFocusExpanded(parsed.focusExpanded ?? new Set());
      setExpandedKeys(parsed.expandedKeys ?? new Set());
      setActive(parsed.active ?? new Set(CATEGORY_ORDER));
      const fr = parsed.framing;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (fr && rect) {
        const bw = Math.max(1, fr.x1 - fr.x0);
        const bh = Math.max(1, fr.y1 - fr.y0);
        const scale = clampZoom(Math.min(rect.width / bw, rect.height / bh));
        applyTransform({
          scale,
          x: (rect.width - bw * scale) / 2 - fr.x0 * scale,
          y: (rect.height - bh * scale) / 2 - fr.y0 * scale,
        });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [snapshot, applyTransform]);

  // Auto-frame the focus neighborhood ONLY when the focus tech CHANGES (entering
  // focus, or a double-click re-focus) — "zoom in on this". A single-click
  // expand keeps the same focusKey, so this does NOT re-fit: the tree just grows
  // in place without the viewport jumping. A rAF lets the DOM cards mount first.
  // (fitFocusRef is declared up with the other transform refs.)
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
    if (historyRef.current.length > HISTORY_DEPTH) historyRef.current.shift();
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
  // The tooltip is interactive (its prereq / leads-to rows are clickable jump
  // targets), so leaving the card must NOT hide it instantly — that would make
  // it impossible to move the pointer across the gap onto the tooltip. Leaving
  // schedules a hide; entering the card OR the tooltip cancels it.
  const hoverHideTimerRef = useRef<number | null>(null);
  const cancelHoverHide = useCallback(() => {
    if (hoverHideTimerRef.current !== null) {
      clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
  }, []);
  const scheduleHoverHide = useCallback(() => {
    cancelHoverHide();
    hoverHideTimerRef.current = window.setTimeout(() => {
      hoverHideTimerRef.current = null;
      setHover(null);
    }, 160);
  }, [cancelHoverHide]);
  const onCardEnter = useCallback(
    (tech: Tech, rect: DOMRect) => {
      cancelHoverHide();
      setHover({ tech, rect });
    },
    [cancelHoverHide],
  );
  const onCardLeave = useCallback(() => scheduleHoverHide(), [scheduleHoverHide]);
  // Pointer over the tooltip itself keeps it open; leaving it hides (also delayed
  // so a wobble back onto a card doesn't flicker).
  const onTooltipEnter = useCallback(() => cancelHoverHide(), [cancelHoverHide]);
  const onTooltipLeave = useCallback(() => scheduleHoverHide(), [scheduleHoverHide]);
  useEffect(() => () => cancelHoverHide(), [cancelHoverHide]);

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
  // Matched by PHYSICAL key (e.code "KeyF") as well as the produced character:
  // on a non-Latin layout (e.g. Russian, where that key types "а") e.key never
  // equals "f", so code-matching keeps the shortcut on the same key in every
  // layout — while the e.key match still serves layouts like Dvorak whose F
  // lives on a different physical key.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyF" && e.key !== "f" && e.key !== "F") return;
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

  // Jump from a tooltip's Required / Leads-To row to that tech's card. Map: pan
  // it to center at the current zoom and select it. Explore: open its focus view.
  // Reveals its category first if a filter is hiding it. Hides the tooltip.
  const onJumpToTech = useCallback(
    (key: string) => {
      const tech = techByKey.get(key);
      if (!tech) return; // synthetic (perk:/bucket:) or unknown — not jumpable
      cancelHoverHide();
      setHover(null);
      pushHistory();
      const cat = tech.category[0] ?? "";
      if (cat) {
        setActive((prev) => (prev.has(cat) ? prev : new Set(prev).add(cat)));
      }
      if (viewMode === "explore") {
        setFocusKey(key);
        setFocusExpanded(new Set([key]));
      } else {
        setSelectedKey(key);
        if (state.status === "ready") {
          const node = state.layout.nodes.find((n) => n.key === key);
          if (node) panToNode(node);
        }
      }
    },
    [techByKey, state, viewMode, pushHistory, panToNode, cancelHoverHide],
  );

  // Expose the jump for callers outside the tree (What's-new panel rows).
  useImperativeHandle(ref, () => ({ jumpToTech: onJumpToTech }), [onJumpToTech]);

  // Clicking empty viewport background (not a card) clears the selection. A real
  // drag is suppressed via movedRef so panning doesn't reset. EXCEPTION: in the
  // Explore focus view, an empty-space tap is inert — it must NOT act as "back"
  // out of the focused tech (especially on touch, where stray taps are common).
  // LOD hit-test: resolve a pointer position to the layout node under it (the
  // canvas renders no DOM cards, so hover/click/dblclick rect-test the nodes —
  // ~678 checks per event, negligible). Map nodes never overlap; first hit wins.
  const hitTestLod = useCallback((clientX: number, clientY: number): LayoutNode | null => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const t = transformRef.current;
    const cx = (clientX - rect.left - t.x) / t.scale;
    const cy = (clientY - rect.top - t.y) / t.scale;
    for (const n of layoutNodesRef.current) {
      if (n.tech && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h) return n;
    }
    return null;
  }, []);

  const onViewportClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (movedRef.current) return;
      // LOD canvas mode: a click on a drawn tile selects that tech (toggle),
      // exactly like clicking its DOM card — a miss falls through to deselect.
      if (lodActiveRef.current) {
        const node = hitTestLod(e.clientX, e.clientY);
        if (node?.tech) {
          pushHistory();
          setSelectedKey((k) => (k === node.tech!.key ? null : node.tech!.key));
          return;
        }
      }
      if ((e.target as HTMLElement).closest(".tech-card, .bucket-card")) return;
      if (viewMode === "explore" && focusKey) return;
      pushHistory();
      setSelectedKey(null);
      setFocusKey(null);
      setFocusExpanded(new Set());
    },
    [pushHistory, viewMode, focusKey, hitTestLod],
  );

  // LOD canvas mode: double-click a drawn tile → same "activate" as a DOM card
  // (opens the Explore focus view for that tech). No-op in DOM mode — the cards
  // handle their own onDoubleClick.
  const onViewportDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!lodActiveRef.current || movedRef.current) return;
      const node = hitTestLod(e.clientX, e.clientY);
      if (node?.tech) onActivate(node.tech.key);
    },
    [hitTestLod, onActivate],
  );

  // ── Pan (imperative — no re-render) ───────────────────────────────────────
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    setHover(null); // hide tooltip while dragging
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) {
      // Second finger down → begin a pinch. Cancel any in-flight pan and mark
      // the gesture "moved" so the trailing click doesn't select a card.
      dragRef.current = null;
      movedRef.current = true;
      const pts = [...pointersRef.current.values()];
      const rect = viewportRef.current?.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        midX: (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0),
        midY: (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0),
      };
      return;
    }
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
      const p = pointersRef.current.get(e.pointerId);
      if (p) {
        p.x = e.clientX;
        p.y = e.clientY;
      }
      // LOD canvas hover (no buttons down): hit-test the tile under the cursor →
      // tooltip + pointer cursor, mirroring DOM-card hover. The 160ms hover-hide
      // grace keeps the tooltip reachable (it's interactive), same as DOM mode.
      if (pointersRef.current.size === 0 && lodActiveRef.current) {
        const node = hitTestLod(e.clientX, e.clientY);
        const key = node?.tech?.key ?? null;
        if (key !== lodHoverKeyRef.current) {
          lodHoverKeyRef.current = key;
          const rect = viewportRef.current?.getBoundingClientRect();
          if (node?.tech && rect) {
            cancelHoverHide();
            const t = transformRef.current;
            setHover({
              tech: node.tech,
              rect: new DOMRect(
                rect.left + node.x * t.scale + t.x,
                rect.top + node.y * t.scale + t.y,
                node.w * t.scale,
                node.h * t.scale,
              ),
            });
          } else {
            scheduleHoverHide();
          }
          const vp = viewportRef.current;
          if (vp) vp.style.cursor = key ? "pointer" : "";
        }
        return;
      }
      // Two-finger pinch: zoom by the change in finger distance, panning with the
      // finger midpoint. Incremental (diff vs the last frame) so it composes
      // smoothly and survives fingers being added/lifted.
      if (pointersRef.current.size >= 2 && pinchRef.current) {
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect || dist === 0) return;
        const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
        const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
        const prev = pinchRef.current;
        const t = transformRef.current;
        const nextScale = clampZoom(t.scale * (dist / prev.dist));
        const ratio = nextScale / t.scale;
        // Pan by the midpoint delta, then scale toward the current midpoint.
        const panX = t.x + (midX - prev.midX);
        const panY = t.y + (midY - prev.midY);
        applyTransform({
          scale: nextScale,
          x: midX - (midX - panX) * ratio,
          y: midY - (midY - panY) * ratio,
        });
        pinchRef.current = { dist, midX, midY };
        return;
      }
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
        // Drag-LOD: on the heavy map, drop cards to the cheap icon tile WHILE
        // dragging (restored on pointer-up) so the drag itself is nearly free.
        if (nodeCountRef.current > CULL_MIN_NODES) canvasRef.current?.classList.add("panning");
      }
      const t = transformRef.current;
      // Coalesce to one apply per frame (see scheduleTransform).
      scheduleTransform({
        scale: t.scale,
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      });
    },
    [scheduleTransform, applyTransform, hitTestLod, cancelHoverHide, scheduleHoverHide],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    // End drag-LOD + apply any queued pan frame so we settle on the exact position.
    canvasRef.current?.classList.remove("panning");
    flushTransform();
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (pointersRef.current.size >= 2) {
      // Still ≥2 fingers — refresh the pinch baseline so the next move doesn't jump.
      const pts = [...pointersRef.current.values()];
      const rect = viewportRef.current?.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        midX: (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0),
        midY: (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0),
      };
    } else {
      pinchRef.current = null;
      if (pointersRef.current.size === 1) {
        // Dropped from pinch to one finger → hand the gesture off to panning.
        const [rem] = [...pointersRef.current.values()];
        dragRef.current = {
          startX: rem.x,
          startY: rem.y,
          originX: transformRef.current.x,
          originY: transformRef.current.y,
        };
        movedRef.current = true; // continuation of a gesture, not a click
      } else {
        dragRef.current = null;
      }
    }
  }, [flushTransform]);

  // ── Wheel (imperative): behavior depends on view mode ─────────────────────
  // Map mode SCROLLS (pans like a normal scrollable page) — the map is a big
  // static poster you move around. Explore mode ZOOMS toward the cursor — it's
  // a focused neighborhood you drill into, where zoom is the primary gesture.
  const onWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const t = transformRef.current;
      if (viewMode !== "explore") {
        // Scroll (map): pan opposite the wheel motion, exactly like scrolling a
        // page (scroll down reveals content below → content moves up). Shift
        // swaps the axes — the usual browser convention for turning a
        // vertical-only wheel into horizontal scroll.
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        applyTransform({ scale: t.scale, x: t.x - dx, y: t.y - dy });
        return;
      }
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextScale = clampZoom(t.scale * factor);
      const ratio = nextScale / t.scale;
      applyTransform({
        scale: nextScale,
        x: cursorX - (cursorX - t.x) * ratio,
        y: cursorY - (cursorY - t.y) * ratio,
      });
    },
    [applyTransform, viewMode],
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
    for (const t of Object.values(exploreSnapshot.techs)) {
      for (const prereq of t.prerequisites) {
        if (!exploreSnapshot.techs[prereq]) continue;
        const bucket = m.get(prereq);
        if (bucket) bucket.push(t.key);
        else m.set(prereq, [t.key]);
      }
    }
    return m;
  }, [exploreSnapshot]);

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

  // "Open all children" (shortcut: C): reveal the ENTIRE forward subtree that
  // depends on the currently selected/focused tech — every recursive dependent,
  // not just the next tier. In Explore this expands the tech and every descendant
  // so the whole subtree opens; in Map — where every card is already laid out —
  // it un-hides any filtered-out descendant categories and frames the subtree.
  // No-op when nothing is selected or the tech has no dependents.
  const onExpandChildren = useCallback(() => {
    const key = viewMode === "explore" && focusKey ? focusKey : selectedKey;
    // Use the AUGMENTED snapshot so synthetic parents (perk: / src:) also expand
    // — C on an event/dig-site "fake" card opens the tech(s) it grants.
    if (!key || !exploreSnapshot.techs[key]) return;
    // BFS the reverse-prereq map to collect ALL recursive dependents (cycle-safe
    // via the visited set), so a single press opens the full subtree, not one tier.
    const subtree = new Set<string>();
    const queue = [...(childrenByKey.get(key) ?? [])];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (subtree.has(cur)) continue;
      subtree.add(cur);
      for (const child of childrenByKey.get(cur) ?? []) {
        if (!subtree.has(child)) queue.push(child);
      }
    }
    if (subtree.size === 0) return;
    pushHistory();
    // Un-hide every descendant's category so none stay filtered out of view.
    setActive((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const ck of subtree) {
        const c = techByKey.get(ck)?.category[0];
        if (c && !next.has(c)) {
          next.add(c);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    if (viewMode === "explore") {
      // Expand the tech AND every descendant so the whole forward subtree is open.
      const add = (prev: Set<string>) => {
        const next = new Set(prev);
        next.add(key);
        for (const ck of subtree) next.add(ck);
        return next;
      };
      if (focusKey) setFocusExpanded(add);
      else setExpandedKeys(add);
    } else if (state.status === "ready") {
      const keys = new Set<string>([key, ...subtree]);
      const nodes = state.layout.nodes.filter((n) => keys.has(n.key));
      if (nodes.length > 0) fitToNodes(nodes);
    }
  }, [
    viewMode,
    focusKey,
    selectedKey,
    exploreSnapshot,
    childrenByKey,
    techByKey,
    state,
    fitToNodes,
    pushHistory,
  ]);

  // "Collapse all children" (shortcut: Shift+C): the inverse of onExpandChildren.
  // Collapses the selected/focused tech's forward subtree so its dependents hide.
  // Explore-only — Map always renders every card, so there's nothing to collapse.
  const onCollapseChildren = useCallback(() => {
    if (viewMode !== "explore") return;
    const key = focusKey ?? selectedKey;
    if (!key) return;
    // All recursive dependents of the tech (cycle-safe BFS).
    const subtree = new Set<string>();
    const queue = [...(childrenByKey.get(key) ?? [])];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (subtree.has(cur)) continue;
      subtree.add(cur);
      for (const child of childrenByKey.get(cur) ?? []) {
        if (!subtree.has(child)) queue.push(child);
      }
    }
    if (subtree.size === 0) return;
    pushHistory();
    if (focusKey) {
      // Keep the focus itself expanded (its direct dependents ARE the focus
      // neighborhood); just drop the deeper expansions below it.
      setFocusExpanded((prev) => {
        const next = new Set(prev);
        for (const ck of subtree) next.delete(ck);
        next.add(focusKey);
        return next;
      });
    } else {
      // Browse tree: collapse the tech AND its descendants so the subtree closes.
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        for (const ck of subtree) next.delete(ck);
        return next;
      });
    }
  }, [viewMode, focusKey, selectedKey, childrenByKey, pushHistory]);

  // C opens / Shift+C collapses the selected/focused tech's forward subtree.
  // Ignored while typing in a form field or with Ctrl/Meta/Alt held.
  // Physical-key match (e.code) + character match — see the F handler above
  // for why (non-Latin keyboard layouts).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyC" && e.key !== "c" && e.key !== "C") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) onCollapseChildren();
      else onExpandChildren();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExpandChildren, onCollapseChildren]);

  // Mobile only: entering a tech's focus view defaults to expanding its whole
  // forward subtree, so touch users see the full dependency tree without hunting
  // for the expand control. Skipped for big fan-outs (>8 direct children, or >30
  // total descendants) so a hub tech doesn't explode into an unreadable wall —
  // there the user opts in via the C shortcut. Runs once per newly focused tech.
  const autoExpandedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isMobile || viewMode !== "explore" || !focusKey || !snapshot.techs[focusKey]) {
      if (!focusKey) autoExpandedRef.current = null;
      return;
    }
    if (autoExpandedRef.current === focusKey) return; // already handled this focus
    autoExpandedRef.current = focusKey;
    const direct = childrenByKey.get(focusKey) ?? [];
    if (direct.length === 0) return; // childless — nothing to expand
    const subtree = new Set<string>();
    const queue = [...direct];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (subtree.has(cur)) continue;
      subtree.add(cur);
      for (const child of childrenByKey.get(cur) ?? []) {
        if (!subtree.has(child)) queue.push(child);
      }
    }
    // Count LEAVES (subtree techs with no further dependents), not total nodes —
    // a deep-but-narrow chain stays readable, a bushy one doesn't.
    let leaves = 0;
    for (const k of subtree) {
      if ((childrenByKey.get(k)?.length ?? 0) === 0) leaves++;
    }
    // Small subtree → open the whole thing. Otherwise (too wide/bushy) open just
    // ONE tier — the direct children — so Explore never expands less than a full
    // tier of children even when it holds back the deeper subtree.
    const full = direct.length <= 8 && leaves <= 30;
    fitFocusRef.current = null; // let the auto-fit reframe the now-larger tree
    setFocusExpanded((prev) => {
      const next = new Set(prev);
      next.add(focusKey);
      for (const ck of full ? subtree : direct) next.add(ck);
      return next;
    });
  }, [isMobile, viewMode, focusKey, snapshot, childrenByKey]);

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

  // The layout feeding the canvas: the banded map layout in Map mode, the pure
  // collapsible tree in Explore mode. Both are the same TreeLayout shape, so the
  // SAME cards + EdgeLayer + viewport transform render either one.
  const layoutReady =
    state.status !== "ready"
      ? null
      : viewMode === "explore"
        ? exploreFocus ?? exploreLayout
        : filtered ?? state.layout;

  // Re-cull whenever the LAYOUT changes (view switch, filter, focus, expand) —
  // the node positions/set differ, so the committed rect may be stale.
  // A rAF lets the transform (auto-fit) settle first. Pan/zoom re-culling is
  // handled imperatively in applyTransform.
  useEffect(() => {
    if (!layoutReady) return;
    nodeCountRef.current = layoutReady.nodes.length;
    layoutNodesRef.current = layoutReady.nodes; // LOD hit-testing reads this
    const id = requestAnimationFrame(() => recomputeCull(true));
    return () => cancelAnimationFrame(id);
  }, [layoutReady, recomputeCull]);

  // Cache the viewport size (updated on resize/sidebar-toggle) so the per-frame
  // cull check reads a ref instead of forcing a layout with getBoundingClientRect.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      viewportSizeRef.current = { w: r.width, h: r.height };
      // Track length depends on viewport size — re-sync the scrollbar thumbs.
      scrollbarsRef.current?.update();
      // The LOD canvas is sized to the viewport — redraw at the new dimensions.
      lodCanvasRef.current?.draw();
      tierRulerRef.current?.update();
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Seed `lodMode` from the ACTUAL current scale after mount / layout changes —
  // the initial transform (and URL-framing / auto-fit) is applied without a
  // threshold "crossing", so applyTransform alone wouldn't catch a first paint
  // that's already zoomed out.
  useEffect(() => {
    const nextLod = transformRef.current.scale < LOD_THRESHOLD;
    if (nextLod !== lodModeRef.current) {
      lodModeRef.current = nextLod;
      setLodMode(nextLod);
    }
  }, [layoutReady, viewMode]);

  const explore = viewMode === "explore";
  // Canvas LOD is MAP-only (Explore layouts are smaller and stay interactive).
  // When active the DOM cards + SVG edges are dropped in favor of <LodCanvas>.
  const lodActive = lodMode && !explore;
  lodActiveRef.current = lodActive; // mirrored for the imperative pointer handlers
  // Leaving LOD mode: clear the hit-test hover state + pointer cursor override.
  useEffect(() => {
    if (lodActive) return;
    lodHoverKeyRef.current = null;
    const vp = viewportRef.current;
    if (vp) vp.style.cursor = "";
  }, [lodActive]);
  // In Explore, a focused tech shows its dependency neighborhood (focus view);
  // otherwise the browse spanning tree. `focused` gates chevrons/expansion off.
  const focused = explore && exploreFocus !== null;
  // The card + edges to highlight gold: the focus tech in the focus view, else
  // the single-click selection.
  const highlightKey = focused ? focusKey : selectedKey;

  // Pinned detail panel: the selected/focused tech's info stays docked until
  // deselected or dismissed — hover is transient (and nonexistent on touch),
  // so selection needs a persistent surface. Dismissal is per-selection: moving
  // the selection to another tech re-arms the panel.
  const detailTech = highlightKey ? techByKey.get(highlightKey) ?? null : null;
  useEffect(() => {
    setDetailHiddenFor((h) => (h && h !== highlightKey ? null : h));
  }, [highlightKey]);
  // MAP-ONLY: in Explore the focus tree itself fills the viewport and the
  // panel occludes it — there the transient hover tooltip carries the details.
  const detailVisible = !explore && !!detailTech && detailTech.key !== detailHiddenFor;
  const content = useMemo(() => {
    if (!layoutReady) return null;
    // Cull: render only cards intersecting the committed viewport-plus-margin rect
    // once the layout is large. Small layouts (Explore) render whole — cheap, and
    // avoids any margin pop-in. Cull CARDS, EDGES and BANDS all to the same rect
    // so the composited canvas layer only has to paint content near the viewport
    // (otherwise the full-extent edge <path> + band backgrounds force the browser
    // to rasterize the whole — very tall — map every pan).
    const cr = cullRectRef.current;
    const cullActive = !!cr && layoutReady.nodes.length > CULL_MIN_NODES;
    let visibleNodes = layoutReady.nodes;
    let visibleEdges = layoutReady.edges;
    let visibleBands = layoutReady.bands;
    if (cr && cullActive) {
      const inRect = (n: LayoutNode) =>
        n.x < cr.x1 && n.x + n.w > cr.x0 && n.y < cr.y1 && n.y + n.h > cr.y0;
      visibleNodes = layoutReady.nodes.filter(inRect);
      // An edge draws if either endpoint is in the rect (the margin covers edges
      // from just-off-screen cards into visible ones).
      const byKey = new Map(layoutReady.nodes.map((n) => [n.key, n]));
      visibleEdges = layoutReady.edges.filter((e) => {
        const a = byKey.get(e.from);
        const b = byKey.get(e.to);
        return (!!a && inRect(a)) || (!!b && inRect(b));
      });
      visibleBands = layoutReady.bands.filter(
        (band) => band.top < cr.y1 && band.top + band.height > cr.y0,
      );
    }
    return {
      // Bands are MAP-ONLY — Explore renders no band/watermark backgrounds. Kept
      // even under the LOD canvas (13 cheap divs) so the swimlane tints stay.
      bands: explore ? null : (
        <BandLayer bands={visibleBands} width={layoutReady.width} />
      ),
      // Under the LOD canvas the DOM edge SVG + cards are dropped entirely —
      // <LodCanvas> paints both — so the tall SVG never re-rasterizes on zoom.
      edge: lodActive ? null : (
        <EdgeLayer
          edges={visibleEdges}
          nodes={layoutReady.nodes}
          width={layoutReady.width}
          height={layoutReady.height}
          selectedKey={highlightKey}
          // Highlights + ancestry chain build from the FULL edge list so the
          // prerequisite path doesn't break where the cull rect ends.
          allEdges={layoutReady.edges}
        />
      ),
      cards: lodActive ? null : visibleNodes.map((node) =>
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
            perk={isPerkKey(node.tech!.key)}
            sourceKind={isSourceKey(node.tech!.key) ? sourceKindOf(node.tech!.key) ?? undefined : undefined}
            image={
              node.tech!.icon
                ? `${iconBase}/${
                    (!explore && archetypeIconOverrides?.get(node.tech!.key)) || node.tech!.icon
                  }`
                : undefined
            }
            costIcon={
              isPerkKey(node.tech!.key) || isSourceKey(node.tech!.key)
                ? undefined
                : `${iconBase}/_research_${node.tech!.area}.webp`
            }
            categoryIcon={
              node.tech!.category[0]
                ? `${iconBase}/_category_${node.tech!.category[0]}.webp`
                : undefined
            }
            x={node.x}
            y={node.y}
            onEnter={onCardEnter}
            onLeave={onCardLeave}
            // Overlay duplicate cards carry a bucket-scoped node.key but the real
            // tech in node.tech — match on the tech key so they highlight too.
            selected={(node.tech?.key ?? node.key) === highlightKey}
            onSelect={onSelect}
            onActivate={onActivate}
            // Chevron/expansion belong to the Explore BROWSE tree only. The focus
            // view is a static neighborhood (no chevrons); the map has none either.
            expandable={explore && !focused ? node.expandable : undefined}
            expanded={explore && !focused ? node.expanded : undefined}
            onToggleExpand={explore && !focused ? onToggleExpand : undefined}
            bucket={empireOn ? bucketMap?.get(node.key) : undefined}
            archetypeBlocked={!explore ? archetypeBlockedKeys?.has(node.tech!.key) : undefined}
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
    lodActive,
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
    archetypeBlockedKeys,
    archetypeIconOverrides,
    cullTick,
  ]);

  if (state.status === "loading") return <LoadingOverlay />;
  if (state.status === "error") {
    return <ErrorOverlay onRetry={() => setState({ status: "loading" })} />;
  }

  const layout = explore ? exploreFocus ?? exploreLayout : filtered ?? state.layout;

  return (
    <div className="tech-tree">
      {sidebarOpen &&
        (empireOn ? (
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
            archetypeFilters={archetypeFilters}
            onSetArchetype={onSetArchetype}
          />
        ))}

      <div
        className="tree-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onClick={onViewportClick}
        onDoubleClick={onViewportDoubleClick}
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

        {/* Zoomed-out LOD renderer (map only) — replaces the DOM cards + SVG edges
            with one screen-space canvas so pan/zoom stays cheap far out. */}
        {lodActive && layoutReady && (
          <LodCanvas
            ref={lodCanvasRef}
            nodes={layoutReady.nodes}
            edges={layoutReady.edges}
            iconBase={iconBase}
            viewportRef={viewportRef}
            transformRef={transformRef}
            selectedKey={highlightKey}
            hoverKey={hover?.tech.key ?? null}
            bucketMap={empireOn ? bucketMap : undefined}
            archetypeBlockedKeys={archetypeBlockedKeys}
            archetypeIconOverrides={archetypeIconOverrides}
          />
        )}

        {/* Filtered-empty state: every category toggled off leaves a void with
            no cards — say so instead of showing a silent blank map. */}
        {layoutReady && layoutReady.nodes.length === 0 && (
          <div className="tree-empty-hint">
            No technologies match the current filters — pick a category on the
            left, or “Show all”.
          </div>
        )}

        {/* Tier-column ruler — map only (Explore's columns are reveal depth,
            not tiers). Tracks the transform imperatively. */}
        {!explore && <TierRuler ref={tierRulerRef} viewportRef={viewportRef} transformRef={transformRef} />}

        {/* Scrollbars mirror the imperative pan/zoom transform; they auto-hide on
            an axis that isn't overflowing. Rendered over the viewport, outside
            the transformed canvas. */}
        <MapScrollbars
          ref={scrollbarsRef}
          contentW={layout.width}
          contentH={layout.height}
          viewportRef={viewportRef}
          transformRef={transformRef}
          applyTransform={applyTransform}
        />

        {/* Sidebar collapse tab — pinned to the viewport's left edge (which sits
            right after the sidebar when open, at the screen edge when hidden), so
            it stays correctly placed in both states without measuring widths. */}
        <button
          type="button"
          className="sidebar-toggle"
          data-open={sidebarOpen ? "" : undefined}
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={sidebarOpen}
        >
          {sidebarOpen ? "‹" : "›"}
        </button>

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

        {/* Map-only actions (Explore has no full-map poster to export). */}
        {!explore && (
          <div className="map-actions">
            <button
              type="button"
              className="map-action-button"
              disabled={exporting || !layoutReady}
              aria-busy={exporting}
              title="Download the whole map as a PNG image"
              onClick={() => {
                if (!layoutReady) return;
                setExporting(true);
                exportMapPng(
                  layoutReady,
                  iconBase,
                  `stellaris-tech-map-${snapshot.meta.gameVersion}.png`,
                )
                  .catch(() => {})
                  .finally(() => setExporting(false));
              }}
            >
              {exporting ? "Exporting…" : "Export PNG"}
            </button>
          </div>
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
          <div className="zoom-readout" ref={zoomReadoutRef} aria-hidden>
            {Math.round(transformRef.current.scale * 100)}%
          </div>
        </div>

        {/* Touch/mobile navigation — the keyboard shortcuts (F / Esc / Backspace)
            as always-visible tappable buttons, bottom-left of the viewport. */}
        <div className="touch-controls" role="group" aria-label="Navigation">
          <button type="button" onClick={() => setFindOpen(true)} aria-label="Find" title="Find (F)">
            🔍
          </button>
          <button type="button" onClick={onDeselect} aria-label="Deselect" title="Deselect (Esc)">
            ✕
          </button>
          <button type="button" onClick={onBack} aria-label="Back" title="Back (Backspace)">
            ←
          </button>
          <button
            type="button"
            onClick={() => {
              // Flush the debounced URL sync so the copied link carries the
              // CURRENT framing, then copy. Clipboard API needs localhost/https.
              syncUrlRef.current();
              navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => {
                  setLinkCopied(true);
                  window.setTimeout(() => setLinkCopied(false), 1500);
                })
                .catch(() => {});
            }}
            aria-label="Copy link to this view"
            title="Copy link to this view"
          >
            {linkCopied ? "✓" : "🔗"}
          </button>
        </div>
      </div>

      {/* Hover tooltip — suppressed for the tech already pinned in the detail
          panel (identical content twice would just occlude the map). */}
      {hover && !(detailVisible && hover.tech.key === detailTech!.key) && (
        <TechTooltip
          tech={hover.tech}
          techByKey={techByKey}
          iconBase={iconBase}
          anchor={hover.rect}
          onJump={onJumpToTech}
          onPointerEnter={onTooltipEnter}
          onPointerLeave={onTooltipLeave}
          draw={empireOn ? drawMap?.get(hover.tech.key) ?? null : null}
        />
      )}

      {detailVisible && (
        <TechDetailPanel
          tech={detailTech!}
          techByKey={techByKey}
          iconBase={iconBase}
          onJump={onJumpToTech}
          collapsed={detailCollapsed}
          onToggleCollapse={() => setDetailCollapsed((c) => !c)}
          draw={empireOn ? drawMap?.get(detailTech!.key) ?? null : null}
          onClose={() => setDetailHiddenFor(detailTech!.key)}
          onExplore={
            explore && focusKey === detailTech!.key
              ? undefined
              : () => {
                  // Same as double-click "activate", minus the drag guard (a
                  // panel button click is never a drag).
                  pushHistory();
                  setViewMode("explore");
                  setFocusKey(detailTech!.key);
                  setFocusExpanded(new Set([detailTech!.key]));
                }
          }
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
});
