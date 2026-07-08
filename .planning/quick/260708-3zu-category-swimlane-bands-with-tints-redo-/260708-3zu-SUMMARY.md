---
quick_id: 260708-3zu
slug: category-swimlane-bands-tints-repack-dark-header
title: Category swimlane bands (tinted + watermarked) + re-pack + dark header
status: complete
completed: 2026-07-08
---

# Quick Task 260708-3zu — Summary

**Status: COMPLETE.** `npm run build` clean, `npm test` 10/10 green. Executed by a
subagent (Tasks 1–4) + orchestrator (final verify, watermark follow-up, docs).

## What shipped

| Task | Commit | What |
|------|--------|------|
| 1 — Banded layout | `55c044e` | `layoutTree` re-bands the ELK result into contiguous per-category swimlanes (x = tier column, y = band + ELK-ordered stack); returns `bands: BandGeometry[]`; edges emptied so EdgeLayer draws elbows. Optional `activeCategories` arg for re-pack. |
| 2 — Tinted bands | `8b120ff` | `BandLayer.tsx` — faint area-tinted band rect + category label, z-index 0 behind edges/cards, alternating tint strength. |
| 3 — Wire + Re-pack | `6304e5c` | BandLayer wired into `.tree-canvas`; **Re-pack** button re-runs `layoutTree` on the visible categories (stale-result guard) and reframes. `filtered` drops toggled-off bands. |
| 4 — Dark header | `efd0502` | `.app-header` → `--tree-panel` bg + `--tree-text` title to match the dark tree. |
| follow-up — Watermark | `59468d6` | Repeating 30°-rotated, 25%-white category-name watermark behind each band (inline SVG data-URI; tint → background-color so it layers). |

## Verified live (DOM)

- **Banding: 0 overlaps** — categories are contiguous, non-overlapping y-bands
  (computing 30–2046, field_manipulation 2244–3476, particles 3674–5130, …),
  stacked physics → society → engineering.
- **13 bands**, each carrying its OWN watermark text (COMPUTING / FIELD
  MANIPULATION / BIOLOGY / VOIDCRAFT …) at rgba(255,255,255,0.25), rotate(-30).
- Dark top bar; Re-pack button present; nav/tooltips/LOD/imperative-pan intact.

## Open follow-ups (not in this task)

- **Tooltips still show raw `$…$` loc keys / `$@…$` scripted vars** for the ~118
  unlocalized techs — needs the pipeline localization fix regenerated into this
  worktree's data + a hardened tooltip cleaner. Flagged by the user; queued next.
- Explicit AREA super-headers (Physics/Society/Engineering) + larger inter-area
  gaps — currently conveyed by band order + area tint only.
- 25% watermark may read strong; trivially tunable (opacity in `watermarkBg`).
- Cross-band prerequisite edges can look busy; hover-only edge highlight is a
  possible follow-up.
