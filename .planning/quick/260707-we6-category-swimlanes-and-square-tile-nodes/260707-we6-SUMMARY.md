---
quick_id: 260707-we6
slug: category-swimlanes-and-reference-style-cards
title: Category swimlanes + reference-style HTML tech cards (zoom-LOD)
status: complete
completed: 2026-07-07
tasks_total: 6
tasks_done: 6
---

# Quick Task 260707-we6 — Summary

**Status: COMPLETE** — all 6 tasks executed, each committed atomically (code
only). `npm run build` clean and `npm test` green (10/10) after every task.
No fallbacks needed; no deviations from the plan. Visual QA + constant tuning
is left to the orchestrator in the live dev server (I have no browser tools).

## What shipped, per task

| Task | Commit | What shipped |
|------|--------|--------------|
| 1 — Data + swimlane layout | `17668cf` | `categories.ts` (single source of truth); `swimlanes.ts` (13 count-scaled lanes nested in 3 areas, exports `LaneGeometry` + `getLaneGeometry()`); `buildGraph` carries `category`/`name`/`cost`/`weight`; `layout.ts` returns lane geometry; `layout.test.ts` asserts per-node lane membership, area order, non-overlap, x-fixed |
| 2 — Compact square tiles | `76a1863` | `nodeProgram.ts` → single `createNodeImageProgram({ keepWithinCircle:false, drawingMode:"background", colorAttribute:"areaColor", padding:0.12 })`; dropped circular border ring; node size 12→14 |
| 3 — HTML card overlay (headline) | `c8208f9` | `TechCardOverlay.tsx` — camera-synced (rAF-coalesced), viewport-culled, LOD-gated HTML cards (icon+tier badge, area-colored header w/ name, `Category – Tier`, `Cost/Weight`); plain-text name (D-05); wired into canvas; `.tech-card*` CSS |
| 4 — Lane axis | `555185a` | `CategoryAxis.tsx` — camera-synced re-projection of lane geometry; left-edge labels at lane centers + faint alternating area-tinted background bands; wired into canvas |
| 5 — Legend | `9001de8` | `Legend.tsx` groups the 13 category names under their 3 area colors; reuses `CATEGORY_ORDER/LABEL/AREA` |
| 6 — Final verification | (this doc) | Full build + test green; self-check passed |

## Tuning knobs (named constants — orchestrator: adjust in dev server)

### `swimlanes.ts` — lane geometry (graph-space units)
- `PER_NODE = 60` — vertical units allotted per node in a lane (lane height = `max(MIN_LANE, count*PER_NODE)`)
- `MIN_LANE = 400` — minimum lane height floor (so archaeostudies/psionics @24 aren't stretched, biology @121 gets room)
- `LANE_GAP = 120` — gap between adjacent lanes within one area
- `AREA_GAP = 320` — extra gap inserted between two different areas
- (icon inset within a lane = `min(height*0.12, PER_NODE/2)`)

### `TechCardOverlay.tsx` — zoom-LOD cards
- **`RATIO_THRESHOLD = 0.9`** — the tile↔card swap point. Sigma `camera.ratio`
  is INVERSE zoom (smaller = more zoomed in): `ratio < 0.9` → cards render;
  `ratio >= 0.9` → nothing (square Sigma tiles show through). **This is the
  headline knob** — raise it to make cards appear further out, lower to require
  a closer zoom.
- `CULL_MARGIN = 220` — viewport-pixel margin for on-screen culling
- `CARD_BASE_RATIO = 0.5` — ratio at which card scale == 1
- `CARD_SCALE_MIN = 0.55`, `CARD_SCALE_MAX = 1.6` — card scale clamp (scale = `clamp(CARD_BASE_RATIO/ratio)`)
- Card DOM width fixed at `220px` (in `.tech-card` CSS), icon panel `56px`

### `nodeProgram.ts` — square tiles
- `TILE_PADDING = 0.12` — icon inset inside the tile (larger = thicker area frame)
- node `size = 14` (in `buildGraph.ts`)

## Fallbacks taken

**None.** The installed `@sigma/node-image@3.0.0` type declarations confirm
`keepWithinCircle`, `drawingMode`, `padding`, `colorAttribute`, `imageAttribute`
are all valid options and `objectFit` is NOT (matching the plan's note) — so the
square-tile switch went in as specified without needing the circular-node
fallback. Square rendering (`keepWithinCircle:false`) still needs a live
visual confirm by the orchestrator, but it compiles/builds cleanly and is the
documented API for square image nodes in this version.

## Notes for the orchestrator's visual pass

- The card overlay only mounts cards when zoomed past `RATIO_THRESHOLD`; if
  cards never appear, the initial `animatedReset` framing may leave `ratio`
  above 0.9 at the default view — that's expected (cards are a zoom-in feature).
  Zoom in to test; tune `RATIO_THRESHOLD` up if you want them sooner.
- Card body is fixed-width (220px) so long tech names ellipsize in the header;
  widen `.tech-card` width or the icon/body ratio if names truncate too early.
- Lane background bands are very faint (`opacity 0.05` / `0.1` striped) by
  design; bump those two opacities if lanes need to read more strongly.
- `.category-band` z-index is 1 (behind the WebGL canvas chrome), labels are
  z-index 7 (above cards). Adjust if bands should sit visually differently.

## XSS / plain-text contract (D-05)

Tech `name` is rendered as React children (`{card.name}`) in the card title —
never `innerHTML`. Category labels come from the typed `CATEGORY_LABEL` map (or
a Title-Case fallback of the key), also plain text. Contract preserved.

## Verification

- `cd app && npm run build` → clean (`tsc --noEmit` + `vite build`, ✓ built)
- `cd app && npm test` → **10/10 passed** (3 files: smoke, layout, theme)
  - net +2 tests vs. baseline (8): the area-band test was replaced by two
    swimlane tests (per-node lane membership + non-overlap; x-fixed) plus the
    area-order test, all against the real 678-node corpus.

## Self-Check: PASSED

Created files exist on disk: `categories.ts`, `swimlanes.ts`,
`TechCardOverlay.tsx`, `CategoryAxis.tsx`. Commits `17668cf`, `76a1863`,
`c8208f9`, `555185a`, `9001de8` all present in `git log`. No lingering
`remapAreaBands` references (only a historical doc comment in `swimlanes.ts`).
