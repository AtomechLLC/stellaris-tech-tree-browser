---
phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a
plan: 08
subsystem: testing
tags: [vitest, integration-test, empire-designs, sav-parser, jomini]

# Dependency graph
requires:
  - phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a
    provides: "stageAddFromEmpire / resolveStagedName / Add-to-my-empires panel action and staged-add UI (plan 04-07) — the full upload/stage/save/download loop this plan verifies end-to-end"
provides:
  - "app/src/test/realFileRoundtrip.test.ts — local integration test proving the round-trip/removal/archive/colour-escape/add-from-save guarantees against the user's real 399,931-byte designs file and the real sample.sav"
  - "Human-verified confirmation that the full browser flow (upload, filter, stage remove/add, save, download) matches the UI-SPEC Copywriting Contract exactly, including an AI (non-player) empire add (D-06)"
  - "Human-verified confirmation that the File System Access in-place write is always preceded by a correct backup, with a working non-Chromium fallback"
  - "RESEARCH.md assumption A6 formally DISCHARGED — Stellaris itself loads the app-produced designs file with all prior designs intact and the added empire selectable/playable"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Local real-data integration test pattern: describe.skipIf(!(designsAvailable && savAvailable)) gates an entire suite on both a private, gitignored user file and a gitignored sample fixture, so a clean checkout/CI stays green while the suite still runs for real on a machine that has the data"
    - "Archive-output assertions built via the same empty-DesignsFile + spliceDesignsFile(emptyArchive, new Set(), [removedText]) shape that production code (useDesignsSession.ts's buildDesignsOutputs) uses, rather than an index-inversion trick, so the test exercises the real code path"

key-files:
  created:
    - app/src/test/realFileRoundtrip.test.ts
  modified: []

key-decisions:
  - "Suite-level skip gate requires BOTH the real designs file AND sample.sav to be present (not either independently), matching the plan's explicit instruction to gate on both paths as a single unit"
  - "Test builds the archive assertion via the same empty-DesignsFile + spliceDesignsFile splice-engine call the production buildDesignsOutputs function uses, keeping the test faithful to the real code path instead of reinventing an index-inversion shortcut"

patterns-established:
  - "Local integration test self-skips (not fails) when private/gitignored real-data fixtures are absent — the pattern to follow for any future test that needs the user's real files or other gitignored large fixtures"

requirements-completed: [D-02, D-04, D-05, D-07, D-08]

# Metrics
duration: 45min
completed: 2026-08-18
---

# Phase 4 Plan 8: Real-Data Verification Summary

**Proved the empire-designs round-trip, archive, and write-back guarantees against the user's real 400KB designs file and a real Stellaris client — not just fixtures — closing out RESEARCH.md assumption A6.**

## Performance

- **Duration:** ~45 min (includes two human-driven browser/in-game verification passes)
- **Started:** 2026-08-18T21:15:00-07:00 (approx.)
- **Completed:** 2026-08-18T22:00:00-07:00 (approx.)
- **Tasks:** 3 (1 automated, 2 human-verify checkpoints)
- **Files modified:** 1

## Accomplishments

- Built `app/src/test/realFileRoundtrip.test.ts`: 5 passing tests (not skipped, on this machine) proving the real designs file parses to exactly 183 entries, a zero-change round trip is byte-identical to disk, a removal yields 182 remaining entries with the removed bytes recoverable verbatim from the archive splice, at least one real entry's raw name carries a 0x11 colour-escape byte and survives the round trip unchanged, and an empire extracted from the real `sample.sav` appends to make exactly 184 entries. Full suite: 17 files / 158 tests, all green.
- Human-verified the complete browser flow — upload, name filter, stage/undo removals, stage an AI-empire add, save, and download — against every string in the UI-SPEC Copywriting Contract, confirmed correct.
- Human-verified the File System Access in-place write path (Chromium picker, permission grant, automatic pre-write timestamped backup, two consecutive in-session saves) and the non-Chromium download-only fallback (Firefox), both correct with no dead-end states.
- **RESEARCH.md assumption A6 discharged:** the app-produced designs file was loaded directly into Stellaris. All pre-existing designs remained listed and unchanged, and the empire added from the save appeared and was selectable/playable, with correct species, traits, flag, ruler, ethics, civics, and origin.

## Human Checkpoint Verification

**Task 2 — Browser verification (upload, remove, add, download): APPROVED (2026-08-18)**

