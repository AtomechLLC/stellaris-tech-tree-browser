---
phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a
plan: 02
subsystem: infra
tags: [file-system-access-api, blob-download, typescript, vitest, browser-io]

# Dependency graph
requires:
  - phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a (plan 01, if applicable)
    provides: n/a — this plan has no depends_on; it establishes the shared I/O layer other Phase 4 plans build on
provides:
  - "downloadBlob(data, filename, mimeType?) — single shared Blob-download implementation for the app"
  - "supportsFsAccess()/pickTextFileHandle()/ensureReadWritePermission() — feature-detected File System Access wrapper that never throws on unsupported browsers or denied permission"
  - "backupFilename(originalFilename, at)/saveInPlaceWithBackup(...) — D-02's backup-before-write ordering encoded as a function signature, not a convention"
affects: [04-03, 04-04, 04-05, 04-06, 04-07, 04-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single generic `cast<T>(value: unknown): T` narrowing helper for browser-API surface TS 5.9's lib.dom.d.ts doesn't declare yet (showOpenFilePicker, queryPermission/requestPermission) — one unsafe-cast site instead of `as any` scattered at each call site"
    - "Use `globalThis` (not `self`) for cross-environment feature detection — `self` is browser/worker-only and is `undefined` in Node's vitest environment"

key-files:
  created:
    - app/src/lib/fsAccess.ts
    - app/src/test/fsAccess.test.ts
  modified:
    - app/src/lib/export/mapImage.ts

key-decisions:
  - "Feature-detection and the FS Access global lookup both use `globalThis`, not `self` — `self` throws ReferenceError under Node's vitest `node` environment; `globalThis` works identically in Node and browsers"
  - "The one permitted `as any` cast lives inside a single generic `cast<T>()` helper, called from two sites (global picker lookup, FileSystemHandle permission methods) rather than duplicating the cast — keeps the literal 'as any' count at exactly 1 across the file, including doc comments"

patterns-established:
  - "Pattern: shared browser download/file-I/O helpers live in app/src/lib/fsAccess.ts; new call sites (designs file download, archive file download) import downloadBlob from here rather than re-implementing the anchor-click idiom"

requirements-completed: [D-01, D-02]

# Metrics
duration: 6min
completed: 2026-08-18
---

# Phase 4 Plan 02: File I/O Layer (fsAccess.ts) Summary

**Shared `downloadBlob` helper plus a File System Access wrapper (`saveInPlaceWithBackup`) that structurally cannot write in place without first emitting a timestamped backup download.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-18T20:27:04-07:00 (approx, RED commit)
- **Completed:** 2026-08-18T20:30:08-07:00
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- One shared `downloadBlob(data, filename, mimeType?)` implementation used by `mapImage.ts`'s PNG export today, ready for the designs/archive file downloads in later Phase 4 plans
- `saveInPlaceWithBackup` makes D-02's "backup before any in-place write" a property of the function signature: the backup download is the first statement and there is no parameter that can skip it
- Feature detection (`supportsFsAccess`) and permission handling (`ensureReadWritePermission`) never throw — non-Chromium browsers and denied permissions both fall through to the download path automatically, per D-02
- The app now has exactly one Blob-download implementation (`createElement("a")` for downloads appears only in `fsAccess.ts`)

## Task Commits

Each task was committed atomically (Task 1 followed TDD RED → GREEN):

1. **Task 1a (RED): fsAccess.test.ts — failing test for pure surface** - `72472a2` (test)
2. **Task 1b (GREEN): fsAccess.ts — shared download, FS Access picker, backup-then-write** - `38c8ff8` (feat)
3. **Task 2: Route mapImage.ts through the shared downloadBlob** - `070a425` (refactor)

_No REFACTOR commit needed — the one fix found during GREEN (see Deviations) was made before the GREEN commit landed._

## Files Created/Modified
- `app/src/lib/fsAccess.ts` - downloadBlob, supportsFsAccess, pickTextFileHandle, ensureReadWritePermission, backupFilename, saveInPlaceWithBackup
- `app/src/test/fsAccess.test.ts` - vitest coverage for backupFilename (exact-string assertion) and supportsFsAccess (false under node)
- `app/src/lib/export/mapImage.ts` - inline anchor-download block replaced with a `downloadBlob(blob, filename)` call; `exportMapPng`'s three-parameter signature unchanged

## Decisions Made
- Used `globalThis` instead of the plan/RESEARCH.md's literal `self` reference for both `supportsFsAccess()` and the picker lookup — `self` is undefined in Node, which is this package's vitest environment; `globalThis` is universal and behaves identically in browsers. This is a correctness fix, not a scope change: the plan's own acceptance criterion ("supportsFsAccess() returns false ... in the node test environment") only holds with this fix in place.
- Consolidated the plan's "single cast site" instruction into one generic `cast<T>(value: unknown): T` helper (rather than one `as any` per narrowed interface) so the literal `as any` count in the file is exactly 1, satisfying the acceptance criterion's `grep -c 'as any'` check even after accounting for explanatory prose in doc comments.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `self` is undefined in the vitest `node` environment**
- **Found during:** Task 1 (GREEN implementation, first test run)
- **Issue:** The plan's action text and RESEARCH.md's Pattern 5 both reference `"showOpenFilePicker" in self`. `self` is a browser/worker-only global; this package's vitest config runs tests in the `node` environment (no `self`), so `supportsFsAccess()` threw `ReferenceError: self is not defined` instead of returning `false` as the plan's own behavior block and acceptance criteria require.
- **Fix:** Replaced both `self` references (feature-detection check and the picker-lookup narrowing cast) with `globalThis`, which is defined identically in Node and browsers and carries the same "showOpenFilePicker" in ... semantics.
- **Files modified:** app/src/lib/fsAccess.ts
- **Verification:** `cd app && npx vitest run src/test/fsAccess.test.ts` — all 4 tests pass, including the `supportsFsAccess` false-under-node assertion.
- **Committed in:** 38c8ff8 (Task 1 GREEN commit — fix was made before this commit, not as a separate follow-up)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for the plan's own stated acceptance criteria to pass under this package's test environment. No scope creep — same exported API surface, same behavior contract, only the global-object reference changed.

## Issues Encountered
- `app/node_modules` was absent in this worktree (fresh checkout via `git worktree`, which doesn't carry over `node_modules`). Ran `cd app && npm install` against the existing `app/package-lock.json` before the first test run — this installs the already-pinned dependency tree, not a new/different package, so it is a normal test-infrastructure setup step (per the TDD flow's "Check test infrastructure" step for the first TDD task in a plan), not a Rule-3-excluded package install.

## Next Phase Readiness
- `downloadBlob`, `supportsFsAccess`, `pickTextFileHandle`, `ensureReadWritePermission`, `backupFilename`, and `saveInPlaceWithBackup` are all available from `app/src/lib/fsAccess.ts` for the designs-file upload/save plans (04-03 onward) to import.
- No blockers. `saveInPlaceWithBackup`'s DOM-touching paths (`pickTextFileHandle`, `ensureReadWritePermission`, `saveInPlaceWithBackup`'s `createWritable`/`write`/`close` calls) are covered by type-check only in this plan, per the plan's own interfaces note (no `document`/File System Access API in the `node` vitest environment) — human verification of these paths is deferred to phase plan 04-08 as specified.

---
*Phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a*
*Completed: 2026-08-18*

## Self-Check: PASSED

All claimed files verified present: `app/src/lib/fsAccess.ts`, `app/src/test/fsAccess.test.ts`, `app/src/lib/export/mapImage.ts`, this SUMMARY.md. All claimed commit hashes verified present in git history: `72472a2`, `38c8ff8`, `070a425`, `533a420`.
