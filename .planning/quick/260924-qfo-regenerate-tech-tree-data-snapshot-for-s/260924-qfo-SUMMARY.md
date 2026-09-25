---
quick_id: 260924-qfo
slug: regenerate-tech-tree-data-snapshot-v4.5.1
title: Regenerate tech-tree data snapshot for Stellaris v4.5.1 "Cygnus" (358e)
status: complete
mode: quick
completed: 2026-09-24
tasks: 3
commits: 3
files_created:
  - pipeline/data/v4.5.1/tech.json
  - pipeline/data/v4.5.1/diff.json
  - pipeline/data/v4.5.1/icons/ (1269 files)
  - app/src/test/snapshots.test.ts
files_modified:
  - pipeline/test/skeleton.test.ts
  - pipeline/test/corpus.test.ts
---

# Quick Task 260924-qfo: Regenerate Tech-Tree Data Snapshot for v4.5.1 Summary

Committed `pipeline/data/v4.5.1/` (678 techs, "Cygnus v4.5.1 (358e)") built from the local game install, de-pinned the pipeline test suite from the v4.5.0 install version so future bumps stay cheap (DATA-05), and added a manifest-driven app-schema test that validates every shipped snapshot.

## Performance

- **Duration:** ~11 min
- **Completed:** 2026-09-24 (19:16:55 -07:00)
- **Tasks:** 3/3
- **Files modified:** 2 test files + 1 new snapshot dataset (1271 files: tech.json, diff.json, 1269 icons) + 1 new app test file

## Accomplishments

- `pipeline/data/v4.5.1/tech.json`: 678 techs, `meta.gameVersion="v4.5.1"`, `meta.versionLabel="Cygnus v4.5.1 (358e)"`, `meta.checksum="358e"`, 0 missing names, 0 placeholder icons, 0 dangling prerequisites — validated by the pipeline's own `TechSnapshotSchema.parse()` before writing.
- `pipeline/data/v4.5.1/diff.json`: v4.5.0 → v4.5.1, 0 added, 0 removed, 1 changed (see diff below) — so the app's What's-new panel lights up for v4.5.1.
- `pipeline/test/corpus.test.ts` and `pipeline/test/skeleton.test.ts` no longer hard-code `v4.5.0` — they derive the target version from `detectGameVersion(gameRoot)`, so the corpus suite (including the idempotency test) now re-checks whatever version is actually installed on every future bump instead of silently re-reading the stale committed snapshot.
- `app/src/test/snapshots.test.ts` (new): reads `versions.json` and schema-validates every shipped snapshot (v4.4.6, v4.5.0, v4.5.1) against the app's `TechSnapshotSchema`, checks every tech's icon file exists on disk, and cross-checks `diff.json` version pointers. Version-agnostic — doesn't hard-code "v4.5.1" — so it keeps guarding future bumps.
- App `versions.json` (generated, gitignored, not committed): `latest="v4.5.1"`, listed first as `"Cygnus v4.5.1 (358e)"`, with v4.5.0 and v4.4.6 still present and selectable.

## Task Commits

Each task was committed atomically:

1. **Task 1: Stop pipeline tests depending on the v4.5.0 install** - `1d363a0` (test)
2. **Task 2: Build, validate, diff, and commit the v4.5.1 snapshot** - `ee9acd1` (chore)
3. **Task 3: Wire v4.5.1 into the app and schema-validate every shipped snapshot** - `3d7ebcf` (test)

_No plan-metadata commit — orchestrator owns STATE.md/ROADMAP.md updates per this task's constraints._

## v4.5.0 -> v4.5.1 diff

```
fromVersion=v4.5.0 toVersion=v4.5.1
added=0 removed=0 changed=1

--- Added ---
(none)

--- Removed ---
(none)

--- Changed ---
tech_psi_jump_drive_1 | Psi Jump Drive
    weight: 25 -> 0
```

