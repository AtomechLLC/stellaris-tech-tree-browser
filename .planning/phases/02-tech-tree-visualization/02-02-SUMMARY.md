---
phase: 02-tech-tree-visualization
plan: 02
subsystem: ui
tags: [elkjs, graphology, sigma, dag-layout, tier-partitioning]

# Dependency graph
requires:
  - phase: 02-tech-tree-visualization (Plan 01)
    provides: "app/ Vite+React+TS package with buildGraph (placeholder grid), TechTreeCanvas (Sigma image-node render), fetchSnapshot, App.tsx loading/error/ready state machine"
provides:
  - "buildGraph.ts now adds all 613 real prerequisite DAG edges (D-07), replacing Plan 01's edge-less placeholder"
  - "layout.ts: layoutGraph(graph) — one-shot elkjs layered layout with tier partitioning (D-06), wired into App.tsx's loading path (D-08)"
  - "areaBands.ts: remapAreaBands — required post-layout Y-remap grouping nodes into physics/society/engineering horizontal bands (ELK has no native swim-lane mechanism)"
  - "Discovered + fixed real-scale ELK gotcha: elk.separateConnectedComponents must be false for global tier-partition monotonicity across a graph with many disconnected components; elk.layered.thoroughness=1 recovers acceptable one-shot performance (~6.5s at 678 nodes/613 edges)"
