---
phase: 04-empire-manager-upload-user-empire-designs-add-empires-from-a
reviewed: 2026-08-19T05:19:02Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - app/src/lib/empire/designSchema.ts
  - app/src/lib/empire/designsText.ts
  - app/src/lib/empire/designSerialize.ts
  - app/src/lib/empire/designFromSav.ts
  - app/src/lib/empire/savLoad.ts
  - app/src/lib/empire/useDesignsSession.ts
  - app/src/lib/fsAccess.ts
  - app/src/lib/export/mapImage.ts
  - app/src/components/EmpireManagerPanel.tsx
  - app/src/components/PdxName.tsx
  - app/src/components/EmpirePanel.tsx
  - app/src/styles/app.css
  - app/src/test/designsText.test.ts
  - app/src/test/fsAccess.test.ts
  - app/src/test/designSerialize.test.ts
  - app/src/test/designFromSav.test.ts
  - app/src/test/designsOutputs.test.ts
  - app/src/test/stageAdd.test.ts
  - app/src/test/realFileRoundtrip.test.ts
findings:
  critical: 2
  warning: 9
  info: 8
  total: 19
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-08-19T05:19:02Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Reviewed the Phase 4 Empire Manager implementation: the designs-file round-trip engine (`designsText.ts`), the single-entry serializer (`designSerialize.ts`), the save→design extractor (`designFromSav.ts`), the session hook (`useDesignsSession.ts`), the File System Access wrapper (`fsAccess.ts`), the two React components, styles, and all seven test files.

**Key invariants verified as holding:**
- No `dangerouslySetInnerHTML` / `innerHTML` anywhere in `app/src` — all untrusted names render via `PdxName` (React children) or `stripPdxCodes`.
- jomini/fflate stay out of the main bundle: every non-test import of `savLoad.ts`/`designsText.ts` in app code is `import type` (erased); runtime access is exclusively `await import(...)` inside actions.
- Kept-entry output always comes from `file.text.slice(entry.start, entry.end)` — `spliceDesignsFile` never re-serializes.
- Removal always pairs with an archive entry in `buildDesignsOutputs` (archive text built whenever `removed.size > 0`).
- Pre-write backup ordering is encoded in `saveInPlaceWithBackup`'s body (backup download fires before `createWritable()`), with no opt-out parameter.

**Key concerns found:** two Critical issues. (1) The serializer's injection guard has a hole: unquoted (`bareLine`) string fields — both `gender` emissions — pass untrusted save-file strings through unsanitized, and I verified jomini accepts newlines and braces inside quoted save strings, so a crafted `.sav` can splice arbitrary Clausewitz structure into the user's real designs file. (2) The session never re-baselines the archive after a save, so a second save in one session emits an archive file that silently drops the first save's archived entries — breaking the "removed designs are archived, not deleted" durability promise through the sanctioned workflow. Additionally, the real-file integration suite is currently failing (3 tests) because it hardcodes absolute entry counts against the user's live, mutable designs file.

## Critical Issues

### CR-01: Injection guard bypass — unquoted `gender` fields emit untrusted save strings unsanitized

**File:** `app/src/lib/empire/designSerialize.ts:52-54` (emission sites `:141`, `:164`; sources `app/src/lib/empire/designFromSav.ts:86`, `:112`, `:131`)
**Issue:** The module documents `sanitize()` as the T-04-08 injection guard for "every quoted value", but `bareLine` — used for `species.gender` (`designSerialize.ts:141`) and `ruler.gender` (`:164`) — performs no sanitization. Both values originate in an untrusted uploaded `.sav`: `buildSpecies` (`designFromSav.ts:86`) and `resolveRuler` (`:112`, `:131`) accept any string with only a `typeof === "string"` check. Verified directly against the project's jomini build: `parseText('gender="male\n}\ninjected=1"')` yields the string `"male\n}\ninjected=1"` — i.e., a crafted save can carry CR/LF, braces, `=`, and quotes inside a quoted `gender` value. That string is then emitted bare into the entry text (`gender=male\n}\ninjected=1`), letting arbitrary Clausewitz structure (including balanced-brace payloads that add fake top-level entries) be spliced into the user's real `user_empire_designs_v3.4.txt`. `spliceDesignsFile` does not validate added texts, and in `save()` the in-place write happens *before* the re-parse that would detect corruption (`useDesignsSession.ts:368` vs `:402`) — so a corrupted file lands on disk (mitigated only by the backup download).
**Fix:**
```typescript
/** Bare (unquoted) Clausewitz tokens admit only identifier characters —
 *  anything else could terminate the token or inject structure. */
function sanitizeToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "");
}

function bareLine(depth: number, field: string, value: string | number, nl: string): string {
  const v = typeof value === "string" ? sanitizeToken(value) : value;
  return `${indent(depth)}${field}=${v}${nl}`;
}
```
(Alternatively, validate `gender` against the known token set — `male` / `female` / `not_set` / `indeterminable` — in `designFromSav.ts` and default to `not_set`.) Add a test mirroring the existing injection-guard test but targeting `species.gender` / `ruler.gender`.

