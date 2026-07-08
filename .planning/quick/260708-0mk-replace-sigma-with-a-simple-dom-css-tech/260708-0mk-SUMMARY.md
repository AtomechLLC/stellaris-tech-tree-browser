---
quick_id: 260708-0mk
slug: dom-reference-styled-tech-tree
title: Reference-styled DOM tech tree — ELK layout + DOM cards + SVG connectors (replace Sigma)
status: complete
completed: 2026-07-08
mode: quick
---

# Quick Task 260708-0mk — Reference-styled DOM tech tree Summary

Replaced the Sigma/WebGL render path with a pure-DOM reference-styled tech tree:
ELK computes a layered LR layout + orthogonal edge routing, then DOM `.tech-card`s
and an SVG edge layer render inside ONE CSS-transformed `.tree-canvas` — so pan/zoom
is a single `transform: translate(pan) scale(zoom)` with no per-frame sync, no
projection, no culling, and no camera concept.

## Per-task commits

| Task | Commit | Type | What |
| ---- | ------ | ---- | ---- |
| 1 | `73f2337` | feat | `lib/tree/layoutTree.ts` — ELK layered LR layout from `snapshot.techs`, tier-pinned via `elk.partitioning`, `elk.edgeRouting: ORTHOGONAL`; returns `{ nodes[{key,x,y,w,h,tech}], edges[{from,to,sections}], width, height }`. |
| 2 | `baa9437` | feat | `components/TechCard.tsx` — fixed 230×92 reference-style card (icon + tier badge, area-colored header with plain-text name, `Category · Tier`, `Cost · Weight`). |
| 4 | `87f5910` | feat | `components/EdgeLayer.tsx` — SVG polyline paths from ELK section bend points; elbow fallback for section-less edges. |
| 3 + 5 | `d0cf0d3` | refactor | `components/TechTree.tsx` (canvas + pan/zoom + area tabs), `App.tsx` rewire, dark-theme CSS/tokens, test rewrite, and removal of the entire Sigma render path. |

> Note on ordering: Tasks 3 (render swap) and 5 (tabs / dark theme / tests) landed in
> one commit because they touch the same files (`app.css`, `tokens.css`, the two test
> files) inseparably, and the swap must land atomically to keep `npm run build` +
> `npm test` green at that commit (the Sigma-file removals break `App.tsx`/tests until
> the rewire and new tests land together). Tasks 1, 2, 4 are additive and committed
> independently, each with a green build.

## Files removed (Sigma render path)

- `components/TechTreeCanvas.tsx` (SigmaContainer host)
- `components/TechCardOverlay.tsx` (zoom-LOD projected card overlay)
- `components/TierAxis.tsx`, `components/CategoryAxis.tsx` (camera-synced axes)
- `lib/graph/buildGraph.ts` (graphology graph builder)
- `lib/graph/layout.ts` (Sigma-coupled ELK + swimlane remap)
- `lib/graph/swimlanes.ts` (category-lane Y-remap)
- `lib/sigma/nodeProgram.ts` (@sigma/node-image tile program)
- `main.tsx`: dropped `@react-sigma/core/lib/style.css` import

Kept (per plan): `lib/graph/categories.ts`, `lib/sigma/theme.ts` (`--area-*` bridge +
its `theme.test.ts`), `Legend.tsx`, `ErrorBoundary.tsx`, all overlays, `Header.tsx`.

## ELK edge-routing quality

Measured on the real 678-node / 613-edge corpus (card size 230×92):

- **613 / 613 edges (100%)** returned ELK orthogonal routing `sections` — every
  connector is a real elbow route, not a straight-line fallback.
- **906 bend points** total across those sections → reference-style right-angle
  elbows between tier columns.
- Layout extent: **7994 × 30910** graph units (wide tier columns, tall vertical
  stack — area is conveyed by card color, not forced bands, so ELK optimizes
  crossings freely as in the reference tool).
- Tier ordering verified monotonic (tier 0 leftmost → tier 5 rightmost) by unit test.

## Card size, pan/zoom, tabs

- **Card:** fixed **230 × 92** DOM card (the exact size handed to `layoutTree`, so
  ELK spacing and DOM positions line up). Icon panel (60px) with roman-numeral tier
  badge, area-colored header + border via `data-area` → `--area-*` tokens, faint
  inline-SVG hex-mesh texture (CSP-safe data-URI). Name is PLAIN TEXT (React
  children, never `innerHTML` — D-05).
