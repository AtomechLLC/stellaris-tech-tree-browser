---
phase: 02-tech-tree-visualization
reviewed: 2026-07-08T04:03:57Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - app/src/App.tsx
  - app/src/main.tsx
  - app/src/components/TechTreeCanvas.tsx
  - app/src/components/TierAxis.tsx
  - app/src/components/Header.tsx
  - app/src/components/Legend.tsx
  - app/src/components/LoadingOverlay.tsx
  - app/src/components/ErrorOverlay.tsx
  - app/src/components/EmptyOverlay.tsx
  - app/src/lib/data/fetchSnapshot.ts
  - app/src/lib/graph/buildGraph.ts
  - app/src/lib/graph/layout.ts
  - app/src/lib/graph/areaBands.ts
  - app/src/lib/sigma/nodeProgram.ts
  - app/src/lib/sigma/theme.ts
  - app/src/types/tech-snapshot.ts
  - app/scripts/copy-data.mjs
  - app/vite.config.ts
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-08T04:03:57Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Reviewed the Phase 2 tech-tree visualization slice: the React 19 + Vite 8 SPA shell,
the sigma.js (v3, WebGL) canvas, the graphology graph builder, the one-shot elkjs
layout + area-band Y-remap, the CSS-token → Sigma theme bridge, and the build-time
data-copy script. Cross-checked against the real 678-node / 613-edge v4.5.0 corpus and
the frozen `TechSchema` contract.

**The phase's designated high-severity threat — untrusted tech strings reaching the DOM
as HTML — is VERIFIED CLEAN.** No `dangerouslySetInnerHTML`, `innerHTML`, or `eval`
anywhere in `app/src`. Tech `name` flows to the graph as a plain-text `label` attribute
(`buildGraph.ts:38`) and is rendered by Sigma's WebGL/canvas text layer, never as HTML;
`description` and `unlocks.grants` are not rendered at all in this phase. The only
user-facing string rendered in React DOM is `Tier {tier}` where `tier` is a
schema-validated number. No injection surface exists.

**The other three headline contracts also hold:**
- *Layout computed once, never on pan/zoom* — `layoutGraph` runs a single time inside
  App's loading effect (`App.tsx:38`); no `forceAtlas2`/`graphology-layout` import
  exists; `TierAxis` re-projects via the camera transform only, never re-layouts.
- *All colors from tokens.css* — no hardcoded hex in any `.ts`/`.tsx`; the edge/label/
  area colors are all bridged through `readThemeTokens()`. (The two `rgba(0,0,0,0.12)`
  box-shadows in `app.css` are decorative shadows, not themeable palette values —
  acceptable.)
- *React 19 + react-sigma lifecycle* — App's fetch effect uses a `cancelled` guard, so
  no setState-after-unmount; `SigmaContainer` guards settings-object identity churn with
  a deep `isEqual`, so passing a fresh settings object per render does not re-instantiate
  Sigma.

No BLOCKER-severity defects were found. The findings below are robustness / correctness-
under-drift issues (WARNING) and minor quality notes (INFO). None block shipping the
current single-version v4.5.0 build, but WR-02 and WR-03 will silently break the *next*
data regeneration, which is the project's explicit "make future version updates cheap"
goal — so they are worth fixing now while the coupling is fresh.

## Warnings

### WR-01: `hexToRgba` silently emits invalid `rgba(NaN, NaN, NaN, a)` for any non-6-digit-hex token

