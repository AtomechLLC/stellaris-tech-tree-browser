---
phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a
plan: 06
subsystem: frontend
tags: [react, empire-manager, save-flow, file-system-access, css]

# Dependency graph
requires:
  - phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a (plan 01)
    provides: "spliceDesignsFile/parseDesignsFile/DesignsFile round-trip engine (designsText.ts)"
  - phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a (plan 02)
    provides: "downloadBlob/ensureReadWritePermission/saveInPlaceWithBackup (fsAccess.ts)"
  - phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a (plan 05)
    provides: "useDesignsSession hook + EmpireManagerPanel dialog with the TODO(04-06) save stub"
provides:
  - "buildDesignsOutputs — pure module-level function deriving the two output texts (designs + archive) from staged changes, unit-tested independently of the hook"
  - "session.save()/lastSave/clearLastSave — the full write-back/download round trip with pre-write backup, permission-denied fallback, and post-save re-baseline"
  - "Save/discard/replace-file inline confirmations and success/error banners in EmpireManagerPanel"
affects: [04-07, 04-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildDesignsOutputs takes spliceDesignsFile as an explicit parameter (not a static import) so useDesignsSession.ts keeps zero static references to designsText.ts — save() sources spliceDesignsFile from the same dynamic `await import(\"./designsText\")` it already uses for encodeDesignsText/parseDesignsFile, preserving the lazy designsText chunk (confirmed in the production build: designsText-*.js stays a separate 2.34 kB chunk from the main bundle)"
    - "Inline confirm state (null | \"save\" | \"discard\" | { kind: \"replace\", file, viaPicker }) replaces the dialog footer's action row or sits under the upload section — no nested modal, matching the app's existing no-nested-dialogs convention"

key-files:
  created:
    - app/src/test/designsOutputs.test.ts
  modified:
    - app/src/lib/empire/useDesignsSession.ts
    - app/src/components/EmpireManagerPanel.tsx
    - app/src/styles/app.css

key-decisions:
  - "buildDesignsOutputs's literal signature gained a 5th parameter (spliceDesignsFile: fn) beyond what the plan's prose signature listed — necessary to keep the function both pure/synchronously-testable AND free of a static import of designsText.ts (which would pull jomini into the main bundle, breaking the lazy-chunk invariant 04-05 established and documented in this file's own header comment). save() supplies the real spliceDesignsFile via its existing dynamic import; the test file imports it statically since test bundles aren't shipped to the client."
  - "Loading a new designs file (loadDesignsFile/loadDesignsViaPicker) now also clears lastSave, in addition to the two triggers the UI-SPEC names explicitly (staging a new change, closing the dialog) — prevents a stale success banner from a previous file bleeding into a newly loaded file's view."
  - "session.error's rendering in EmpireManagerPanel switched from the reused .empire-panel__error class to the new .empire-manager__error class (12px, var(--color-danger)) so the plan's new CSS class is actually load-bearing rather than an unused declaration, and so the color matches the UI-SPEC's --color-danger token exactly rather than the hardcoded #ff6b7a EmpirePanel.tsx uses elsewhere."
  - "The replace-file confirmation's `file: File | null` field is always null in this plan's implementation (there is no live drop target once a designs file is already loaded — LoadedFileRow replaces the drop-zone) — only the `viaPicker` branch is exercised. The field is kept in the type per the plan's literal signature for forward compatibility (e.g. if a future plan adds a drop target to the loaded-file row)."

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-08]

# Metrics
duration: 12min
completed: 2026-08-18
---

# Phase 4 Plan 06: Save/Write-Back Round Trip Summary

**Completes the Empire Manager round trip: staged adds/removes become two spliced output files (updated designs + archive of removed designs), written in place with a mandatory pre-write backup where the File System Access API allows it, falling back to plain downloads everywhere else — with confirm-first UI for every destructive or file-replacing action.**

## Performance

- **Duration:** ~12 min (first commit 20:59:59 → last commit 21:05:06, 2026-08-18; plus environment setup — `npm install` and `node scripts/copy-data.mjs`, both required fresh in this worktree)
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `buildDesignsOutputs(designs, archive, removed, adds, spliceDesignsFile)` is the single pure core of the save flow: it splices the designs file and, when any removal is staged, the archive file (uploaded or synthesized) through the SAME `spliceDesignsFile` engine, so an uploaded archive's existing bytes are never re-serialized (D-08, RESEARCH Pitfall 6) and a removal can never exist without a corresponding archive entry (D-05).
- `session.save()` on `useDesignsSession` is the full write-back/download orchestration: re-checks write permission at save time (not just at load time), writes in place via `saveInPlaceWithBackup` (backup download fires first, unconditionally) when permitted, falls back to `downloadBlob` with the UI-SPEC's permission-denied copy on denial or thrown error, always downloads the archive separately even on the in-place path (D-02 scopes FS-Access write-back to the primary file only), and re-baselines `designs`/`designsOriginalBytes` by re-parsing the emitted bytes so a second save in the same session splices from correct offsets.
- `designsOriginalBytes` (the exact bytes as read, never a re-encode of `designs.text`) is threaded through `loadDesignsFile`/`loadDesignsViaPicker` and is what `saveInPlaceWithBackup` backs up — verified by grep and by the windows-1252-fallback path documented in `designsText.ts`.
- `EmpireManagerPanel`'s "Save changes" button now runs the real flow: an inline `confirm` state renders the destructive-confirmation copy (with the backup sentence appended only when `session.canWriteInPlace`), the discard confirmation (only when a removal is staged — adds-only discards run immediately), and the replace-file confirmation (only when `session.pendingCount > 0`) — each replacing the footer's action row or sitting under the upload section, never a nested modal.
- Success banner (`session.lastSave`) replaces the pending-changes summary strip in place, states the backup filename when one was made, and clears on staging a new removal or closing the dialog (in addition to loading a new file, which also resets it as part of the existing load-reset behavior).
- `designsOutputs.test.ts` (7 tests) covers every behavior bullet: zero-change identity, single removal with/without an uploaded archive (byte-prefix assertion for the "never re-serialize" guarantee), archive-null-on-zero-removals-even-with-adds, and staged-adds ordering.

