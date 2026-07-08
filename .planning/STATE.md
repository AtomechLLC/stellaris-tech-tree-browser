---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 2 complete (3/3) — ready to discuss Phase 3
last_updated: 2026-07-08T04:28:59.412Z
last_activity: 2026-07-08
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 8
  completed_plans: 8
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-07)

**Core value:** Players can quickly find any technology and understand how to reach it — accurate 4.5.0 data, presented clearly, navigable without friction.
**Current focus:** Phase 3 — navigation & discovery

## Current Position

Phase: 3
Plan: Not started
Status: Ready to plan
Last activity: 2026-07-08 - Completed quick task 260708-0mk: replaced Sigma with a reference-styled DOM tech tree (ELK + DOM cards + SVG connectors)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 8
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5 | - | - |
| 2 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01-data-pipeline P01 | 55 | 3 tasks | 10 files |
| Phase 01-data-pipeline P02 | 45min | 3 tasks | 5 files |
| Phase 01-data-pipeline P03 | 12min | 1 tasks | 2 files |
| Phase 01-data-pipeline P04 | 32min | 2 tasks | 4 files |
| Phase 01-data-pipeline P05 | 17min | 3 tasks | 7 files |
| Phase 02-tech-tree-visualization P01 | 7min | 2 tasks | 16 files |
| Phase 02-tech-tree-visualization P02 | 11min | 2 tasks | 6 files |
| Phase 02-tech-tree-visualization P03 | 6min | 2 tasks | 15 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Build new tool instead of forking bloodstainedcrow (stale data pipeline, broken UI)
- Roadmap: Parse from local 4.5.0 game files for accuracy and repeatable version updates
- Roadmap: Static/client-side web app — no server needed
- Roadmap: 3-phase coarse structure — Data Pipeline → Tech Tree Visualization → Navigation & Discovery, sequenced so data correctness and layout land before general UI work (per research)
- [Phase ?]: unlocks.grants/leadsTo are required non-optional arrays (no Zod default) so a fixture missing either sub-field fails schema validation, per D-05
- [Phase 01]: Pinned TypeScript to 5.9.3 explicitly, resolving the 5.x/6.x drift RESEARCH.md flagged
- [Phase 01]: cost/weight extraction defensively preserves block-form via costRaw/weightModifierRaw for the documented-but-unobserved Open Question 1 shape
- [Phase 01]: DLC filename-to-display-name matching uses normalized-token subset containment, not a hand-typed table (D-08)
- [Phase 01]: OR-block prerequisite alternatives are flattened into prerequisites as real graph edges rather than modeling AND/OR schema semantics
- [Phase 01]: jomini's duplicate top-level scalar key artifact (e.g. repeated weight=) resolved via last-value-wins, matching Clausewitz override semantics
- [Phase 01]: resolveTechText returns null (not throws) for a missing name -- strict-fail policy (D-16) deliberately left to assemble.ts (Plan 05)
- [Phase 01]: Raw localisation strings ship unmodified as plain text -- no HTML conversion of color codes or variable tokens in the pipeline, per Security Domain guidance (T-03-02)
- [Phase 01]: technology_swap.name refers to another tech's key, not an icon filename -- inherit_icon flag is the sole signal for whether the swap has its own icon file
- [Phase 01]: A fully-opaque alpha channel is correctly dropped by sharp's lossless WebP encoder (verified via ImageMagick channel min/max) -- not a fidelity bug, so alpha-preservation tests must use a fixture with genuinely non-uniform alpha
- [Phase 01]: buildUnlocks resolves feature_flags/prereqfor_desc/modifier/gateway grant content independently via locMap (resolve-or-verbatim), keeping each as its own list entry rather than one blob per tech
- [Phase 01]: assemble.ts collects all tech keys missing a resolved name before strict-failing, giving one complete error report per run instead of failing on the first miss
- [Phase 01]: Full-corpus (D-18) integration tests live in a dedicated corpus.test.ts with explicit long timeouts, isolated from fast per-module unit test files to avoid races on shared full-pipeline output paths
- [Phase 02-tech-tree-visualization]: Added zod and @types/node as app/ dependencies beyond RESEARCH.md's install list — Required to literally satisfy the plan's own task actions: TechSnapshotSchema.parse() at runtime and node:fs/node:url/node:path in the smoke test
- [Phase 02-tech-tree-visualization]: Dropped TypeScript project references between app/tsconfig.json and tsconfig.node.json — TS6306/TS6310 - project references require composite:true which conflicts with noEmit:true required by this plan
- [Phase 02-tech-tree-visualization]: vitest environment set to node (not jsdom) for the app package — Smoke test is a pure graph-construction check reading tech.json from disk - no DOM needed for this plan's test scope
- [Phase 02-tech-tree-visualization]: elk.separateConnectedComponents must be set to false at the ELK root -- default (true) silently breaks tier-partition monotonicity on the real DAG's many disconnected components; offset with elk.layered.thoroughness=1 to keep one-shot layout cost acceptable (~6.5s vs ~26-32s)
- [Phase 02-tech-tree-visualization]: Area-band Y-remap implemented as a sort-stable remap only (physics/society/engineering order, 4000-unit bands, 400-unit gap) -- ELK has no native swim-lane mechanism for this axis, so this is required application code, not an ELK config flag
- [Phase 02-tech-tree-visualization]: theme.test.ts stubs getComputedStyle directly instead of switching the app package to a jsdom vitest environment -- avoids a new dependency purely for one test file while exercising the real bridge code path
- [Phase 02-tech-tree-visualization]: Edge opacity is baked into a single rgba() string derived from the bridged --color-edge hex, since Sigma Settings has no separate edge-opacity field to pair with defaultEdgeColor

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1 research flag: jomini's handling of `@variable` references, inline `@[ ]` math, and multi-condition `weight_modifier` blocks needs validation against the real 4.5.0 corpus (not assumed from general library reputation)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260707-we6 | Category swimlanes + reference-style zoom-LOD tech cards | 2026-07-08 | 17668cf..b58df93 | [260707-we6-...](./quick/260707-we6-category-swimlanes-and-square-tile-nodes/) |
| 260708-0mk | Replace Sigma with a reference-styled DOM tech tree (ELK layout + DOM cards + SVG connectors) | 2026-07-08 | 73f2337..8c0059e | [260708-0mk-...](./quick/260708-0mk-replace-sigma-with-a-simple-dom-css-tech/) |
| 260708-2v7 | Left category navigation panel (toggle categories + click to isolate) | 2026-07-08 | 7118c43 | [260708-2v7-...](./quick/260708-2v7-left-category-navigation-panel-with-togg/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 requirement | BEEL-01 (cost-aware beeline path) | Deferred to v2 | Roadmap creation |
| v2 requirement | SHARE-01 (URL-shareable state) | Deferred to v2 | Roadmap creation |
| v2 requirement | THEME-01 (dark mode toggle) | Deferred to v2 | Roadmap creation |
| v2 requirement | WGHT-01 (structured weight modifiers) | Deferred to v2 | Roadmap creation |
| v2 requirement | FLAG-01 (rare/dangerous/repeatable/starting flags + legend) | Deferred to v2 | Roadmap creation |
| v2 requirement | MINI-01 (minimap) | Deferred to v2 | Roadmap creation |
| v2 requirement | UNLK-01 (deep unlocks browser) | Deferred to v2 | Roadmap creation |
| v2 requirement | MOBL-01 (mobile/touch layout) | Deferred to v2 | Roadmap creation |

## Session Continuity

Last session: 2026-07-08T03:55:30.303Z
Stopped at: Completed 02-03-PLAN.md
Resume file: None
