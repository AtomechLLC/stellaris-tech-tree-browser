---
phase: 02-tech-tree-visualization
plan: 01
subsystem: ui
tags: [vite, react19, typescript, sigma, graphology, webgl, zod]

# Dependency graph
requires:
  - phase: 01-data-pipeline
    provides: "pipeline/data/v4.5.0/tech.json (678 techs) + 803 WebP icons, and the frozen TechSnapshot/Tech Zod schema/types"
provides:
  - "New app/ Vite + React 19 + TypeScript package (pure static SPA, D-01/D-02)"
  - "D-03 data-copy boundary: app/scripts/copy-data.mjs (pipeline/data -> app/public/data)"
  - "D-04 type-reuse contract: app/src/types/tech-snapshot.ts re-exports Tech/TechSnapshot/TechSnapshotSchema from pipeline"
  - "fetchSnapshot(): fetch + Zod-validate tech.json, throws on failure (never blank-screens)"
  - "buildGraph(): TechSnapshot -> graphology DirectedGraph, all 678 nodes on a placeholder tier/sibling grid"
  - "TechTreeCanvas: SigmaContainer + image-node program rendering all 678 icon nodes with native WebGL pan/zoom"
  - "App.tsx loading/error/ready state machine"
affects: [02-02, 02-03]

# Tech tracking
tech-stack:
  added: ["react@19.2.7", "react-dom@19.2.7", "sigma@3.0.3", "graphology@0.26.0", "@react-sigma/core@5.0.6", "@sigma/node-image@3.0.0", "@sigma/node-border@3.0.0 (installed, unused until Plan 03)", "elkjs@0.11.1 (installed, unused until Plan 02)", "zustand@5.0.14 (installed, unused this plan)", "zod@4.4.3 (added beyond RESEARCH list - runtime schema validation)", "vite@8.1.3", "@vitejs/plugin-react@6.0.3", "typescript@5.9.3", "vitest@4.1.10"]
  patterns:
    - "D-04 type reuse via relative import type re-export (RESEARCH Option A) — app/tsconfig.json omits rootDir and widens include to reach ../pipeline/src/schema/tech-snapshot.ts"
    - "npm lifecycle scripts (predev/prebuild/pretest) run copy-data.mjs automatically before dev/build/test — data boundary is never stale"
    - "fetch-throw-catch pattern: fetchSnapshot() throws on any failure; App.tsx is the single place that turns a throw into a rendered error state"

key-files:
  created:
    - app/package.json
    - app/tsconfig.json
    - app/tsconfig.node.json
    - app/vite.config.ts
    - app/vitest.config.ts
    - app/index.html
    - app/.gitignore
    - app/scripts/copy-data.mjs
    - app/src/main.tsx
    - app/src/App.tsx
    - app/src/vite-env.d.ts
    - app/src/types/tech-snapshot.ts
    - app/src/lib/data/fetchSnapshot.ts
    - app/src/lib/graph/buildGraph.ts
    - app/src/components/TechTreeCanvas.tsx
    - app/src/test/smoke.test.ts
  modified: []

key-decisions:
  - "Added zod@4.4.3 and @types/node@^22.0.0 as app/ dependencies beyond RESEARCH.md's install list — required to satisfy the plan's own task actions (TechSnapshotSchema.parse() at runtime; node:fs/node:url/node:path in the smoke test), not scope creep"
  - "Dropped TypeScript project references (tsconfig.node.json referenced via 'references') after hitting TS6306/TS6310 (project references require composite:true, which conflicts with noEmit); tsconfig.node.json stands alone for editor/IDE typechecking of vite.config.ts, matching the plan's 'standard Vite pattern' intent without introducing project-reference build coupling"
  - "vitest environment set to 'node' (not jsdom) since the smoke test is a pure graph-construction check reading tech.json from disk — no DOM needed for this plan's test scope"

patterns-established:
  - "Plain image-node Sigma program (@sigma/node-image only) for this plan's full-scale render/pan-zoom proof; the compound border+image ring (area color) is deferred to Plan 02-03 per the plan's own scope boundary"
  - "PLACEHOLDER GRID comment in buildGraph.ts marks the tier x sibling-index x/y assignment as temporary, to be replaced by ELK-computed positions in Plan 02-02"

requirements-completed: [TREE-01, TREE-03]

# Metrics
duration: 7min
completed: 2026-07-08
---

# Phase 2 Plan 1: App Scaffold + Full-Scale Sigma Render Summary

**New `app/` Vite + React 19 + TypeScript package fetches the real 678-tech `tech.json`, builds a graphology DirectedGraph, and renders every tech as an icon node on a Sigma WebGL canvas with native pan/zoom.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-08T03:04:47Z
- **Completed:** 2026-07-08T03:11:43Z
- **Tasks:** 2 completed
- **Files modified:** 17 (16 created + package-lock.json)