### CR-02: Archive never re-baselined after save — second save in one session drops previously archived entries

**File:** `app/src/lib/empire/useDesignsSession.ts:390-404`
**Issue:** After a successful save, the designs file is re-parsed and re-baselined (`:402-404`), but `archive` is never updated (`setArchive` is not called anywhere in `save()`). Sequence: (1) user removes entry A, saves → archive download #1 contains `[uploaded archive] + A`; session's `archive` still holds only the uploaded archive. (2) In the same session, user removes entry B, saves → `buildDesignsOutputs` builds archive #2 from the stale `archive` state: `[uploaded archive] + B` — **entry A is missing**. Meanwhile A was already removed from the designs file in save #1. The instructed workflow ("Downloading your files instead; replace the originals manually" — `:373`, `:378`) has the user replace their archive with the latest download, at which point A's design exists nowhere except a prior browser download the UI never tells them to keep. This directly breaks the phase's "Removed designs are archived, not deleted" promise (`EmpireManagerPanel.tsx:414`, `:426-427`) across multiple saves in one session — a data-loss defect in the exact scenario (repeat use without reloading) that the designs-side re-baseline comment (`:399-401`) exists to prevent.
**Fix:**
```typescript
// In save(), after setDesignsOriginalBytes(designsBytes):
if (archiveText !== null) {
  const archiveBytes = encodeDesignsText(archiveText);
  const reparsedArchive = await parseDesignsFile(
    archiveBytes,
    archive?.filename ?? DEFAULT_ARCHIVE_FILENAME,
  );
  setArchive(reparsedArchive);
}
```
Add a `buildDesignsOutputs` sequence test: remove+save, feed the produced archive back as the new archive, remove again, and assert both removed entries appear in archive #2.

## Warnings

### WR-01: `save()` has no error handling — failures are swallowed as unhandled rejections and can leave disk and session state inconsistent

**File:** `app/src/lib/empire/useDesignsSession.ts:342-405` (call sites `app/src/components/EmpireManagerPanel.tsx:149`, `:440`)
**Issue:** `save()` is invoked as `void session.save()` with no `.catch`, and its body has no try/catch around: the dynamic `import("./designsText")` (`:346` — a chunk-load failure makes Save a silent no-op), `downloadBlob` (`:385`, `:392`), and critically the post-write re-parse (`:402`). If `parseDesignsFile(designsBytes, ...)` throws after an in-place write (possible whenever an added entry's text breaks the file's parseability — see CR-01), the file on disk holds the new content but `designs`/`designsOriginalBytes` still hold the old baseline while `removed`/`adds` were already cleared (`:396-397`). A subsequent save in that session splices from the stale baseline and silently reverts the first save's changes on disk. The UI shows no error in any of these paths.
**Fix:** Wrap the body of `save()` in try/catch → `setError(...)`; reorder so `setRemoved`/`setAdds`/`setLastSave` only run after the re-baseline succeeds; on re-parse failure, clear the loaded file (force a re-upload) instead of keeping a stale baseline. Have callers `catch` too, or keep `void` only once the hook is internally safe.

### WR-02: D-09 collision resolution runs on the pre-sanitized key — sanitization can collapse a "unique" name into a duplicate

**File:** `app/src/lib/empire/useDesignsSession.ts:286-302` (with `app/src/lib/empire/designSerialize.ts:44-46`, `:219-221`)
**Issue:** `resolveStagedName` compares the *unsanitized* `designPayload.key` against taken names, then `serializeDesignEntry` strips `"`, CR, and LF from it (`sanitize`). A save-derived name like `Alarian"Consciousness` passes the collision check against an existing `AlarianConsciousness` entry (different strings), then serializes to the top-level key `"AlarianConsciousness"` — a duplicate the D-09 machinery was built to prevent. The staged add's `rawName` (`:311`) also then differs from what actually lands in the file, so `takenNames` and the UI display are wrong for that entry.
**Fix:** Export `sanitize` from `designSerialize.ts` (or duplicate the 3-char strip locally) and apply it to `desiredKey` *before* calling `resolveStagedName`, so the resolved name equals the emitted bytes:
```typescript
const desiredKey = sanitizeDesignKey(designPayload.key); // strip " \r \n first
```