- **Pan:** pointer drag on `.tree-viewport` updates a `translate` state (pointer
  capture; `grab`/`grabbing` cursor).
- **Zoom:** wheel zooms toward the cursor (keeps the graph point under the cursor
  fixed), `+`/`−` buttons zoom about the viewport center, reset button; clamped
  **0.15–1.5**. All are one CSS transform on `.tree-canvas` — edges + cards move
  together automatically.
- **Tabs:** All / Physics / Society / Engineering filter the rendered nodes+edges
  (edges kept only when both endpoints survive the filter); active tab tints to its
  area color. Dark-theme viewport (`--tree-*` tokens) so cards pop.

## Constraints honored

- Area colors sourced only from `--area-*` / `--tree-*` tokens — no hardcoded hex in
  new components/CSS.
- Tech name rendered as plain text (D-05 XSS contract).
- elkjs runs in-process (`elk.bundled.js`, no real web worker — Pitfall 4).
- No Sigma / WebGL / overlay / camera / projection in the render path (verified: the
  production bundle has zero `SigmaContainer` / `@react-sigma` references — tree-shaken
  out even though the deps remain declared).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Atomic-commit ordering to keep every commit's build green**
- **Found during:** Task 3 (render swap).
- **Issue:** `git rm` of the Sigma-coupled modules stages deletions into the index
  globally; an initial commit sequence accidentally swept all 8 deletions into the
  Task 1 commit, leaving that intermediate commit unbuildable (App.tsx still imported
  the removed `buildGraph`/`layout`).
- **Fix:** `git reset --soft` over the just-created local commits (on this worktree
  branch only — no protected ref, no pushed/concurrent work) and re-committed in a
  build-green-per-commit order: additive `layoutTree`/`TechCard`/`EdgeLayer` first,
  then one atomic render-swap commit carrying the deletions + rewire + tests together.
- **Files modified:** commit graph only (no source change).
- **Commits:** final sequence `73f2337`, `baa9437`, `87f5910`, `d0cf0d3`.

**2. [Rule 1 - Process recovery] Recovered work from an accidental `git stash`**
- **Found during:** Task 3 verification.
- **Issue:** A `git stash --include-untracked` command executed against intent and
  moved the entire (uncommitted) render-swap working set into a stash, reverting the
  working tree to the Sigma-era files.
- **Fix:** Confirmed the single stash entry was this session's own WIP (stashed on our
  own commit `73f2337`, containing only files created this session), then
  `git stash pop` restored it cleanly with no conflicts; re-verified each restored
  file was the new version (no react-sigma import in `main.tsx`, `layoutTree` in the
  tests, `.tree-viewport` in `app.css`). Full build + test re-run green afterward.
- **Files modified:** none beyond restoration.

## Deps left to prune (follow-up)

`sigma@3.0.3`, `graphology@0.26.0`, `@react-sigma/core@5.0.6`, `@sigma/node-image@3.0.0`,
`@sigma/node-border@3.0.0` are now unused by any source (tree-shaken out of the bundle)
but remain declared in `app/package.json` per the plan ("leave the deps, prune later").
`elkjs` and `zustand` are KEPT (elkjs is the layout engine; zustand remains available).
A future cleanup can remove the 5 Sigma packages.

## Verification

- `cd app && npm run build` → clean (tsc `--noEmit` + vite build, ✓ built).
- `cd app && npm test` → 3 files, 8 tests passed (layoutTree tier→x ordering, edge
  validity, node count == tech count, orthogonal routing; smoke; theme bridge).
- Production bundle contains no Sigma references (tree-shaken).
- Dev server (http://localhost:5174, HMR — left running) picked up all changes.
- Pure DOM: the orchestrator can screenshot/verify and do the visual polish pass.

## Self-Check: PASSED

- `lib/tree/layoutTree.ts`, `components/TechCard.tsx`, `components/EdgeLayer.tsx`,
  `components/TechTree.tsx` — all present on disk.
- Commits `73f2337`, `baa9437`, `87f5910`, `d0cf0d3` — all present in `git log`.
- Removed Sigma files confirmed absent from HEAD.
