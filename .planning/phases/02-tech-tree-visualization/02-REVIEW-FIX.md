---
phase: 02-tech-tree-visualization
fixed_at: 2026-07-08T21:30:00Z
review_path: .planning/phases/02-tech-tree-visualization/02-REVIEW.md
fix_scope: critical_warning + verification-found
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
verification_fixes: 3
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fix scope:** Warnings from 02-REVIEW.md (0 blockers, 4 warnings) + 3 render-robustness fixes found during live browser verification.
**Status:** all_fixed

## Code-review warnings fixed (4/4)

| Finding | Commit | Fix |
|---|---|---|
| WR-01 | `cd1c632` | `hexToRgba` hardened — expands 3-digit shorthand, and returns the value verbatim for any non-hex token instead of emitting `rgba(NaN,…)` (future dark-theme safety). |
| WR-02 | `5868544` | Icon path derived from `snapshot.meta.gameVersion` instead of the hardcoded `/data/v4.5.0/icons/` — icons no longer 404 on a version bump (the cheap-version-update goal). |
| WR-03 | `ac4df1b` | `copy-data.mjs` version resolution uses a numeric per-component comparator so `v4.10.0` sorts after `v4.9.0` (lexicographic `.sort()` shipped stale data). |
| WR-04 | `17afdc4` | `TierAxis` rebuilds tier anchors on graph `nodeAdded`/`cleared` (rAF-coalesced) instead of relying on sibling-effect ordering — robust to graph-population timing. |

The 2 Info findings (unmemoized `getComputedStyle`, `cpSync` stale-file cleanup) were left out of scope.

## Render-robustness fixes found during verification (3)

Live browser verification (dev + production `vite preview`) — the check every
executor flagged it couldn't perform — revealed a real defect the automated
tests missed (jsdom never mounts the WebGL Sigma canvas):

**Root cause:** Sigma measures its container synchronously during React's
commit, before the browser's flex-layout pass sizes `.canvas-region`, so it can
read a 0-width container and throw `Sigma: Container has no width`. With no
error boundary, that unmounted the entire React root to a **permanent blank
page** — intermittently, depending on layout timing. (In production React
swallows the error silently, so it was invisible without instrumentation.)

| Fix | Commit | What it does |
|---|---|---|
| Error boundary | `3290a22` | Wraps the canvas subtree; a mount error degrades to the recoverable Error overlay (Retry re-runs fetch+layout) instead of a blank page. `componentDidCatch` logs the real error even in prod. This is also the 02-REVIEW.md reviewer's own recommendation ("Consider adding an error boundary"). |
| `allowInvalidContainer` + post-layout resize | `9f829b7` | Sigma constructs even at 0 width, then a post-layout effect forces `resize()` + camera reset so the canvas fills the container once it has real dimensions (otherwise it stayed stuck at 1×1). |

## Verification evidence

- `tsc --noEmit` clean; `vitest run` 8/8 GREEN; `vite build` succeeds.
- Production build served via `vite preview`: at a real 1280×800 viewport the
  tree renders **full-size** — canvas 1280×751, all 7 Sigma layers, no error
  overlay, past the loading state; header, all 6 tier-axis labels
  (Tier 0–5), and the 3-item area legend all present; **zero console errors**.
- Data cross-checked live: `tech.json` 200, version-derived icon path 200,
  678 nodes / 613 edges (matches the pipeline snapshot).
- The XSS/plain-text contract (the one high-severity threat) was verified clean
  by the review: `tech.name` reaches only Sigma's text layer as a plain label,
  never DOM HTML; no `dangerouslySetInnerHTML` anywhere.

## Owed: one human-eyeball check (tooling-limited)

Pixel-level visual confirmation — that the icon+area-ring nodes are drawn and
legible and the DAG isn't a hairball at full node density — could NOT be
captured in this environment: `preview_screenshot` times out on Sigma's WebGL
render loop, and WebGL canvases can't be pixel-read-back. The render is
structurally and functionally confirmed (full-size canvas, graph loaded, no
errors); the aesthetic pass needs a person to open the app once. Recommended as
a quick manual QA before the tool is considered production-polished.