User confirmed all nine verification steps: the entry-point button is visible before any `.sav` is loaded and shows the pending count after the dialog is closed with staged changes; the uploaded file lists all 183 designs and the name filter narrows them; two staged removals show line-through/reduced-opacity with a working Undo and the exact pending-count copy; the staged removal survives closing and reopening the dialog; an AI (non-player) empire was added successfully, confirming D-06; the save confirmation row (not a second modal) states the added/archived counts and the "never deleted" note; the downloaded designs file kept the uploaded filename and a diff against the scratch copy showed only the intended entries changed with no whitespace/line-ending churn; the archive file contained the removed design(s) byte-for-byte; the success banner read "Saved — 1 added, 1 archived." matching the staged counts. No deviations reported.

**Task 3 — In-place write with backup, and the game-loads-it test: APPROVED (2026-08-18)**

User confirmed: the native Chromium file picker appeared for the upload zone and edit permission was granted; the file-mode badge read "In-place saving enabled" with a green dot; the save confirmation copy stated the automatic pre-save backup; a `<file>.txt.<timestamp>.bak` download appeared containing the exact pre-save original; the scratch copy was updated in place and the archive still downloaded; the success banner named the backup file; a second save in the same session (without re-upload) was also correct; the Firefox fallback path worked via the plain file input with a "Download only" badge and no error. **Final acceptance:** the app-produced file was copied over the real `user_empire_designs_v3.4.txt` (user held their own independent backup) and Stellaris was launched — every pre-existing design was still listed and unchanged, and the added empire appeared and was selectable/playable with the right species, traits, flag, ruler, ethics, civics, and origin. No fields on the added empire came through wrong. **RESEARCH.md assumption A6 is now DISCHARGED** — the serializer's whitespace style and field shape are confirmed correct against the actual game client, not just against jomini's parser.

## Task Commits

Each task was committed atomically:

1. **Task 1: Real-data integration test (auto-skipped in a clean checkout)** - `e2ff381` (test)
2. **Task 2: Browser verification — upload, remove, add, download** - checkpoint approved, no code changes (verification only)
3. **Task 3: In-place write with backup, and the game-loads-it test** - checkpoint approved, no code changes (verification only)

**Plan metadata:** (this commit) `docs(04-08): complete real-data verification plan`

## Files Created/Modified

- `app/src/test/realFileRoundtrip.test.ts` - Local integration test over the real 399,931-byte designs file and `app/public/data/v4.5.0/sample.sav`; self-skips when either is absent.

## Decisions Made

- Archive-output assertion in Task 1 mirrors the exact production code path (`useDesignsSession.ts`'s `buildDesignsOutputs`): an empty `DesignsFile` target spliced with the removed entry's raw text via `spliceDesignsFile`, rather than an ad hoc index-inversion trick — keeps the test honest to what actually ships.
- The suite-level skip condition requires both the real designs file and `sample.sav` to be present before any test in the file runs, per the plan's explicit instruction to gate on both paths as a single unit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Header comment tripped the `writeFileSync` grep acceptance gate**
- **Found during:** Task 1 verification (`grep -c 'writeFileSync' app/src/test/realFileRoundtrip.test.ts`)
- **Issue:** The header comment's sentence "No writeFileSync anywhere in this file" contained the literal token `writeFileSync`, so the grep gate returned `1` instead of the required `0` — even though the file contains no actual call to `writeFileSync`.
- **Fix:** Reworded the comment to state the guarantee without using the literal function name ("This file performs read-only filesystem access only; it contains no disk-write calls of any kind").
- **Files modified:** `app/src/test/realFileRoundtrip.test.ts`
- **Verification:** Re-ran both grep gates (`skipIf` → 1, `writeFileSync` → 0), the target test file (5/5 passing), and the full suite (158/158 passing) after the edit.
- **Committed in:** `e2ff381` (fixed before the Task 1 commit, so the committed file already reflects the corrected comment)

---

**Total deviations:** 1 auto-fixed (1 bug, cosmetic — comment wording only)
**Impact on plan:** No functional or test-behavior change. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 4 (Empire Manager) is now fully verified end-to-end: automated round-trip/removal/archive/add guarantees pass against the user's real 400KB designs file and a real save, the full browser flow matches the UI-SPEC exactly, and Stellaris itself confirms the produced file is game-loadable with a playable added empire. No known blockers remain for closing out phase 4.

---
*Phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a*
*Completed: 2026-08-18*
