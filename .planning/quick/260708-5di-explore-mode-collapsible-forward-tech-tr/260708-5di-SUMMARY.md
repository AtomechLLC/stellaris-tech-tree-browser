---
quick_id: 260708-5di
slug: explore-mode-collapsible-forward-tree
title: Explore mode — collapsible forward tech tree from the roots
status: complete
mode: quick
completed: 2026-07-08
tasks: 4
commits: 3
files_created:
  - app/src/lib/tree/exploreLayout.ts
  - app/src/test/exploreLayout.test.ts
files_modified:
  - app/src/lib/tree/layoutTree.ts
  - app/src/components/TechCard.tsx
  - app/src/components/TechTree.tsx
  - app/src/styles/app.css
---

# Quick Task 260708-5di: Explore Mode (Collapsible Forward Tech Tree) Summary

A second view alongside the swimlane Map: a Map ↔ Explore toggle. Explore opens
collapsed at the entry-point techs (roots with no prerequisites); expanding a
card's chevron reveals what that tech unlocks in the next tier, with connectors.
Reuses the existing viewport / imperative pan-zoom / cards / EdgeLayer / tooltip
/ selection — only the layout source, the chevron, and the toggle are new.

## Per-Task Commits

| Task | Commit    | Description                                                        |
| ---- | --------- | ----------------------------------------------------------------- |
| 1    | `61425c7` | Pure, synchronous `layoutExplore` (no ELK) + 8 unit tests         |
| 2    | `eadf6dd` | Expand chevron affordance on `TechCard` (opt-in, map-safe) + CSS  |
| 3    | `31a0ee2` | Map/Explore toggle + wire explore view into `TechTree` + CSS      |
| 4    | (gate)    | Final `npm run build` + `npm test` — both green (no new code)     |

## Explore Layout Approach

`layoutExplore(snapshot, expandedKeys, active, cardW, cardH): TreeLayout` returns
the SAME `TreeLayout` shape as `layoutTree` with `bands: []`, so the renderer
reuses the exact same cards + EdgeLayer + viewport transform.

- **No ELK** — a plain, synchronous DFS, cheap enough to recompute on every
  expand/collapse via `useMemo`.
- **Precompute (memoized per snapshot via a `WeakMap`):** `childrenByKey` =
  reverse-prereq map (tech → the techs it unlocks); `roots` = techs with
  `prerequisites.length === 0`, sorted by `(tier, categoryIndex, name)`
  (categoryIndex from `CATEGORY_INDEX`). Each child bucket is sorted the same way
  so a node's revealed unlocks appear in a stable order.
- **Dedup (spanning tree):** the tech graph is a DAG (multi-parent techs), but
  Explore renders it as a spanning tree — a GLOBAL `visited` set means each tech
  appears exactly once, at its first reveal in DFS pre-order. This keeps the
  "expand one thing, see its unlocks" model clean without duplicate rows.
- **Positions:** each visited node = one ROW. `x = depth * COL_W`,
  `y = rowIndex * ROW_H` where `COL_W = cardW + 90`, `ROW_H = cardH + 16`. Edges
  are parent→child pairs in the visible tree with `sections: []` → EdgeLayer
  draws its source-right → target-left elbows (identical to the map's fallback).
- **Filter:** respects the active category filter — a tech is shown-eligible only
  when its category is active (empty/full active set = no filtering). Roots and
  children are both filtered to shown-eligible.
- **Per-node flags:** each `LayoutNode` carries `expandable` (has ≥1
  shown-eligible child) and `expanded` (in `expandedKeys`). Two optional fields
  were added to `LayoutNode` — the map layout leaves them undefined.

## Toggle + Chevron UX

- **Toggle:** a segmented `Map / Explore` control at the top-left of the viewport
  (mirrors the Re-pack/zoom chrome, tokens only). Entering Explore fits the view
  to the collapsed root column (`fitToNodes` on the roots via `requestAnimation
  Frame`); leaving restores the map's default frame. Selection + filter persist
  across the switch.
- **Chevron:** `TechCard` gained optional `expandable` / `expanded` /
  `onToggleExpand` props. The chevron button (right edge, vertically centered,
  `▸` collapsed / `▾` expanded) renders ONLY when `expandable` is set — map mode
  passes nothing, so map cards are byte-for-byte unchanged. Its `onClick`
  `stopPropagation()`s and calls `onToggleExpand(tech.key)`, so expanding never
  selects the card.
- **Expand/collapse state:** `onToggleExpand` adds the key on expand; on collapse
  it removes the key AND BFS-prunes every descendant reachable through
  still-expanded nodes, so re-expanding later starts fresh (no silently
  pre-opened subtree).
- **Map-only affordances in Explore:** BandLayer (bands + watermarks), the
  Re-pack button, and the ancestry drill-down panel are all suppressed in
  Explore. CategoryNav filtering still applies (filters shown-eligible techs).
  Selection + gold-edge highlight + hover tooltip + F-Find + pan/zoom all keep
  working in Explore because they read the same shared layout/cards/transform.

## Build & Test Results

- `cd app && npm run build` → clean (tsc `--noEmit` + vite build, `✓ built`).
- `cd app && npm test` → **40 passed (40)** across 6 test files.
  - 32 pre-existing tests (layout, ancestry, smoke, theme, weight) — all still
    green, confirming Map-mode behavior is preserved.
  - 8 new `exploreLayout.test.ts` tests: roots-only when collapsed (no edges);
    roots one-per-row in column 0, sorted; expandable flag matches having
    children; expanding a root reveals children to the right with edges; dedup
    (each tech once, even fully expanded); collapse removes descendants;
    category filter respected; width/height bound the node extent + `bands: []`.

## Map Mode Unchanged — Confirmation

Map mode renders the exact same path as before: the banded swimlane ELK layout,
band tints + watermarks, imperative pan/zoom (`transformRef`/`applyTransform`,
no re-render), LOD `.lod-simple`, memoized cards/edges/bands, hover tooltip,
CategoryNav filter/isolate/fit + Re-pack, card selection + gold edge highlight +
hidden-ancestry panel, F-Find, weight-modifier tooltip.

- `LayoutNode.expandable`/`expanded` are optional and left undefined by
  `layoutTree` — the map layout code is unchanged apart from the two new type
  fields.
- Map cards pass no `expandable` prop → the chevron never renders → map cards are
  visually and behaviorally identical.
- The explore layout is memoized unconditionally but only consumed when
  `viewMode === "explore"`; in Map mode the canvas reads `filtered ?? state.layout`
  exactly as before.
- All 32 pre-existing tests pass unchanged.

## Deviations from Plan

None — plan executed as written. The `LayoutNode.expandable/expanded` optional
fields were added exactly as the plan specified; no unplanned scope.

## Known Stubs

None. The explore view is fully wired to the real snapshot data (roots,
reverse-prereq children, and edges are all derived from `snapshot.techs`).

## Self-Check: PASSED

- Files created exist: `app/src/lib/tree/exploreLayout.ts`,
  `app/src/test/exploreLayout.test.ts` — FOUND.
- Files modified exist: `layoutTree.ts`, `TechCard.tsx`, `TechTree.tsx`,
  `app.css` — FOUND.
- Commits exist: `61425c7`, `eadf6dd`, `31a0ee2` — FOUND in `git log`.
- `npm run build` clean; `npm test` 40/40 green.
- No file deletions across the three task commits.
