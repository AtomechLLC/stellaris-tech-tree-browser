---
quick_id: 260708-4io
slug: selectable-cards-highlighted-edges-hidden-ancestry
title: Selectable tech cards + highlighted prereq/child edges + hidden-ancestry drill-down
status: complete
completed: 2026-07-08
mode: quick
---

# Quick Task 260708-4io — Summary

Selection is now the spine of the DOM tech tree: click-to-target a card (drag-safe,
toggle, Escape/empty-click clears), the selected node's prereq + child edges become
solid thick gold, and when the selection depends on filter-hidden techs a left-side
drill-down panel surfaces its full upstream ancestry (hidden ones marked, hoverable,
re-selectable). Existing pan/zoom/LOD/memoization/hover/nav/re-pack behavior is
preserved.

## Per-task commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 | `955c850` | `feat(260708-4io): drag-safe selectable cards + edge-highlight wiring` — selection state + drag/click discrimination + card props + EdgeLayer highlight path + `--color-select` token |
| 2 | `8d06536` | `feat(260708-4io): gold target highlight for selected card + its edges` — `.tech-card[data-selected]` outline/glow + `.edge-layer__path--highlight` CSS |
| 3 | `bfcd4b2` | `feat(260708-4io): hidden-ancestry drill-down panel` — pure `ancestry.ts` helper + `AncestryPanel` + TechTree wiring + panel/mini-card CSS |
| 4 | `35ba563` | `test(260708-4io): unit-cover the recursive ancestry helper` — 11 assertions (depth, hidden flags, cycle-safe, columns) |

> **Task 1/2 split note:** the build gate couples `TechTree → EdgeLayer` (TechTree
> passes `selectedKey`), so the functional layer (TS/TSX) all landed in Task 1 to keep
> the commit compilable in isolation; Task 2 is the pure visual CSS (card outline + edge
> stroke). Each commit builds and tests green on its own.

## How drag-safe selection works

- A `movedRef` (ref&lt;boolean&gt;) is reset to `false` on `onPointerDown` and set to
  `true` in `onPointerMove` once the pointer travels &gt; `DRAG_THRESHOLD` (4px) from the
  pointerdown origin (`Math.hypot`).
- `onSelect(key)` (stable `useCallback`) early-returns if `movedRef.current` is set, so a
  pan that ends over a card never selects; otherwise it toggles
  `setSelectedKey(k => k === key ? null : key)`.
- Deselect paths: an `Escape` window `keydown` listener (effect, mounted once) and a
  viewport `onClick` that clears when `e.target.closest('.tech-card')` is null (also
  `movedRef`-guarded so a drag-release on background doesn't deselect).
- `TechCard` gets `selected` + `onSelect` (both stable), `data-key`, `data-selected`, and
  an `onClick` calling `onSelect?.(tech.key)`.

## Highlight approach

- `EdgeLayer` gained an optional `selectedKey` prop. The existing single combined base
  `<path>` (all edges, dim dashed) is unchanged and memoized on `[edges, nodes]`.
- A **second** `<path class="edge-layer__path--highlight">` is rendered on top, whose `d`
  covers only edges where `from === selectedKey || to === selectedKey` (the selection's
  prerequisites AND children/leadsTo). Path building is factored into a shared `buildPath`
  helper so base + highlight use identical elbow routing; the highlight is memoized on
  `[edges, nodes, selectedKey]` so pan/zoom never rebuild it.
- CSS: solid, 3px, fully-opaque `var(--color-select)` gold stroke.
- Perf preserved: `selectedKey` was added to the `content` useMemo deps, so a selection
  change re-renders only the 2 changed cards (React.memo bails the rest); hover/pan don't
  touch `selectedKey`, so they still reuse the memo.

## Ancestry-panel layout + trigger

- **Trigger:** `computeAncestry(selectedKey, active, techByKey)` does a cycle-guarded BFS
  of recursive `prerequisites`, recording each ancestor's **min-hop depth** and a
  **hidden** flag (`!active.has(category)`; the root at depth 0 is never hidden). The
  panel mounts only when `hasHiddenAncestor(nodes)` is true — nothing hidden → no panel.
- **Layout:** a `position:fixed` overlay anchored to the **left** of the selected card's
  DOMRect (captured post-render via `useLayoutEffect` reading
  `.tech-card[data-key=…]`), clamped into the viewport and flipping right if there's no
  room; scrollable if tall. `ancestryColumns` buckets nodes into **depth-columns**
  (deepest prereqs leftmost, selected tech rightmost) with a dashed connector rail
  between columns.
- **Mini-cards:** icon + plain-text name (D-05, React children — never innerHTML),
  area-colored left border. Hidden ancestors get a dashed border + a gold "hidden" dot.
  Each is a `<button>` that reuses the card hover pathway (same `onEnter`/`onLeave` → the
  shared `TechTooltip` anchored to the mini-card's rect) and, on click, calls `onSelect`
  to re-root the drill-down on that ancestor.

## Preserved behavior (verified by build + green tests)

Imperative pan/zoom (transformRef/applyTransform, no re-render), LOD `.lod-simple` class,
memoized cards/edges/bands, hover tooltip, CategoryNav filter + isolate/fit, Re-pack
button, band watermarks — all untouched. The `content` memo's new deps are
selection-only, so hover/pan paths are unchanged.

## Deviations from Plan

None beyond the documented Task 1/2 commit-split note above (a build-ordering choice, not
a scope change). Plan executed as written.

## Colors / tokens

`--color-select: #ffd23f` (gold) added to `tokens.css` next to the `--area-*` tokens;
every selection color (card outline/glow, edge stroke, panel accent, hidden dot, root
outline) references it — no bare hex in a component.

## Build / test results

- `cd app && npm run build` — clean (tsc `--noEmit` + vite build), after each task.
- `cd app && npm test` — **21 passed (4 files)**: the original 10 layout/smoke tests plus
  11 new `ancestry.test.ts` assertions (depth, shortest-path diamond join, hidden flags,
  cycle-safety, dangling-ref skip, unknown-root empty, column bucketing).

## Self-Check: PASSED

- Files exist: `app/src/lib/graph/ancestry.ts`, `app/src/components/AncestryPanel.tsx`,
  `app/src/test/ancestry.test.ts` — all FOUND.
- Commits exist: `955c850`, `8d06536`, `bfcd4b2`, `35ba563` — all FOUND.