affects: [02-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ELK input graph built fresh each layoutGraph() call from the graphology graph's current node/edge state (one ELK child per node with per-node elk.partitioning.partition = tier, one ELK edge per graphology edge)"
    - "Area-band Y-remap: group ELK's output nodes by area, stable-sort each group by ELK's own y (preserves crossing-minimization), then offset into a fixed non-overlapping vertical band per area — implemented as its own reusable module (areaBands.ts) separate from layout.ts's ELK-graph plumbing"
    - "layoutGraph is awaited inside App.tsx's existing loading path (before the ready state transition), so a layout throw falls into the existing catch/error-state handling rather than needing new error plumbing"

key-files:
  created:
    - app/src/lib/graph/layout.ts
    - app/src/lib/graph/areaBands.ts
  modified:
    - app/src/lib/graph/buildGraph.ts
    - app/src/test/layout.test.ts
    - app/src/App.tsx
    - app/src/components/TechTreeCanvas.tsx

key-decisions:
  - "Set elk.separateConnectedComponents: 'false' at the ELK root — REQUIRED beyond what RESEARCH.md documented. ELK's default (true) lays out each disconnected connected-component of the graph independently and repacks them side-by-side afterward, which reorders components and silently destroys the tier-partition's global left-to-right monotonicity. The tech DAG has many disconnected components (techs with no shared ancestor chain), so this default breaks D-06's tier-column guarantee at real scale (confirmed with both a 20-node synthetic repro and the full 678-node corpus — tier-0 nodes ended up to the right of tier-5 nodes without this fix)."
  - "Set elk.layered.thoroughness: '1' to offset the ~4x layout-time cost that disabling separateConnectedComponents introduces (default thoroughness ~7 took 26-32s at full scale with the fix applied; thoroughness=1 takes ~6.5s with identical monotonic-partition correctness, verified by direct comparison)."
  - "layout.test.ts's layoutGraph-exercising tests are given an explicit 20s per-test timeout (vitest default is 5s) since ELK's real one-shot layout at 678 nodes/613 edges takes several seconds even after tuning — this is expected D-08 cost, not a performance regression to chase further in this plan."
  - "Area band ordering fixed as physics / society / engineering (top to bottom), each band 4000 graph-space units tall with a 400-unit gap between bands — matches CONTEXT.md's 'Claude's Discretion' allowance for band height/ordering."
  - "Implemented the sort-stable area-band remap only (RESEARCH Open Q2's recommended first attempt) — no secondary sort was added. See 'Observable Verification' below for the visual-quality read on this choice."

patterns-established:
  - "ELK gotchas specific to a graph with many disconnected components (not just documentation-level ELK semantics) must be benchmarked against the REAL corpus, not a toy example — a small connected synthetic test can pass while the real disconnected-heavy graph silently breaks partitioning."

requirements-completed: [TREE-01, TREE-02]

# Metrics
duration: 11min
completed: 2026-07-08
---

# Phase 2 Plan 2: DAG Edges + ELK Tier/Area Layout Summary

**Real tech tree structure now renders: all 613 prerequisite edges as a true multi-parent DAG, laid out by elkjs with tier columns pinned from the game's own `tier` field and a post-layout Y-remap grouping nodes into three area bands — replacing Plan 01's placeholder grid.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-08T03:22:52Z
- **Completed:** 2026-07-08T03:33:56Z
- **Tasks:** 2 completed
- **Files modified:** 6 (2 created, 4 modified)

## D-08 Benchmark (elk.layout() wall-clock time, full 678-node / 613-edge corpus)

| Configuration | Wall-clock time | Tier-partition monotonic? |
|---|---|---|
| Default ELK settings (`separateConnectedComponents: true`, default thoroughness) | ~8s | **No** — broken at real scale |
| `separateConnectedComponents: false`, default thoroughness (~7) | ~26-32s | Yes |
| `separateConnectedComponents: false`, `thoroughness: 1` (**chosen**) | **~6.5s** | Yes |

**Final ELK spacing/tuning values chosen** (in `layout.ts`):
- `elk.algorithm: "layered"`, `elk.direction: "RIGHT"`
- `elk.partitioning.activate: "true"`, per-node `elk.partitioning.partition: String(tier)`
- `elk.separateConnectedComponents: "false"` (required fix — see Deviations)
- `elk.layered.thoroughness: "1"` (required to keep the fix's cost acceptable)
- `elk.layered.spacing.nodeNodeBetweenLayers: "80"`, `elk.spacing.nodeNode: "40"` (RESEARCH.md's starting values, not further tuned — no overlap artifacts observed in the automated tier/area assertions)

**Area-band ordering/heights chosen** (in `areaBands.ts`): physics (top) / society (middle) / engineering (bottom), each band 4000 graph-space units tall, 400-unit gap between adjacent bands.

**Sort-stable remap verdict (RESEARCH Open Q2):** Implemented the sort-stable remap (preserve ELK's own relative y-order within each area group) as the first and only attempt per Open Q2's recommendation. The automated area-band assertion (three fully disjoint y-ranges, one per area, computed from the real 678-node corpus) passes cleanly — no crossing/overlap between bands. A secondary sort was not needed; visual inspection was not performed in a real browser this session (no browser-automation tool available — see Manual/Observable Verification), so this verdict is based on the automated disjoint-range assertion, not a rendered screenshot.

## Accomplishments
- `buildGraph.ts` now adds all 613 real prerequisite edges (directed prerequisite -> dependent, D-07) across the full 678-tech corpus; the 88 multi-parent techs (max 5 prerequisites on one tech, `tech_growth_chamber_1`) each connect to ALL their parents — a true DAG, not tree-flattened.
- `layout.ts` computes the tree layout once via elkjs (`elkjs/lib/elk.bundled.js`, zero-config in-process fake worker per RESEARCH Pattern 3 — no real Web Worker), pinning tier columns from the game's own `tier` field via ELK's native `partitioning` feature (D-06), not edge-inferred layering (the exact Treant.js failure mode this phase counters).
- `areaBands.ts` implements the REQUIRED post-layout Y-remap (ELK has no native swim-lane mechanism) grouping nodes into three disjoint horizontal area bands, preserving ELK's crossing-minimization quality within each group via a stable sort.
- Discovered and fixed a genuine ELK gotcha not present in RESEARCH.md: `elk.separateConnectedComponents`'s default (`true`) silently breaks global tier-partition monotonicity on a graph with many disconnected components (verified with both a minimal synthetic repro and the real full-scale corpus) — fixed with `separateConnectedComponents: false` + `thoroughness: 1` to keep the one-shot layout cost acceptable (~6.5s).
- `App.tsx` now awaits `layoutGraph(graph)` inside the existing loading path before transitioning to ready — a layout throw falls into the existing error-state handling, no blank screen.
- Full test suite (5 tests across 2 files) and `npm run build` (tsc --noEmit + vite build) both pass at full 678-node/613-edge scale.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add all 613 prerequisite edges to the directed graph; write the failing layout assertions** - `44f12b3` (test)
2. **Task 2: elkjs tier-partitioned layout + area-band Y-remap; wire it into the load path** - `520eed4` (feat)

**Plan metadata:** (pending — final commit below)

_TDD gate sequence confirmed in git log: `test(02-02): add all 613 prerequisite edges...` (RED — layoutGraph import unresolved) followed by `feat(02-02): elkjs tier-partitioned layout...` (GREEN — all 4 layout.test.ts assertions pass)._

## Files Created/Modified
- `app/src/lib/graph/buildGraph.ts` - Adds all 613 prerequisite edges (`addEdge(prereqKey, tech.key)` per prerequisites[] entry, D-07); dangling-reference branch calls `console.error` (SCHEMA.md D-16 contract); placeholder grid x/y removed
- `app/src/lib/graph/layout.ts` (new) - `layoutGraph(graph)`: builds ELK input from graphology, runs `elk.layout()` once with tier partitioning + the `separateConnectedComponents`/`thoroughness` tuning, calls `remapAreaBands`, writes final x/y back onto graphology
- `app/src/lib/graph/areaBands.ts` (new) - `remapAreaBands(graph, elkResult)`: groups by area, stable-sorts by ELK's y, offsets into fixed vertical bands
- `app/src/test/layout.test.ts` - buildGraph edge assertions (613 edges, multi-parent connectivity) + layoutGraph assertions (tier->x monotonic, area->y banded), both GREEN; 20s per-test timeout for the layoutGraph-exercising tests
- `app/src/App.tsx` - `await layoutGraph(graph)` inserted into the loading path before the ready-state transition
- `app/src/components/TechTreeCanvas.tsx` - Comment clarifying Sigma's default edge-line program renders all edges as-is (no suppressing setting configured)

## Decisions Made
See `key-decisions` in frontmatter above — summarized: `elk.separateConnectedComponents: false` is required for tier-partition correctness at real scale (a genuine gap in RESEARCH.md, discovered via benchmarking rather than documentation), offset by `elk.layered.thoroughness: 1` to keep the resulting layout cost acceptable (~6.5s vs. ~26-32s at default thoroughness).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `elk.separateConnectedComponents` default breaks tier-partition monotonicity at real scale**
- **Found during:** Task 2 (writing `layout.ts`, running the layout.test.ts assertions for the first time)
- **Issue:** With only the RESEARCH.md-documented ELK options (`elk.algorithm: layered`, `elk.direction: RIGHT`, `elk.partitioning.activate: true`, per-node `elk.partitioning.partition`), the tier->x monotonicity test failed against the real 678-node corpus: a tier-0 node's x (3436) was greater than a tier-5 node's x (272) — tiers were not forming clean left-to-right columns at all (every tier's x-range spanned nearly the full graph width). Root-caused via a minimal synthetic repro (a 20-node/6-tier graph with random edges reproduced the same monotonicity failure) then bisected against ELK's known layout options: ELK's default `elk.separateConnectedComponents: true` lays out each disconnected connected-component of the graph independently and repacks the resulting sub-layouts side by side, which reorders components and destroys the global tier-partition ordering the whole graph was supposed to have. The tech DAG has many disconnected components (leaf/isolated-lineage techs), so this default silently broke D-06's core correctness guarantee.
- **Fix:** Set `elk.separateConnectedComponents: "false"` at the ELK root, forcing ELK to solve the whole graph as one layered-layout problem and preserving global tier-column monotonicity. Verified with both the synthetic repro and the real corpus (`maxX(tier N) <= minX(tier N+1)` for all six tiers).
- **Files modified:** app/src/lib/graph/layout.ts
- **Verification:** `layout.test.ts`'s tier->x monotonicity assertion passes against the real 678-node/613-edge corpus.
- **Committed in:** 520eed4 (Task 2 commit)

**2. [Rule 1 - Bug] Disabling `separateConnectedComponents` raised one-shot layout cost ~4x; tuned `thoroughness` to recover acceptable D-08 performance**
- **Found during:** Task 2, immediately after fixing Deviation 1 — the corrected layout took 26-32s at full scale (vs. ~8s with the broken-but-fast default), risking an unacceptably long D-08 loading-state wait.
- **Issue:** `separateConnectedComponents: false` forces ELK's full crossing-minimization machinery to run over the entire 678-node graph as a single problem instead of many small independent ones, which is significantly more expensive.
- **Fix:** Benchmarked `elk.layered.thoroughness` (controls crossing-minimization iteration count) at several values against the real corpus; `thoroughness: 1` reduced wall-clock time to ~6.5s with identical monotonic-partition correctness to higher thoroughness values (verified: tier ordering unaffected, only crossing-minimization *quality* trades off, which is a cosmetic/readability concern this plan's automated tests don't measure and is an acceptable Claude's-Discretion tuning tradeoff per CONTEXT.md).
- **Files modified:** app/src/lib/graph/layout.ts
- **Verification:** Direct wall-clock comparison across `thoroughness` values (1, 2, 4) against the real 678-node/613-edge corpus, all producing correct monotonicity; `thoroughness: 1` chosen as the fastest correct option.
- **Committed in:** 520eed4 (Task 2 commit)

**3. [Rule 3 - Blocking] Extended vitest per-test timeout for layoutGraph-exercising tests**
- **Found during:** Task 2, first run of `layout.test.ts` after `layout.ts` existed
- **Issue:** vitest's default 5000ms test timeout was shorter than ELK's real one-shot layout time (~7-8s before tuning, ~6.5s after), causing both layout-dependent tests to fail with "Test timed out" rather than a real assertion failure.
- **Fix:** Added an explicit 20000ms timeout to the two `it(...)` blocks that call `layoutGraph` against the real corpus (a generous margin above the measured ~6.5-8s, tolerant of slower CI/dev machines), leaving the fast buildGraph-only tests at the default timeout.
- **Files modified:** app/src/test/layout.test.ts
- **Verification:** All 4 tests in layout.test.ts pass; total file runtime ~13-15s across both layoutGraph invocations (test isolation means each test re-runs the full layout independently).
- **Committed in:** 520eed4 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule-1 correctness bugs surfaced only at real full-scale benchmarking, 1 Rule-3 blocking test-infrastructure fix)
**Impact on plan:** All three were necessary to make the plan's own explicit acceptance criteria (tier->x monotonic, area->y banded, D-08 "benchmark against the REAL full graph") actually hold at real scale — RESEARCH.md's documented ELK options were correct as far as they went but incomplete for a graph with this many disconnected components. No scope creep; no additional features beyond what Task 2 already required.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Manual/Observable Verification (D-08, TREE-01, TREE-02)

- `npm run dev` was started and confirmed serving on port 5173: `index.html`, `/src/main.tsx`, `/src/App.tsx`, `/data/v4.5.0/tech.json`, and a sample icon all return HTTP 200; `/src/lib/graph/layout.ts` transforms cleanly through Vite's module graph with `elkjs` resolved via dependency pre-bundling (no worker-bundling errors — confirms RESEARCH Pattern 3/Pitfall 4's zero-config `elk.bundled.js` approach works as documented in this Vite 8 setup).
- Direct interactive pan/zoom visual inspection (tier columns rendering left-to-right, three visible area bands, edges connecting real prerequisites, multi-parent techs visibly fanning in from multiple parents) was **not** performed in this execution environment — no browser-automation tool (e.g., Chrome DevTools MCP, computer-use) was available to this agent in this session, consistent with Plan 01's same limitation. The automated test suite's structural assertions (all 613 edges present with correct multi-parent connectivity; tier->x fully monotonic across all six tiers; area->y forms three disjoint, non-overlapping ranges) stand in as verification for this plan's correctness claims. TREE-01/TREE-02's qualitative "readable at a glance" / "no visual hairball" claims should be visually confirmed by opening `http://localhost:5173` in a real browser during the next session, ideally alongside Plan 02-03 (compound node-image+border program, theming) since that plan will also touch node/edge visual styling.
- No module-resolution or runtime console errors were observed in the served module graph during this check.

## Next Phase Readiness
- The real tech tree DAG (678 nodes, 613 edges, tier-partitioned + area-banded) is fully wired end-to-end: data -> graph -> ELK layout -> fixed x/y -> Sigma render, ready for Plan 02-03 (compound node-border+node-image program for the area-color ring, CSS-token theming bridge, tier-axis header, legend).
- `layoutGraph`/`remapAreaBands` are written as clean, re-callable, side-effect-scoped units (no module-level mutable layout state beyond the shared `ELK` instance) — Plan 02-03 can call them as-is without needing to touch layout internals.
- Recommend an interactive visual pass (real browser) early in Plan 02-03 to close both this plan's and Plan 01's deferred TREE-02/TREE-03 qualitative-readability/responsiveness verification loop, now that there's an actual DAG+layout to look at (Plan 01 only had the placeholder grid).
- The ~6.5s one-shot ELK layout time is within UI-SPEC's "Loading the tech tree... this takes a few seconds" copy budget, but is worth re-benchmarking if Plan 02-03's node/edge visual changes (compound programs) add meaningful overhead to the overall load sequence.

---
*Phase: 02-tech-tree-visualization*
*Completed: 2026-07-08*
