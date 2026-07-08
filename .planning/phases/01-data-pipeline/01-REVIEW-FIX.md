---
phase: 01-data-pipeline
fixed_at: 2026-07-08T19:00:00Z
review_path: .planning/phases/01-data-pipeline/01-REVIEW.md
fix_scope: critical_warning
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report (iteration 2)

**Fix scope:** Critical + Warning
**Source review:** .planning/phases/01-data-pipeline/01-REVIEW.md (iteration-2 re-review)
**Findings in scope:** 3 (1 Critical, 2 Warning)
**Fixed:** 3 / 3
**Status:** all_fixed

Iteration 1 (12 findings, all fixed) is preserved in `01-REVIEW-FIX.iter1.md`.
This iteration fixed the three critical/warning findings surfaced by the
iteration-1 re-review. The iteration-1 fixer that started this pass exited on a
usage-credit limit before applying anything (no commits, no source edits — its
orphaned worktree and recovery sentinel were cleaned up); the fixes were then
applied and verified directly against the regenerated live-corpus snapshot.

## Findings Fixed

| Finding | Sev | Commit | Fix |
|---|---|---|---|
| CR-01 | Critical | `8771f6e` | `custom_tooltip` modifier values are real localisation keys — now resolved through the loc map into the human-readable effect text instead of shipping the raw key with a `custom_tooltip:` prefix. `show_only_custom_tooltip` (boolean engine directive) added to `MODIFIER_META_KEYS`. |
| WR-01 | Warning | `8771f6e` | Modifier values normalized through a new `asScalarArray` helper so a jomini auto-arrayed duplicate stat key expands to one grant line per value rather than being silently dropped (the Pitfall-5 arity class that produced CR-02/WR-04 in iteration 1). Objects are still dropped, never `String()`-ed. |
| WR-02 | Warning | `96c1cd6` | `resolveIfExists` now validates icon names against `SAFE_ICON_NAME` (matching the write-side `SAFE_NAME` guard) before building a read path, closing the read side of threat T-01-01 — the `icon =` override and swap names can no longer make ImageMagick read a `.dds` file outside the icons dir. |

CR-01 and WR-01 share the same function (`grantsFromModifier`) and the new
`asScalarArray` helper, so they were applied in one commit rather than an
artificial split; the commit message names both findings.

## Verification

- `tsc --noEmit`: clean.
- Fast unit suite: 46/46 passing.
- Full corpus suite (`corpus.test.ts`): 5/5 passing — D-18 full-corpus coverage
  and byte-identical idempotency.
- `npm run build:data` regenerated `data/v4.5.0/tech.json` (678/678 techs, both
  cross-DLC checks `match=true`).
- **CR-01 snapshot scan (the reviewer's exact criteria), across all 678 techs'
  grants:** `[object Object]`: 0, `show_only_custom_tooltip:`: 0, raw
  `custom_tooltip:`: 0, stringified-boolean (`: true`/`: false`): 0,
  empty/non-string grant entries: 0. `tech_battleship_build_speed` now ships the
  resolved effect text (`$mod_ship_battleship_cost_mult$: §G-5%§!...`) rather
  than the raw key `custom_tooltip: tech_battleship_build_speed_effect`.

## Not In Scope (carried forward as Info in 01-REVIEW.md)

The 12 Info findings (IN-01 … IN-12) were out of the critical_warning fix scope
and remain open in `01-REVIEW.md` for a future pass. Notable follow-ups:
IN-01/IN-12 (nested `$mod_<stat>$` / `mod_<statKey>` loc resolution inside
resolved grant text — the resolved `custom_tooltip` strings still contain raw
`$var$` placeholders and `§G§!` color codes), IN-09 (`.default()` weakening the
pre-write validation gate), and IN-07 (fail-loud on duplicate root tech keys).