### WR-03: Real-file integration suite asserts absolute entry counts against a live mutable file — currently failing

**File:** `app/src/test/realFileRoundtrip.test.ts:45`, `:80`, `:132`
**Issue:** Ran the suite: 3 of 5 tests fail on this machine (`expected 181 to be 183`, `180 to be 182`, `182 to be 184`). The tests hardcode `183`/`182`/`184` for the user's real `user_empire_designs_v3.4.txt`, which is a live game file the user edits by playing — it now has 181 entries. Every future in-game design change re-breaks these tests, training everyone to ignore red in the exact suite guarding the byte-preservation property. (The two byte-identity tests still pass, which is real evidence the engine is correct — the failures are pure assertion brittleness.)
**Fix:** Assert relative invariants instead of absolutes:
```typescript
const baseline = file.entries.length;
expect(baseline).toBeGreaterThan(0);
// ...
expect(reparsed.entries.length).toBe(baseline - 1); // removal test
expect(reparsed.entries.length).toBe(baseline + 1); // append test
```

### WR-04: Zero-change save silently normalizes bytes for non-canonical files (BOM, leading whitespace, non-uniform separators) with no validation or warning

**File:** `app/src/lib/empire/designsText.ts:129-148`, `:196-239`, `:279-290`
**Issue:** The D-08 byte-identity guarantee is quietly narrower than validated. (1) `decodeDesignsBytes`' UTF-8 `TextDecoder` strips a UTF-8 BOM, and `encodeDesignsText` never restores it — a BOM-prefixed file changes bytes on a zero-change save with no warning (the cp1252 path *does* warn; this path doesn't). (2) `spliceDesignsFile` output starts at `entries[0].start`, so any leading whitespace/blank lines are silently dropped. (3) The separator is sampled only from the first gap (`:236-237`); a hand-edited file with a blank line between two entries (gap `"\r\n\r\n"`) has all gaps rewritten to the sampled separator. (4) The trailing-content check (`:206`) only rejects non-whitespace — a file missing its final newline or ending in extra blank lines is silently rewritten. Related: `stageAddFromEmpire` reuses `designs.separator` as the *intra-entry* line terminator (`useDesignsSession.ts:302`), so a `"\r\n\r\n"`-separated file would produce a double-spaced serialized entry. None of these occur for a game-written file (the real-file round-trip test passes byte-identically), but the module's headline is that a serializer bug "can never" alter untouched bytes — these paths alter them without telling the user.
**Fix:** In `parseDesignsFile`, verify text before `spans[0].start` is empty and every inter-span gap plus the trailing slice equals the sampled separator; on mismatch, either preserve the exact gaps in `spliceDesignsFile` (store per-entry gap slices) or set a user-visible `warning` like the cp1252 path does. For the staged-add newline, derive it from the separator (`separator.includes("\r\n") ? "\r\n" : "\n"`) instead of passing the separator verbatim.

### WR-05: `loadDesignsFile` leaves a stale file handle and `canWriteInPlace` from a previously picked file

**File:** `app/src/lib/empire/useDesignsSession.ts:193-212`
**Issue:** `loadDesignsViaPicker` sets `handle`/`canWriteInPlace`, but `loadDesignsFile` (the `File`-based path: drop zone, hidden `<input>`) never clears them. If it ever runs while a picker handle is held, the session shows "In-place saving enabled" for file B while `handle` still points at file A, and `save()` would overwrite file A on disk with file B's spliced content — a wrong-file in-place write. Today the UI happens to make this unreachable (the drop zone only renders when `!session.designs`, and FSA-capable browsers route "change file" through the picker), but the hook's own API doesn't enforce the invariant; any future caller or UI tweak (e.g., allowing drop onto the loaded-file row) turns this into silent data corruption of the wrong file.
**Fix:** In `loadDesignsFile`'s success path:
```typescript
setHandle(null);
setCanWriteInPlace(false);
```

### WR-06: Staged adds keyed by per-save country id — loading a second `.sav` cross-wires "Added" state and silently replaces prior staged adds

