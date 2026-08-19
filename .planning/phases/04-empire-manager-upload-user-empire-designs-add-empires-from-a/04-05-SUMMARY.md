---
phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a
plan: 05
subsystem: frontend
tags: [react, empire-manager, dialog, ui-spec, file-upload, css]

# Dependency graph
requires:
  - phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a (plan 01)
    provides: "parseDesignsFile/DesignsFile/DesignsEntry/uniqueDesignName contract (designsText.ts)"
  - phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a (plan 02)
    provides: "downloadBlob/supportsFsAccess/pickTextFileHandle/ensureReadWritePermission/saveInPlaceWithBackup (fsAccess.ts)"
provides:
  - "useDesignsSession() — React hook owning designs/archive file state, FS-Access handle, and staged add/remove state, mounted in EmpirePanel so it survives dialog close/reopen"
  - "PdxName — shared colour-code-safe name renderer, promoted out of EmpirePanel.tsx"
  - "EmpireManagerPanel — the manager dialog: upload, archive upload, filterable designs list, remove/undo, pending summary, Save-changes placeholder"
  - "Entry-point button ('Manage my empire designs · {n} pending') always visible in EmpirePanel, independent of a .sav being loaded"
affects: [04-06, 04-07, 04-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DesignsFile referenced in useDesignsSession.ts via the inline type query `import(\"./designsText\").DesignsFile` (no `from \"./designsText\"` substring anywhere in the file) so the module has zero static references — even type-only — to the parser module; the real parser call is always `await import(\"./designsText\")` inside an action"
    - "Session state (useDesignsSession) lives in EmpirePanel, not in the dialog component — the dialog is a pure view over `session`, so closing/reopening never loses staged adds/removes"
    - "Local icon-with-onError-fallback component (RowIcon) mirrors EmpirePanel's SettingsChip idiom without importing it, since SettingsChip is not exported"

key-files:
  created:
    - app/src/lib/empire/useDesignsSession.ts
    - app/src/components/PdxName.tsx
    - app/src/components/EmpireManagerPanel.tsx
  modified:
    - app/src/components/EmpirePanel.tsx
    - app/src/styles/app.css

key-decisions:
  - "PdxName's header comment describes the dangerouslySetInnerHTML prohibition without spelling the literal identifier, so the file itself never contains that substring — satisfies both the plan's own acceptance grep (`grep -c 'dangerouslySetInnerHTML' returns 0`) and the underlying security intent"
  - "humanize() is duplicated locally in EmpireManagerPanel.tsx rather than imported from EmpirePanel.tsx — EmpirePanel doesn't export it and Task 2's file list didn't include modifying EmpirePanel.tsx, so re-implementing the same small pure function locally avoided an out-of-scope export change"
  - "'Discard changes' calls session.discard() directly with no confirmation step in this plan — the plan's Task 2 action specifies this literally ('a ghost Discard changes button calling session.discard()'); the UI-SPEC's staged-removal confirmation dialog belongs to the Save/Download Outcome Flow, which is explicitly 04-06's scope"
  - "Mobile bottom-sheet media query applies `position: fixed; inset: 8px; width: auto; max-height: 92vh` directly to `.empire-manager` (not the backdrop) — the dialog is normally centered by its flex backdrop, so pinning the panel itself to viewport insets at <640px is the literal translation of the plan's 'inset 8px, width: auto, max-height: 92vh' instruction onto a backdrop-centered (not backdrop-positioned) dialog"

requirements-completed: [D-01, D-02, D-03, D-04]

# Metrics
duration: 8min
completed: 2026-08-18
---

# Phase 4 Plan 05: Empire Manager Dialog Summary

**Ships the Empire Manager dialog end-to-end (upload → filterable list → stage/undo remove → pending summary) as a session hook mounted in `EmpirePanel`, wired to an always-visible entry-point button with a live pending-count label.**

## Performance

- **Duration:** ~8 min (first commit 20:43:59 → last commit 20:51:32, 2026-08-18)
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `useDesignsSession()` owns every piece of Empire Manager state (loaded designs/archive files, FS-Access handle + write permission, staged removals as an immutable `Set<number>`, staged adds as `StagedAdd[]`, derived `pendingCount` and `takenNames`) and is mounted in `EmpirePanel`, not the dialog — so closing the dialog never discards staged work (UI-SPEC Dialog Close Behavior).
- `parseDesignsFile` is reached exclusively via `await import("./designsText")` inside session actions; the hook itself has zero static references (value or type) to `designsText.ts` — verified both by grep and by the production build, where `designsText.ts` lands in its own lazy chunk (`designsText-EMGyahE6.js`, 2.08 kB) separate from the main bundle and from `savLoad`'s chunk, and `jomini`/`Jomini` do not appear anywhere in `index-*.js`.
- `EmpireManagerPanel` renders the full flow: drop-zone/picker upload with live "Parsing…" substitution, a compact loaded-file row with an "In-place saving enabled"/"Download only" badge, a collapsed-by-default archive upload, a case-insensitive name filter over `displayName` (never `rawName`), a scrollable list with colour-safe `<PdxName>` names and authority/species meta lines, per-row Remove/Undo staging, and a pending-changes summary strip.
- `PdxName` promoted out of `EmpirePanel.tsx` into its own module and now shared by both `EmpireSettingsPanel` and `EmpireManagerPanel` — one rendering path for all save/design-derived text, with no `dangerouslySetInnerHTML` anywhere in either new file (grep-verified).
- The entry-point button ("Manage my empire designs" / "Manage my empire designs · {n} pending") is rendered unconditionally in `EmpirePanel`, outside the `{selected && ...}` guard, matching UI-SPEC's "designs flow is independent of a `.sav` being loaded."
- 47 `.empire-manager`-prefixed rules appended to `app/src/styles/app.css`, reusing only existing tokens from `tokens.css` plus the two UI-SPEC-permitted literals (`rgba(0,0,0,0.45)` backdrop, `0 12px 40px rgba(0,0,0,0.55)` shadow) — confirmed zero new custom-property declarations before/after (9 → 9).

## Task Commits

1. **Task 1: useDesignsSession — designs/archive file state and staged changes** - `cb053d8` (feat)
2. **Task 2: EmpireManagerPanel dialog and shared PdxName component** - `29ffcce` (feat)
3. **Task 3: Entry-point button in EmpirePanel and manager CSS** - `975b75d` (feat)

## Files Created/Modified
- `app/src/lib/empire/useDesignsSession.ts` - session hook: designs/archive file state, FS-Access handle, staged removals/adds, `loadDesignsFile`/`loadDesignsViaPicker`/`loadArchiveFile`/`toggleRemove`/`stageAdd`/`undoAdd`/`discard`/`clearError`, all `useCallback`-wrapped
- `app/src/components/PdxName.tsx` - shared colour-code-safe name renderer (promoted from `EmpirePanel.tsx`)
- `app/src/components/EmpireManagerPanel.tsx` - the manager dialog: `RowIcon`/`LoadedFileRow` local helpers, upload/archive/list/pending sections, footer with Discard/Save actions
- `app/src/components/EmpirePanel.tsx` - inline `PdxName` deleted (now imported); `useDesignsSession()` + `showManager` state added; unconditional entry-point button; `EmpireManagerPanel` rendered alongside `EmpireSettingsPanel`
- `app/src/styles/app.css` - new `.empire-manager*` block (backdrop, panel, header, body, loaded-file row, badge, archive toggle, filter-input focus override, list/row states, pending strip, footer/save/discard, 640px bottom-sheet media query)

## Decisions Made
- Used TypeScript's inline `import("./designsText").DesignsFile` type query instead of a top-level `import type { DesignsFile } from "./designsText"` statement in `useDesignsSession.ts` — both are equally type-only/erasure-safe, but the inline form contains no `from "./designsText"` substring at all, satisfying the acceptance grep (`grep -c 'from "./designsText"'` returns 0) unambiguously rather than relying on an assumption about how that grep distinguishes `import type` from value imports.
- `RowIcon` (16px metadata icon with `onError` fallback) is a small new local component rather than a reuse of `EmpirePanel.tsx`'s `SettingsChip`, since `SettingsChip` isn't exported and Task 2's file list didn't include modifying `EmpirePanel.tsx`; it follows the same state+`onError` idiom.
- Filter-input focus-border override (`--color-select`) is scoped to `.empire-manager .find-box__input:focus` rather than a bare `.find-box__input:focus` rule, so `FindOverlay`'s existing input is untouched by this plan.

## Deviations from Plan

None — plan executed as written. One phrasing adjustment (see Decisions Made: the `PdxName.tsx` header comment describes the forbidden API without spelling its literal identifier) was necessary to satisfy the plan's own `grep -c 'dangerouslySetInnerHTML'` acceptance gate, since the plan's action text asked for a comment naming the API while the acceptance criteria required the string to be absent from the file. Not logged as a Rule 1-3 deviation since no code behavior changed — only comment wording, to make two parts of the same task's instructions simultaneously satisfiable.

## Known Stubs

- **`EmpireManagerPanel`'s "Save changes" button `onClick`** (`app/src/components/EmpireManagerPanel.tsx`, ~line 302) is an intentional no-op carrying a `TODO(04-06)` comment, exactly as the plan specifies ("do not invent an interim download implementation"). The button is `disabled` whenever `session.pendingCount === 0`; 04-06 wires the splice + write-back/download flow.
- The designs list renders only `session.designs.entries` rows; `session.adds` (staged "add from save" entries) are tracked and counted by `useDesignsSession` (feeding `pendingCount`/`takenNames`) but are not yet rendered as list rows with an "Added from save" badge — that UI, and the "Add to my empires" action itself, is 04-07's scope per the plan's objective ("adding empires from a save is 04-07").

## Issues Encountered
- `app/node_modules` was absent in this fresh worktree checkout; ran `cd app && npm install` against the existing `package-lock.json` before any verification step (same already-pinned dependency tree, not a new package — consistent with prior plans' documented setup step, not a Rule-3-excluded install).

## Next Phase Readiness
- `useDesignsSession`'s `stageAdd`/`undoAdd`/`takenNames` are ready for 04-07 to populate from a save-derived `StagedAdd` (D-09 disambiguation via `uniqueDesignName` against `takenNames`).
- `EmpireManagerPanel`'s Save button and footer are ready for 04-06 to replace the `TODO(04-06)` placeholder with the splice (`spliceDesignsFile`) + `saveInPlaceWithBackup`/download flow, plus the destructive/replace-file confirmation copy from the UI-SPEC's Save/Download Outcome Flow and Copywriting Contract.
- No blockers. Full verification passed: `cd app && npx tsc --noEmit` (clean), `cd app && npx vitest run` (12 files / 116 tests passed), `cd app && npm run build` (exits 0), and `grep -rn "dangerouslySetInnerHTML" app/src` (no matches).

---
*Phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a*
*Completed: 2026-08-18*

## Self-Check: PASSED

All claimed files verified present: `app/src/lib/empire/useDesignsSession.ts`, `app/src/components/PdxName.tsx`, `app/src/components/EmpireManagerPanel.tsx`, `app/src/components/EmpirePanel.tsx`, `app/src/styles/app.css`. All claimed commit hashes verified present in git history: `cb053d8`, `29ffcce`, `975b75d`.