## Task Commits

1. **Task 1: buildDesignsOutputs and save on the session** - `4ad86d9` (feat)
2. **Task 2: Save, discard and replace confirmations plus result banners** - `4e121c4` (feat)

## Files Created/Modified

- `app/src/lib/empire/useDesignsSession.ts` - added `buildDesignsOutputs` (module-level, pure), `designsOriginalBytes` state, `save()`, `lastSave`/`clearLastSave`, `LastSave` interface
- `app/src/components/EmpireManagerPanel.tsx` - real save/discard/replace confirmation flow, success/error banners, `closeDialog`/`onToggleRemove` wrappers that clear `lastSave`
- `app/src/styles/app.css` - `.empire-manager__confirm`/`__confirm-actions`, `.empire-manager__success`, `.empire-manager__error` (9 custom properties before and after — no new tokens)
- `app/src/test/designsOutputs.test.ts` (new) - pure coverage of `buildDesignsOutputs` against real-parsed CRLF fixtures

## Decisions Made

See `key-decisions` in frontmatter — the `spliceDesignsFile`-as-parameter design (preserving the lazy `designsText.ts` chunk), the extra `lastSave`-clear-on-load trigger, the `.empire-panel__error` → `.empire-manager__error` switch, and the always-null `file` field on the replace-confirm variant.

## Deviations from Plan

**1. [Rule 1/2 - correctness/performance] `buildDesignsOutputs` takes `spliceDesignsFile` as an explicit 5th parameter instead of matching the plan's literal 4-argument signature.**
- **Found during:** Task 1, while implementing the function per the plan's exact `buildDesignsOutputs(designs, archive, removed, adds): {...}` signature.
- **Issue:** A static top-level `import { spliceDesignsFile } from "./designsText"` would pull `designsText.ts` — and therefore `jomini` (WASM parser) — into the main bundle, breaking the lazy-chunk invariant 04-05 established and documented verbatim in this file's own header comment ("there is no runtime import of `./designsText` anywhere in this module outside the lazy-loaded handlers"). The threat model's T-04-21 also requires reusing the identical `spliceDesignsFile` engine (not a re-implementation), ruling out inlining the splice logic to avoid the import.
- **Fix:** Added `spliceDesignsFile` as a required parameter. `save()` sources it from its existing dynamic `await import("./designsText")` call (no new import site). The test file imports `spliceDesignsFile` statically, which is fine since test bundles are never shipped.
- **Verified:** Production build confirms `designsText-*.js` (2.34 kB) remains its own chunk, separate from `index-*.js` — the invariant holds.
- **Files modified:** `app/src/lib/empire/useDesignsSession.ts`, `app/src/test/designsOutputs.test.ts`
- **Commit:** `4ad86d9`

No other deviations — the rest of the plan (task actions, UI-SPEC copy, threat-model mitigations) was implemented as written.

## Known Stubs

None. The Save button's full flow (confirm → write/download → success banner) is wired end-to-end; no remaining `TODO(04-06)` (grep-verified: 0 matches).

## Issues Encountered

- Fresh worktree checkout had no `app/node_modules` — ran `npm install` against the existing `package-lock.json` (same pinned tree, not a new package).
- Fresh worktree checkout had no `app/public/data/v4.5.0/tech.json` — ran `node scripts/copy-data.mjs` per this plan's environment note; this is also `npm run build`'s `prebuild` step, so it self-heals on any build but was needed explicitly for the pre-existing (unrelated) layout/smoke test suites to pass under `vitest run`.
- Worktree HEAD had diverged onto unrelated `fix(app)` commits (LOD edge routing, map-chrome click handling — no relation to Empire Manager) at spawn time; corrected via the mandated `worktree_branch_check` reset to the expected base commit `450bb6e` before any plan work began.

## Next Phase Readiness

- `useDesignsSession`'s full surface (`stageAdd`/`undoAdd`/`takenNames`, and now `save`/`lastSave`/`clearLastSave`) is ready for 04-07 to populate `adds` from a save-derived `StagedAdd` and exercise the same save/confirm flow end-to-end.
- No blockers. Full verification passed: `cd app && npx tsc --noEmit` (clean), `cd app && npx vitest run` (15 files / 146 tests passed), `cd app && npm run build` (exits 0, `designsText` chunk stays lazy-loaded at 2.34 kB).

---
*Phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a*
*Completed: 2026-08-18*

## Self-Check: PASSED

All claimed files verified present: `app/src/lib/empire/useDesignsSession.ts`, `app/src/components/EmpireManagerPanel.tsx`, `app/src/styles/app.css`, `app/src/test/designsOutputs.test.ts`. All claimed commit hashes verified present in git history: `4ad86d9`, `4e121c4`.