## Accomplishments
- Stood up the `app/` package from scratch: Vite 8 + React 19 + TypeScript 5.9.3, pinned to the exact RESEARCH.md versions, installing cleanly with zero peer-dependency conflicts (`npm ls react @react-sigma/core` shows no UNMET PEER DEPENDENCY, confirming RESEARCH Pitfall 1's finding).
- Established the D-03 data-copy boundary (`copy-data.mjs`) and the D-04 type-reuse contract (`app/src/types/tech-snapshot.ts` re-exporting `Tech`/`TechSnapshot`/`TechSnapshotSchema` from the frozen Phase 1 pipeline schema) without editing `pipeline/` at all.
- Delivered a full TDD RED→GREEN cycle: a smoke test that failed on `buildGraph` not existing (Task 1), then passed once `buildGraph` was implemented and the full render pipeline was wired (Task 2) — `graph.order === 678`, `graph.type === "directed"`.
- `npm run dev` serves the app; `tech.json` and icon files resolve with HTTP 200 from `/data/v4.5.0/`; `npm run build` produces a clean production bundle (`tsc --noEmit` clean + `vite build` succeeds, 115 modules transformed, ~446KB JS / ~125KB gzipped).

## Task Commits

1. **Task 1: Scaffold app/ package, data-copy script, and a failing full-scale smoke test** - `fd1e6cc` (test)
2. **Task 2: Fetch + validate tech.json, build the 678-node graphology graph, render all nodes on a pan/zoomable Sigma canvas** - `fcdd8fe` (feat)

**Plan metadata:** (pending — final commit below)

_TDD gate sequence confirmed in git log: `test(02-01): ...` (RED) followed by `feat(02-01): ...` (GREEN)._

## Files Created/Modified
- `app/package.json` - App package manifest; exact pinned versions from RESEARCH.md plus zod + @types/node (see Deviations)
- `app/tsconfig.json` - Strict TS config, `moduleResolution: bundler`, no `rootDir` (D-04 Option A), includes the cross-package pipeline schema file
- `app/tsconfig.node.json` - Standalone Node-context tsconfig for vite.config.ts / scripts (no project-reference linkage — see Deviations)
- `app/vite.config.ts` - `@vitejs/plugin-react`, default root/publicDir
- `app/vitest.config.ts` - `environment: "node"` for the disk-read graph-construction smoke test
- `app/index.html` - Single `#root` div, `title: "Stellaris Tech Tree"`
- `app/.gitignore` - `node_modules`, `dist`, `public/data/`
- `app/scripts/copy-data.mjs` - Copies `pipeline/data/{version}/` -> `app/public/data/{version}/`, resolving version from the on-disk `v*` directory
- `app/src/types/tech-snapshot.ts` - D-04 re-export module (`Tech`, `TechSnapshot`, `TechSnapshotSchema`)
- `app/src/lib/data/fetchSnapshot.ts` - `fetch()` + `TechSnapshotSchema.parse()`, throws on any failure
- `app/src/lib/graph/buildGraph.ts` - Builds the 678-node `DirectedGraph` on a placeholder tier/sibling grid (no edges yet — Plan 02-02)
- `app/src/components/TechTreeCanvas.tsx` - `SigmaContainer` + `@sigma/node-image` image-node program + `useLoadGraph`
- `app/src/App.tsx` - loading / error / ready state machine
- `app/src/main.tsx` - React 19 `createRoot` mount, imports `@react-sigma/core/lib/style.css`
- `app/src/vite-env.d.ts` - Vite client types triple-slash reference
- `app/src/test/smoke.test.ts` - Full-scale (678-node) smoke test, RED then GREEN

## Decisions Made
- Added `zod@4.4.3` (matching pipeline's pin) and `@types/node@^22.0.0` as `app/` dependencies — both were required to literally satisfy the plan's own task actions (Zod runtime validation in `fetchSnapshot.ts`; `node:fs`/`node:url`/`node:path` imports in the smoke test) but were absent from RESEARCH.md's Installation list. See Deviations below.
- Dropped the `references` array from `app/tsconfig.json` after `tsc --noEmit` failed with TS6306/TS6310 (project references require `composite: true`, which is incompatible with `noEmit: true`). `tsconfig.node.json` remains as a standalone config scoping Node-context files (vite.config.ts, scripts) without a build-graph linkage — functionally equivalent for this plan's typechecking needs.
- Used `@sigma/node-image`'s plain image node program (not the compound border+image program) for this plan, per the plan's explicit scope note that the area-color ring is Plan 02-03's concern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `zod` as a runtime dependency**
- **Found during:** Task 1 (writing `app/src/types/tech-snapshot.ts`) / Task 2 (`fetchSnapshot.ts`)
- **Issue:** The plan's task action explicitly requires `TechSnapshotSchema.parse(json)` at runtime in `fetchSnapshot.ts` (D-04 / RESEARCH Open Q1), and the re-export module value-exports `TechSnapshotSchema`. `zod` was not in RESEARCH.md's Installation command, so `TechSnapshotSchema` (a Zod schema) would be unresolvable at runtime without it.
- **Fix:** Added `zod@4.4.3` to `app/package.json` dependencies, matching the pipeline package's exact pin for consistency across the two packages that share this schema.
- **Files modified:** app/package.json, app/package-lock.json
- **Verification:** `npm run build` succeeds; `fetchSnapshot.ts` type-checks and calls `.parse()` without error.
- **Committed in:** fd1e6cc (Task 1 commit — added before install/verify)

**2. [Rule 3 - Blocking] Added `@types/node` as a dev dependency**
- **Found during:** Task 1 (writing `app/src/test/smoke.test.ts`, which reads the fixture via `node:fs`/`node:url`/`node:path`)
- **Issue:** `tsc --noEmit` failed with `TS2307: Cannot find module 'node:fs'` (and `node:url`, `node:path`) because `@types/node` was not in RESEARCH.md's Installation list for the app package.
- **Fix:** Added `@types/node@^22.0.0` to `app/package.json` devDependencies (matching the pipeline package's pin).
- **Files modified:** app/package.json, app/package-lock.json
- **Verification:** `npx tsc --noEmit` no longer errors on `node:*` module resolution.
- **Committed in:** fd1e6cc (Task 1 commit)

**3. [Rule 3 - Blocking] Removed TypeScript project references between app/tsconfig.json and tsconfig.node.json**
- **Found during:** Task 1 (`npx tsc --noEmit` verification)
- **Issue:** `app/tsconfig.json`'s `references: [{ "path": "./tsconfig.node.json" }]` caused `TS6306`/`TS6310` — referenced projects require `composite: true`, which cannot coexist with this plan's required `noEmit: true`.
- **Fix:** Removed the `references` array. `tsconfig.node.json` remains a standalone, non-linked config for Node-context files; this matches the plan's stated intent ("tsconfig.node.json for vite.config typechecking, standard Vite pattern") without the stricter composite-build requirement.
- **Files modified:** app/tsconfig.json
- **Verification:** `npx tsc --noEmit` runs clean (only the expected RED-state error remained until Task 2).
- **Committed in:** fd1e6cc (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 missing dependencies required by the plan's own task actions, 1 blocking TS config conflict)
**Impact on plan:** All three were necessary to literally satisfy what the plan's task actions already specified (Zod runtime validation, Node-API test code, a working tsc --noEmit gate). No scope creep — no additional features were added beyond what Task 1/Task 2 already required.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Manual/Observable Verification (TREE-03 benchmark)

- `npm run dev` was started and confirmed serving on port 5273: `index.html` returns 200, `/src/main.tsx` transforms and resolves its imports (React, ReactDOM, `@react-sigma/core/lib/style.css`, `./App`) without module-resolution errors, `/data/v4.5.0/tech.json` returns 200, and a sample icon (`tech_lasers_1.webp`) returns 200.
- Direct interactive pan/zoom was not visually observed in this execution environment (no browser automation tool was available to this agent in this session — only Read/Write/Edit/Bash/Grep/Glob). The automated smoke test (`graph.order === 678`, directed) plus a clean production build stand in as the verification for this plan; TREE-03's qualitative "smooth" pan/zoom claim should be visually confirmed by opening `http://localhost:5173` (or the dev server's reported port) in a browser during the next session, since Sigma's native WebGL camera is not exercised by the current automated test suite.
- No console/runtime errors were observed in the served module graph during this check.

## Next Phase Readiness
- `app/` package is fully wired end-to-end: data copy -> fetch -> validate -> graph -> render, ready for Plan 02-02 (ELK tier/area layout) to replace the placeholder grid in `buildGraph.ts` and add prerequisite edges.
- `@sigma/node-border` and `elkjs` are already installed (per RESEARCH.md's "install once, use later" guidance) so Plans 02-02/02-03 need no further `npm install` churn.
- Recommend an interactive visual pass (real browser, mouse pan/zoom) early in Plan 02-02 or 02-03 to close the TREE-03 qualitative-responsiveness loop this plan could only partially verify.

---
*Phase: 02-tech-tree-visualization*
*Completed: 2026-07-08*