**File:** `app/src/components/TechTreeCanvas.tsx:36-42`
**Issue:** `hexToRgba` assumes the bridged `--color-edge` token is always a full 6-digit
`#rrggbb` string. If the token is empty (e.g. `getComputedStyle` returns `""` before the
stylesheet resolves, or during a future dark-theme swap that momentarily reads an unset
var), a 3-digit shorthand (`#abc`), or any `rgb(...)`/named-color form, `parseInt` yields
`NaN` and the function returns an unparseable CSS string like `rgba(NaN, NaN, NaN, 0.5)`.
Sigma then silently fails to color the edges (or throws inside its color parser) with no
diagnostic. Verified experimentally: empty string → `rgba(NaN, NaN, NaN, 0.5)`; `#abc` →
`rgba(171, 12, NaN, 0.5)`. Today's tokens are valid 6-digit hex so this does not fire,
but the theme bridge is explicitly designed to be re-invoked for a v2 dark mode, which is
exactly when a mistyped/short token would slip through undetected.
**Fix:** Validate the parse and fail loudly (or fall back) instead of producing garbage:
```ts
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`hexToRgba: expected 6-digit hex, got "${hex}"`);
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

### WR-02: Icon path hardcodes `v4.5.0` while the snapshot version is parameterized — 404s on any version bump

**File:** `app/src/lib/graph/buildGraph.ts:41` (vs `app/src/lib/data/fetchSnapshot.ts:11-12`)
**Issue:** `fetchSnapshot(version = "v4.5.0")` fetches `/data/${version}/tech.json` — the
version is a parameter — but `buildGraph` builds icon URLs with a hardcoded literal:
`` `/data/v4.5.0/icons/${tech.icon}` ``. The two are decoupled. `copy-data.mjs`
*dynamically* resolves the version from the pipeline output dir, so the moment the
pipeline regenerates for a new game version (e.g. `v4.6.0`), the data lands in
`public/data/v4.6.0/` while every icon `<image>` still points at `/data/v4.5.0/icons/…`
and 404s — an all-icons-broken render with no error surfaced (icons just silently fail to
paint). This directly undercuts the project constraint that "the pipeline should make
future version updates cheap." The version must be threaded through, not duplicated.
**Fix:** Pass the resolved version into `buildGraph` and derive the icon base from it, or
export a single `DATA_VERSION` constant consumed by both `fetchSnapshot` and `buildGraph`:
```ts
export function buildGraph(snapshot: TechSnapshot, tokens?: ThemeTokens): DirectedGraph {
  const version = snapshot.meta.gameVersion; // e.g. "v4.5.0" — single source of truth
  // ...
  image: tech.icon ? `/data/${version}/icons/${tech.icon}` : undefined,
```
(`meta.gameVersion` is already in the schema — confirm the copied dir name matches its
format, or normalize once.)

### WR-03: `resolveVersion()` picks the wrong directory once a two-digit version component appears

**File:** `app/scripts/copy-data.mjs:16-31`
**Issue:** `resolveVersion()` sorts the `v*` directory names with a plain lexicographic
`.sort()` and takes the last element, with a comment claiming it selects the
"lexicographically latest." Lexicographic ordering is not semver ordering: given
`v4.9.0` and `v4.10.0`, `.sort()` yields `["v4.10.0", "v4.5.0", "v4.9.0"]`, so `.pop()`
returns `v4.9.0` — the *older* version — because `"9" > "1"` character-wise. Verified
experimentally. Today only one `v*` dir exists so it can't fire, but this is a latent
data-staleness bug in the exact tool whose job is version selection, and it fails
silently (copies old data, app looks fine but shows stale techs — the precise failure
mode this project exists to fix).
**Fix:** Sort with a numeric-aware comparator, or (simpler and unambiguous) read the
authoritative version from the snapshot's `meta.gameVersion` rather than inferring it from
directory names:
```js
const entries = readdirSync(PIPELINE_DATA_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith("v"))
  .map((e) => e.name)
  .sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
```

### WR-04: `TierAxis` derives tier columns only on `[sigma]` and has no re-trigger when the graph (re)populates — relies on sibling effect ordering

**File:** `app/src/components/TierAxis.tsx:21-56`
**Issue:** `TierAxis`'s effect reads `sigma.getGraph()` and builds `minXByTier` a single
time, keyed on `[sigma]`. The Sigma instance's graph starts **empty** — it is populated
by `GraphLoader`'s effect (`useLoadGraph` → `graph.import`, `TechTreeCanvas.tsx:47-49`),
which is a *sibling* effect. If `TierAxis`'s effect ran before the graph was imported,
`forEachNode` would iterate nothing, `tiers` would be `[]`, and no tier labels would ever
render — because `[sigma]` never changes, the effect would not re-run once nodes arrive.
It currently works only because `GraphLoader` is listed *before* `TierAxis` in the JSX
(`TechTreeCanvas.tsx:61-62`), and React runs sibling effects in child order, and
`useLoadGraph` is synchronous. That is three implicit assumptions holding by luck of
ordering; reordering the JSX children, or a future async graph load, silently breaks the
tier axis with no error. The derivation should be driven by an observable graph-population
signal, not mount ordering.
**Fix:** Recompute tier columns in response to graph changes, e.g. subscribe to the graph
or key the effect on a graph-version/"ready" signal so it re-derives when nodes land:
```ts
useEffect(() => {
  const graph = sigma.getGraph();
  const derive = () => { /* build minXByTier + reproject */ };
  derive();
  graph.on("nodeAdded", derive);
  graph.on("cleared", derive);
  // ...existing camera/resize wiring...
  return () => {
    graph.removeListener("nodeAdded", derive);
    graph.removeListener("cleared", derive);
    // ...existing cleanup...
  };
}, [sigma]);
```
At minimum, add a comment documenting the load-order dependency so it isn't silently
broken by a future refactor.

## Info

### IN-01: `buildSigmaSettings()` is called inline in JSX, re-reading `getComputedStyle` on every render

**File:** `app/src/components/TechTreeCanvas.tsx:58`
**Issue:** `settings={buildSigmaSettings()}` invokes `readThemeTokens()` →
`getComputedStyle(document.documentElement)` on every render of `TechTreeCanvas`. It is
functionally harmless (the component rarely re-renders, and `SigmaContainer` deep-`isEqual`
compares the settings before acting), but it does a forced style recalculation each render
and constructs a fresh settings object needlessly.
**Fix:** Memoize it: `const settings = useMemo(() => buildSigmaSettings(), []);` (empty
deps — tokens are static for the lifetime of the mount in Phase 2).

### IN-02: `copy-data.mjs` never clears the destination, so stale files from a previous version/run accumulate

**File:** `app/scripts/copy-data.mjs:42`
**Issue:** `cpSync(srcDir, destDir, { recursive: true })` copies over the top of whatever
is already in `public/data/<version>/`. If an icon is removed from the pipeline between
runs, its stale copy lingers in the served output; and if the resolved version differs
from a previous run, the old version's directory is left behind entirely (compounding
WR-02/WR-03's version confusion). The script's docstring says "Idempotent" but it is only
additive-idempotent, not a true mirror.
**Fix:** Remove the destination (or the whole `public/data/<version>` dir) before copying,
e.g. `rmSync(destDir, { recursive: true, force: true })` prior to `cpSync`, so the copy is
a clean mirror of the pipeline output.

---

_Reviewed: 2026-07-08T04:03:57Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