**File:** `app/src/lib/empire/useDesignsSession.ts:271-322` (and `app/src/components/EmpirePanel.tsx:107`)
**Issue:** `StagedAdd.sourceEmpireId` is the country id inside one save, but the designs session outlives `.sav` reloads. Country ids collide across saves (the player is id 0 in nearly every save). After staging empire 0 from save #1 and loading save #2: (a) `EmpirePanel.tsx:107` finds save-1's staged add for save-2's empire 0, so the button reads "Added ✓ — undo" for an empire that was never staged; (b) clicking "Add to my empires" for save-2's empire 0 runs the replace-filter (`:317`) and silently deletes save-1's staged design — unrequested loss of staged work.
**Fix:** Namespace the identity per load — e.g., keep a `loadToken` (incremented in `EmpirePanel.handleBytes`) and store/compare `sourceKey = \`${loadToken}:${empire.id}\``; or have `EmpirePanel` pass a per-load token into `stageAddFromEmpire` and the `stagedAdd` lookup.

### WR-07: Backup download can be silently blocked by the browser's multiple-download policy before the in-place write proceeds

**File:** `app/src/lib/fsAccess.ts:134-149` (with `app/src/lib/empire/useDesignsSession.ts:358-393`)
**Issue:** One "Save & continue" click can fire up to two programmatic downloads (backup, archive) plus a file-handle write, or three downloads on the fallback path. Chromium blocks the second-and-later automatic downloads in a single gesture unless the user has granted the "download multiple files" permission — and `downloadBlob` (fire-and-forget anchor click) cannot detect the block. The D-02 ordering guarantee ("backup fires before the write") is then hollow: `a.click()` returned, but no backup file materialized, and `createWritable()` overwrites the original anyway. The archive download is exposed to the same silent drop.
**Fix:** No perfect in-browser detection exists, but reduce exposure: on the in-place path, write the backup via the File System Access API too (e.g., prompt once for a backup save location) or at minimum surface the backup filename with copy "check your downloads for the backup" *before* enabling the write, and document the multiple-download permission in the confirm dialog. Alternatively bundle archive+backup into one download (single `.zip` via the already-present fflate) so only one automatic download ever fires per save.

### WR-08: File inputs never reset — re-selecting the same file is a silent no-op

**File:** `app/src/components/EmpireManagerPanel.tsx:233-239`, `:304-310`; `app/src/components/EmpirePanel.tsx:149-155`
**Issue:** None of the three hidden `<input type="file">` elements clear `value` after a selection. Browsers don't fire `change` when the user picks the same path again. Concrete dead-end: user selects a malformed designs file → parse error shown → fixes the file in a text editor → clicks "change file" and picks it again → nothing happens, no feedback. Same for the archive input and the `.sav` input.
**Fix:** Reset in the handler:
```tsx
onChange={(e) => {
  onDesignsFile(e.target.files?.[0] ?? undefined);
  e.target.value = "";
}}
```

### WR-09: Archive parse warning discarded — cp1252-fallback archive re-encoded as UTF-8 with no user-facing warning

**File:** `app/src/lib/empire/useDesignsSession.ts:241-256`
**Issue:** `loadDesignsFile`/`loadDesignsViaPicker` surface `parsed.warning` (the windows-1252 fallback's "saving may alter non-ASCII characters" notice) via `setWarning`, but `loadArchiveFile` drops `parsed.warning` on the floor. An archive that decoded via the cp1252 fallback is then re-encoded as UTF-8 on save (`encodeDesignsText`), altering its existing non-ASCII bytes — exactly the situation the warning copy exists for, and RESEARCH Pitfall 6 says the archive gets the same rules as the designs file.
**Fix:** In `loadArchiveFile`'s success path: `if (parsed.warning) setWarning(parsed.warning);` (or track a separate `archiveWarning` so the designs warning isn't clobbered).

## Info

### IN-01: Dead `file` branch in the replace-confirmation flow

**File:** `app/src/components/EmpireManagerPanel.tsx:19`, `:108`, `:122-123`
**Issue:** `Confirm`'s replace variant carries `file: File | null`, but the only `setConfirm({ kind: "replace", ... })` site always passes `file: null`, so `onReplaceConfirm`'s `if (target.file)` branch is unreachable. Either dead code, or a missing wiring: a file *dropped* while pending changes exist should probably route through this confirm with the dropped file (the drop zone currently bypasses confirmation entirely, though it only renders when no file is loaded).
**Fix:** Remove the `file` field and branch, or wire the drop path through it.

