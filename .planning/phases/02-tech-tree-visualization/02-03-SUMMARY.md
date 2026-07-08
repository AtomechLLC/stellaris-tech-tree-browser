---
phase: 02-tech-tree-visualization
plan: 03
subsystem: ui
tags: [sigma, node-border, node-image, css-tokens, theming, react]

# Dependency graph
requires:
  - phase: 02-tech-tree-visualization (Plans 01-02)
    provides: "app/ package with buildGraph (678 nodes + 613 edges), layoutGraph (ELK tier-partition + area-band Y-remap), TechTreeCanvas (plain image-node Sigma render), App.tsx loading/error/ready state machine"
provides:
  - "tokens.css: single CSS-custom-property source of truth (D-11), light theme as :root default, structured for a future [data-theme=dark] pure token swap"
  - "theme.ts: readThemeTokens() + AREA_COLOR() — the ONLY place CSS-var values enter TS, bridging tokens.css into Sigma settings/node attributes (D-12)"
  - "buildGraph now sets per-node areaColor/color from the bridged tokens (optional tokens param, DOM-guarded default, backward compatible)"
  - "nodeProgram.ts: NodeCompoundProgram (createNodeBorderProgram + createNodeImageProgram via createNodeCompoundProgram) — icon + area-colored ring (D-09)"
  - "TechTreeCanvas: bridged edge/label colors, compound node program registered, TierAxis + Legend mounted as canvas overlays"
  - "TierAxis: camera-synced tier column labels (graphToViewport re-projection on camera 'updated' + sigma 'resize')"
  - "Legend, Header, LoadingOverlay, ErrorOverlay (with working Retry), EmptyOverlay — full UI-SPEC chrome and copy"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getComputedStyle CSS-var -> Sigma bridge (theme.ts) written as a small, pure, re-callable function taking no cached module state — a future dark-mode toggle re-invokes it and re-applies results, no rework needed (D-12)"
    - "buildGraph(snapshot, tokens?) optional-param pattern keeps existing call sites compiling while adding themed per-node attributes; DOM-guarded lazy default (typeof document !== 'undefined') keeps headless vitest runs (layout.test.ts/smoke.test.ts, environment: 'node') from ever touching getComputedStyle"
    - "Edge color+opacity baked into a single rgba() string derived from the bridged --color-edge hex at Sigma-settings-construction time, since Sigma's Settings interface has no separate edge-opacity knob — color and opacity must be combined before being handed to defaultEdgeColor"
    - "TierAxis re-projects tier x-offsets via sigma.graphToViewport() on the Sigma camera's 'updated' event and the Sigma instance's 'resize' event — no re-layout, cheap coordinate conversion only, consistent with D-10's no-per-frame-relayout guarantee"

key-files:
  created:
    - app/src/styles/tokens.css
    - app/src/styles/app.css
    - app/src/lib/sigma/theme.ts
    - app/src/lib/sigma/nodeProgram.ts
    - app/src/components/Header.tsx
    - app/src/components/TierAxis.tsx
    - app/src/components/Legend.tsx
    - app/src/components/LoadingOverlay.tsx
    - app/src/components/ErrorOverlay.tsx
    - app/src/components/EmptyOverlay.tsx
    - app/src/test/theme.test.ts
  modified:
    - app/src/lib/graph/buildGraph.ts
    - app/src/components/TechTreeCanvas.tsx
    - app/src/App.tsx
    - app/src/main.tsx

key-decisions:
  - "theme.test.ts stubs globalThis.document/getComputedStyle directly rather than switching the package's vitest environment to jsdom — avoids adding a new dependency/config change purely for one test file, while still exercising readThemeTokens()'s real getComputedStyle code path"
  - "theme.test.ts's stub token values are parsed live from the real tokens.css file (a tiny regex reader) rather than hand-copied hex literals in the test — both keeps the test honest against future tokens.css drift and satisfies the plan's own 'no hardcoded hex outside tokens.css' grep gate, which a naive hand-copied-hex test fixture would have violated"
  - "Edge opacity (UI-SPEC: --color-edge @ 0.5) is combined with the bridged hex into a single rgba() string at Sigma-settings-construction time (TechTreeCanvas.tsx's hexToRgba helper) since Sigma's Settings type has no standalone edge-opacity field to pair with a hex defaultEdgeColor"
  - "TierAxis renders as a Sigma-canvas-overlay child (absolutely positioned within react-sigma's already-position:relative root), not as a separate flex row above the canvas — matches the UI-SPEC's visual intent (a strip pinned to the top of the canvas viewport) while keeping the coordinate math anchored to the same viewport Sigma itself renders into; pointer-events:none on .tier-axis keeps it from intercepting pan/zoom/click"