Confirmed against the raw v4.5.1 game file (`common/technology/00_soc_tech.txt`, line 4291): `weight = 0 # given by event` — a genuine Paradox balance change (Psi Jump Drive is no longer available via the base weighted-random tech pool; it's now event-gated only), not a pipeline artifact. No test literals needed updating for this — no test asserted the old weight value.

### Meta comparison (v4.5.0 vs v4.5.1)

| Field | v4.5.0 | v4.5.1 |
|---|---|---|
| techCount | 678 | 678 |
| areaCounts.society | 312 | 312 |
| areaCounts.physics | 167 | 167 |
| areaCounts.engineering | 199 | 199 |
| tierCounts (0-5) | 38/82/160/142/109/147 | 38/82/160/142/109/147 |
| sourceFiles.length | 33 | 33 |
| icons/ file count | 1373 | 1269 |

Tech-level data is essentially unchanged between v4.5.0 and v4.5.1 aside from the one weight change above — same tech count, same area/tier distribution, same source file count.

## D-17 Validation Report (build:data)

```
Tech count: parsed=678 totalKeysFound=678 match=true
Unresolved @scripted_variable references: 0
Dangling prerequisite references: 0
Missing name: 0  Missing description: 0  Placeholder icon: 0
Area counts: engineering=199 physics=167 society=312
Tier counts: tier0=38 tier1=82 tier2=160 tier3=142 tier4=109 tier5=147
Unlocks coverage (D-05): techs with non-empty grants=355, non-empty leadsTo=316, unresolved grant loc-keys (shipped verbatim)=72
```

No `[assemble]` warning lines were printed during the build (no icon-conversion failures, no unresolved-name failures).

## Files Created/Modified

- `pipeline/test/corpus.test.ts` - derives `OUT_PATH`/`ICONS_DIR` from `detectGameVersion(resolveConfig([]).gameRoot)` instead of a hard-coded `data/v4.5.0` path
- `pipeline/test/skeleton.test.ts` - `detectGameVersion` test now reads the install's own `launcher-settings.json` and asserts the detected version matches `rawVersion` verbatim (and the `^v\d+\.\d+\.\d+$` shape), instead of asserting the literal `"v4.5.0"`
- `pipeline/data/v4.5.1/tech.json` - new v4.5.1 "Cygnus" (358e) tech snapshot, 678 techs
- `pipeline/data/v4.5.1/diff.json` - v4.5.0 → v4.5.1 gameplay diff
- `pipeline/data/v4.5.1/icons/` - 1269 converted `.webp` icon files
- `app/src/test/snapshots.test.ts` - new manifest-driven test that schema-validates every shipped snapshot

## Decisions Made

None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written. All STOP conditions (version/label mismatch, missing names, placeholder/missing tech icons, schema violations, test literal drift) were checked and none triggered.

## Issues Encountered

None blocking. One observation surfaced during Step B/E validation, documented below as it's out of this task's scope (STOP policy explicitly scopes to tech data: names, prerequisites, tech icons, and schema — not the auxiliary UI icon sets below).

### Observation: non-tech icon count dropped 1373 -> 1269 (out of scope, not a STOP condition)

`data/v4.5.1/icons/` has 1269 files vs v4.5.0's 1373 baseline — a 104-file drop. This is **not** a tech-icon regression: all 678 techs have exactly one unique icon reference in both versions (678 unique icons used, matching tech count 1:1), 0 placeholder icons, 0 missing icon files. The gap is entirely in `assemble.ts`'s separate, definition-driven "civic/origin/authority" icon-extraction pass (lines ~339-403), which is unrelated to tech data and instead feeds the app's Empire Manager/Saved-Empire "empire-settings" icon display. Traced the missing 104 files to `_auth_bio_*` authority-swap icons (e.g. `_auth_bio_corporate_cloning.webp`): the source `.dds` files still exist under `gfx/interface/icons/governments/authorities/`, but the corresponding `auth_bio_*` ids are now nested inside `advanced_authority_swap = { name = "auth_bio_corporate_cloning" ... }` sub-blocks in `common/governments/authorities/00_authorities.txt` rather than top-level keys — `assemble.ts`'s `Object.entries(raw)` scan only reads top-level keys, so it silently (no warning, by design — `existsSync(srcPath)` check just `continue`s) stops picking these up. This looks like a genuine Paradox restructuring of the authority-swap file format between 4.5.0 and 4.5.1, not a pipeline bug — but it's out of this task's scope (tech tree data, not Empire Manager icon coverage) and `assemble.ts` was not modified. Flagging for a future Empire Manager-scoped task if authority-icon coverage there needs to be restored.

## Test Expectations Updated for 4.5.1 Data

None - `npm test` in pipeline (68/68 tests, 8/8 files) and `npm test` in app (199/206 tests passed, 7 skipped — pre-existing skips unrelated to this task, e.g. the gitignored-sample.sav-gated `realFileRoundtrip.test.ts`) both passed against the new v4.5.1 data with zero literal changes needed.

## Observations (informational, not deviations)

- `app/src/components/Header.tsx`'s `XENOPHILE_ICON` still points at `v4.5.0/icons/_ethic_xenophile.webp` (hard-coded, decorative header art) — unchanged per plan instruction, v4.5.0 still ships so this doesn't break.
- `app/src/lib/data/fetchSnapshot.ts`'s `fetchSnapshot(version = "v4.5.0")` fallback default is unchanged per plan instruction — only used when `versions.json` is missing; the manifest now correctly reports `v4.5.1` as latest/default in normal operation.
- `app/src/test/smoke.test.ts`, `layout.test.ts`, and `exploreLayout.test.ts` deliberately stay pinned to `v4.5.0` as a fixed layout benchmark (per plan instruction) — left unchanged.

## Verification

- `cd pipeline && npm test`: 8 test files passed, 68 tests passed (140s; includes the corpus suite's two full builds — coverage, idempotency, localisation, icon, unlocks — now running against v4.5.1).
- `cd app && npx tsc --noEmit`: clean.
- `cd app && npm test`: 17 test files passed, 1 skipped; 199 tests passed, 7 skipped (31.76s); `snapshots.test.ts` specifically validated all 3 shipped snapshots (v4.4.6, v4.5.0, v4.5.1) against `TechSnapshotSchema`.
- `git diff HEAD~3 --stat -- pipeline/data/v4.5.0 pipeline/data/v4.4.6`: empty — historical snapshots untouched.
- `git status --porcelain app/public`: empty — gitignored build output never staged.
- Optional manual spot check (not run, environment doesn't have a browser session in this worktree): `npm run dev` in `app/`, then open `http://localhost:5173/?ver=4.5.1` — version selector should default to "Cygnus v4.5.1 (358e)" and What's-new should show the Psi Jump Drive weight change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v4.5.1 is the shipped default snapshot; v4.5.0 and v4.4.6 remain selectable.
- Pipeline test suite is now version-agnostic — the next game patch only needs `npm run build:data` + `npm run diff-data` + a commit, no test-file edits.
- Empire Manager authority-icon coverage gap (104 files, see Issues Encountered) is a candidate for a follow-up quick task scoped to that feature, not blocking this task's tech-tree scope.

---
*Quick task: 260924-qfo*
*Completed: 2026-09-24*

## Self-Check: PASSED

- FOUND: pipeline/data/v4.5.1/tech.json
- FOUND: pipeline/data/v4.5.1/diff.json
- FOUND: app/src/test/snapshots.test.ts
- FOUND commit: 1d363a0 (test(pipeline): derive version-pinned test paths from the detected install version)
- FOUND commit: ee9acd1 (chore(pipeline): commit v4.5.1 "Cygnus" (358e) data snapshot + v4.5.0->v4.5.1 diff)
- FOUND commit: 3d7ebcf (test(app): schema-validate every shipped data snapshot from the versions manifest)