### IN-02: Success banner not cleared on staging an add, contradicting the component's own comment

**File:** `app/src/components/EmpireManagerPanel.tsx:95-97` (with `useDesignsSession.ts:271-322`, `:324-326`)
**Issue:** The comment says the banner clears on close *and* on "staging a new change — see toggleRemove", but only `onToggleRemove` calls `clearLastSave`. `stageAddFromEmpire` (from `EmpirePanel`) and `undoAdd` don't, so after a save the stale "Saved — N added…" banner keeps rendering *instead of* the pending-changes summary (they occupy the same slot, `:393-419`) while new changes are pending.
**Fix:** Call `setLastSave(null)` inside `stageAddFromEmpire` (on the staged path) and `undoAdd`, or clear it in the panel action.

### IN-03: List rows keyed by index + stateful `RowIcon` retain stale failure state across file replacement

**File:** `app/src/components/EmpireManagerPanel.tsx:37-52`, `:364-369`
**Issue:** Entry rows use `key={index}` and `RowIcon` holds a `failed` flag. Replacing the loaded designs file reuses row instances by position, so a row whose previous authority icon 404'd keeps `failed=true` and never shows the new file's (valid) icon at that position.
**Fix:** Key rows by `${session.designs.filename}:${index}` (or reset via `key={entry.authority}` on `RowIcon`).

### IN-04: Duplicate-name notices render raw names with embedded 0x11 control bytes as plain text

**File:** `app/src/components/EmpireManagerPanel.tsx:349-353`; `app/src/components/EmpirePanel.tsx:228-233`
**Issue:** `add.originalName` / `addCollision.from`/`to` can carry raw Paradox colour-escape bytes (design keys come from raw save names). They're interpolated directly into text nodes, so users see tofu/invisible control characters instead of the clean name. No XSS risk (React escapes), purely a rendering defect — every other name in these components goes through `PdxName`/`stripPdxCodes`.
**Fix:** Wrap in `stripPdxCodes(...)` (these are quoted inline in prose, so the plain-text form fits better than `PdxName`).

### IN-05: `/^[A-Za-z]/` filter silently hides AI empires with colour-coded, numeric-leading, or non-Latin names

**File:** `app/src/components/EmpirePanel.tsx:132`
**Issue:** `others` excludes any non-player empire whose raw name doesn't start with an ASCII letter — which includes names beginning with a 0x11 colour escape (the exact case `PdxName`/`stripPdxCodes` exist for), digits, or non-Latin characters. Those empires can never be selected or added to designs.
**Fix:** Test the stripped form: `/^[A-Za-z]/.test(stripPdxCodes(e.name))`, or filter on the actual intent (e.g., exclude `country_\d+` fallback names) instead.

### IN-06: PUA placeholder substitution can collide with names legitimately containing U+E011/U+E013

**File:** `app/src/lib/empire/designsText.ts:39-46`, `:250`
**Issue:** `toParserSafeText` maps 0x11→U+E011 and 0x13→U+E013. A name that already contains a literal U+E011 becomes indistinguishable from an escape-substituted one during the reconciliation lookup (`parsed[toParserSafeText(span.name)]`), which could pair a span with the wrong parsed value (metadata only — spliced bytes are unaffected). Vanishingly unlikely in real files.
**Fix:** None required; a comment noting the theoretical collision (or picking unassigned-plane codepoints) is sufficient.

### IN-07: `downloadBlob` anchor never enters the DOM and the object URL is revoked synchronously

**File:** `app/src/lib/fsAccess.ts:51-63`
**Issue:** Works in current Chromium/Firefox, but the historically robust pattern appends the anchor to the document and defers `revokeObjectURL` (e.g., `setTimeout(..., 0)` or after a task) — older Firefox ignored clicks on detached anchors, and synchronous revocation is spec-grey. This helper carries the pre-write backup (WR-07), so it deserves the most conservative form.
**Fix:** `document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);`

### IN-08: Two independent Jomini parser singletons

**File:** `app/src/lib/empire/designsText.ts:20`, `:210`; `app/src/lib/empire/savLoad.ts:63`, `:74`
**Issue:** Each module lazily holds its own `Jomini.initialize()` result, so a session that loads both a `.sav` and a designs file initializes the WASM parser twice. Harmless functionally; minor memory/startup duplication.
**Fix:** Optional — share one lazy singleton from a tiny `jominiInstance.ts` module (still dynamically imported only).

---

_Reviewed: 2026-08-19T05:19:02Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