patterns-established:
  - "Single tokens.css + getComputedStyle bridge as THE only DOM->WebGL color path; enforced by a grep gate (no hardcoded hex in any .ts/.tsx) that this plan's implementation satisfies cleanly"

requirements-completed: [TREE-04, UIFX-01]

# Metrics
duration: 6min
completed: 2026-07-08
---

# Phase 2 Plan 3: Themed Icon+Ring Nodes, Tier-Axis, Legend, and UI-SPEC Chrome Summary

**Every one of the 678 tech nodes now renders its WebP icon inside an Okabe-Ito area-colored ring with its plain-text localized name, a camera-synced tier-axis header keeps tier legible while panning, and all DOM+Sigma colors flow from one `tokens.css` via a re-callable `getComputedStyle` bridge — completing Phase 2.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-08T03:44:09Z
- **Completed:** 2026-07-08T03:49:49Z
- **Tasks:** 2 completed
- **Files modified:** 15 (11 created, 4 modified)

## Accomplishments
- `tokens.css` is now the single source of truth for every color/spacing/typography value used anywhere in the app (D-11) — light theme shipped as the `:root` default, structured so a future `[data-theme="dark"]` block requires zero component changes.
- `theme.ts`'s `readThemeTokens()` is the only place a CSS custom-property value enters TypeScript, bridging `--color-*`/`--area-*` tokens into both Sigma's WebGL settings and per-node graph attributes (D-12) — written as a small pure function with no cached module state so it is trivially re-callable for a future dark-mode swap.
- `buildGraph` gained an optional `tokens` parameter and now sets `areaColor`/`color` per node from the bridge; the default path is DOM-guarded (`typeof document !== "undefined"`) so existing headless tests (`layout.test.ts`, `smoke.test.ts`, both running under vitest's `"node"` environment) never touch `getComputedStyle`.
- `nodeProgram.ts` combines `@sigma/node-border` (area-color ring) and `@sigma/node-image` (WebP icon, `objectFit: "contain"`) via sigma's own `createNodeCompoundProgram` — exactly the RESEARCH.md Pattern 1 shape, verified directly against the installed packages' `.d.ts` declarations before writing the code.
- `TechTreeCanvas` registers the compound program as the default node type, bridges edge color+opacity (baked into a single `rgba()` string, since Sigma's `Settings` type has no separate opacity knob) and label color from tokens, and mounts `TierAxis` + `Legend` as canvas overlays.
- `TierAxis` derives each tier's representative graph-x (min-x per tier, from ELK's tier-partition monotonicity guarantee) once, then re-projects it to screen-x via `sigma.graphToViewport()` on every camera `"updated"` event and Sigma `"resize"` event — no re-layout, a cheap coordinate conversion only (D-10).
- `Header`, `Legend`, `LoadingOverlay`, `ErrorOverlay` (with a working Retry that re-runs the fetch+layout pipeline via a retry-token state), and `EmptyOverlay` (triggers when a ready snapshot has zero techs) implement the UI-SPEC's exact Copywriting Contract text, verbatim.
- Full verification suite green: `tsc --noEmit` clean, `vitest run` (8/8 tests across 3 files, unchanged pass count plus the new `theme.test.ts` GREEN), `vite build` succeeds (129 modules, ~570KB gzip JS), and all four grep gates pass (`dangerouslySetInnerHTML` absent, hardcoded hex absent outside `tokens.css`, `createNodeCompoundProgram` present, camera subscription present in `TierAxis.tsx`).

## Task Commits

Each task was committed atomically:

1. **Task 1: tokens.css single source + getComputedStyle theme bridge + area-colored nodes** - `7224453` (test, RED) then `f789bc3` (feat, GREEN)
2. **Task 2: Compound icon+ring node program, Sigma label/edge theming, and the full chrome** - `4c0a003` (feat)

**Plan metadata:** (pending — final commit below)

_TDD gate sequence confirmed in git log for Task 1: `test(02-03): add failing test for readThemeTokens...` (RED — `lib/sigma/theme` module unresolved) followed by `feat(02-03): tokens.css single source...` (GREEN — all 3 theme.test.ts assertions pass). Task 2 has no new failing test of its own (its `<verify>` re-runs the full existing suite plus grep gates, per the plan's own verification spec) — committed as a single `feat` covering the full chrome/theming wiring._

## Files Created/Modified
- `app/src/styles/tokens.css` - All UI-SPEC color/spacing/typography tokens under `:root`; engineering ring is `#D55E00` (vermillion), not green
- `app/src/styles/app.css` - DOM chrome layout rules (header, tier-axis strip, legend, loading/error/empty overlays) — every value references a tokens.css custom property
- `app/src/lib/sigma/theme.ts` - `readThemeTokens()` (getComputedStyle bridge) + `AREA_COLOR()` (area -> ring color mapping)
- `app/src/lib/sigma/nodeProgram.ts` - `NodeCompoundProgram` combining border-ring + image-icon programs via `createNodeCompoundProgram`
- `app/src/lib/graph/buildGraph.ts` - Adds optional `tokens` param; sets per-node `areaColor`/`color` from the bridge, DOM-guarded lazy default
- `app/src/components/TechTreeCanvas.tsx` - Registers the compound program, bridges edge/label Sigma settings, mounts TierAxis + Legend
- `app/src/components/TierAxis.tsx` - Camera-synced tier column labels
- `app/src/components/Legend.tsx` - Bottom-left area-color swatch legend
- `app/src/components/Header.tsx` - Fixed 48px title strip, renders immediately during loading
- `app/src/components/LoadingOverlay.tsx` / `ErrorOverlay.tsx` / `EmptyOverlay.tsx` - UI-SPEC loading/error(Retry)/empty states, exact copy
- `app/src/App.tsx` - Renders Header always; drives overlay-vs-canvas by status incl. empty-snapshot detection; retry re-runs fetch+layout via a retry-token effect dependency
- `app/src/main.tsx` - Imports `tokens.css` and `app.css` globally
- `app/src/test/theme.test.ts` - Asserts `readThemeTokens()`/`AREA_COLOR()` against real tokens.css values (parsed live, not hand-copied) via a stubbed `getComputedStyle`

## Decisions Made
See `key-decisions` in frontmatter above — summarized: stub-based `theme.test.ts` (no new jsdom dependency), live-parsed tokens.css values in that test (keeps the grep gate honest), edge opacity baked into a single `rgba()` string (Sigma has no separate opacity setting), and TierAxis rendered as a canvas-overlay child rather than a separate layout row (keeps its coordinate math anchored to the same viewport Sigma renders into).

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria and grep gates from the plan's own `<verify>` blocks pass without needing any Rule 1-4 deviation.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Manual/Observable Verification (TREE-03/TREE-04, Pitfall 5)

- `npm run dev` was started and confirmed serving on port 5173: `index.html`, `/src/main.tsx`, `/src/App.tsx`, `/src/styles/tokens.css`, `/src/styles/app.css`, `/data/v4.5.0/tech.json`, and a sample icon (`tech_lasers_1.webp`) all return HTTP 200. `/src/main.tsx`'s transformed module output confirms `tokens.css` and `app.css` are imported in the expected order (tokens before app.css before the react-sigma stylesheet import ordering doesn't matter since they target disjoint selectors).
- Direct interactive pan/zoom visual inspection (icon+ring nodes, tier-axis alignment during a pan, Pitfall-5 halo/fragment-artifact check at the full 678-node density, legend rendering) was **not** performed in this execution environment — consistent with Plans 01 and 02's same documented limitation (no browser-automation tool was available to this agent in this session — only Read/Write/Edit/Bash/Grep/Glob). The automated test suite (theme bridge assertions + existing smoke/layout assertions, all GREEN), the clean production build, and the static grep gates (compound program present, camera subscription present, no hardcoded hex, no `dangerouslySetInnerHTML`) stand in as verification for this plan's structural correctness claims.
- **Recommendation carried forward to project close-out:** an interactive visual pass in a real browser (opening `http://localhost:5173`, panning/zooming across the full 678-node render) is still owed to close the loop on TREE-03's qualitative "smooth, no lag" claim and TREE-04's "icon+ring+label legible at a glance" claim, and to check for Pitfall-5's border/image z-order artifacts at real node density. This has now been deferred across all three plans in this phase for the same environment-availability reason; it should be the first thing checked in Phase 3 or in a dedicated manual QA pass before considering the tech tree visualization production-ready.
- No console/module-resolution errors were observed in the served module graph during this check.

## Next Phase Readiness
- Phase 2 (Tech Tree Visualization) is now functionally complete per its own success criteria: TREE-01 through TREE-04 and UIFX-01 are all implemented and automatically verified (build/test/grep gates). The one remaining open item across the whole phase is the qualitative browser-visual pass noted above (present since Plan 01, not blocking, not something any of these plans' available tooling could close).
- The `tokens.css` + `theme.ts` bridge is a clean foundation for Phase 3 (search/filter/detail panel, per ROADMAP) to add new chrome without re-litigating the theming architecture, and for the deferred v2 THEME-01 (dark mode) to be a pure token-swap addition.
- `buildGraph`'s optional `tokens` parameter and DOM-guarded default mean Phase 3 code can continue calling `buildGraph(snapshot)` unchanged, or pass an explicit tokens object in tests exactly as this plan's own headless tests do.

---
*Phase: 02-tech-tree-visualization*
*Completed: 2026-07-08*
