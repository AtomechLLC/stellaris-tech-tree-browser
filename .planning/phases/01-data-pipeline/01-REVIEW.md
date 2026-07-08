---
phase: 01-data-pipeline
reviewed: 2026-07-08T01:42:38Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - pipeline/.gitignore
  - pipeline/SCHEMA.md
  - pipeline/package.json
  - pipeline/src/assemble.ts
  - pipeline/src/config.ts
  - pipeline/src/dlc/dlc-classifier.ts
  - pipeline/src/dlc/dlc-registry.ts
  - pipeline/src/graph/build-dag.ts
  - pipeline/src/icons/convert.ts
  - pipeline/src/icons/resolve.ts
  - pipeline/src/localisation/loc-scanner.ts
  - pipeline/src/parser/clausewitz.ts
  - pipeline/src/parser/scripted-variables.ts
  - pipeline/src/parser/tech-extractor.ts
  - pipeline/src/report.ts
  - pipeline/src/schema/tech-snapshot.ts
  - pipeline/src/unlocks.ts
  - pipeline/src/version/detect.ts
  - pipeline/test/corpus.test.ts
  - pipeline/test/icons.test.ts
  - pipeline/test/localisation.test.ts
  - pipeline/test/skeleton.test.ts
  - pipeline/test/tech-extractor.test.ts
  - pipeline/tsconfig.json
findings:
  critical: 1
  warning: 2
  info: 12
  total: 15
status: issues_found
---

# Phase 01: Code Review Report (iteration 2 — re-review after fix pass)

**Reviewed:** 2026-07-08T01:42:38Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Re-reviewed all 24 files after the 12-finding fix pass (commits 786a556..0e210ed).
Every fix was verified against the current source AND functionally against the
live 4.5.0 corpus and the regenerated `pipeline/data/v4.5.0/tech.json`
(678 techs, `tsc --noEmit` clean, 36/36 fast unit tests pass, snapshot
invariants re-measured directly).

**Fix verification results — 11 of 12 fixes are genuine and complete:**

- **CR-01 (--game-root ignored):** fixed. `runAssemble()` calls `resolveConfig()`
  with default `process.argv.slice(2)` (assemble.ts:69); test files keep `[]`.
- **CR-02 (duplicate prereqfor_desc dropped):** fixed. `normalizeToArray` loop
  at tech-extractor.ts:168-183; verified `tech_gene_expressions` now ships
  BOTH unlock descriptions in the snapshot.
- **CR-04 (dangling placeholder ref):** fixed. Memoized `usePlaceholder()`
  copies the placeholder once into the icons output dir (assemble.ts:92-105);
  corpus.test.ts:96-99 special case removed; verified all 678 icon refs
  resolve to real files on disk, 0 `.tmp.png` leftovers.
- **WR-01 (conversion failures abort build):** fixed. Base conversion wrapped
  in try/catch falling back to `usePlaceholder()` (assemble.ts:149-155); swap
  conversions warn-and-skip (assemble.ts:170-175).
- **WR-02 (asserted report constants):** fixed. `totalTechKeysFound` counted
  pre-filter in `extractAllTechsWithStats` (tech-extractor.ts:344),
  `unresolvedVariableCount` aggregated from `buildUnlocks` tallies,
  `danglingPrerequisiteCount` measured from the validated snapshot
  (assemble.ts:235-241), `placeholderIconCount` measures
  `icon === PLACEHOLDER_ICON_NAME` (report.ts:94).
- **WR-03 (unsanitized output paths):** fixed for writes. `SAFE_NAME` validates
  both tech keys (assemble.ts:140) and swap names (assemble.ts:165) before any
  output path is built; the character class cannot form a path separator or
  drive segment, and the appended `.webp`/`.tmp.png` suffix defuses bare-dot
  names. (Read paths remain unvalidated — see WR-02 below.)
- **WR-04 (array-form host_has_dlc):** fixed (dlc-classifier.ts:78-85).
- **WR-05 (zero-only prefix strip):** fixed — `/^\d+_?/` (dlc-classifier.ts:43);
  DLC classification tests still pass.
- **WR-06 (UTF-8 BOM):** fixed (clausewitz.ts:44-46), including the defensive
  real-U+FEFF strip; BOM-only `00_repeatable.txt` still parses.
- **WR-07 (swap-icon write collisions):** fixed via `extractedKeySet` skip
  (assemble.ts:116,164) and documented in SCHEMA.md.
- **WR-08 (silent area/tier defaults):** fixed — invalid area throws
  (tech-extractor.ts:211-213); tier resolves through `resolveValue`
  (tech-extractor.ts:222-232). Verified `tech_weaver_bio_healing_6` now ships
  `tier: 5` (was silently 0).

**One fix is incomplete:** CR-03 eliminated the three named garbage patterns
(`[object Object]`, raw `: @var`, `description`/`description_parameters`
lines — all re-verified at zero occurrences), but the defect CLASS survives:
two more modifier meta/display keys (`custom_tooltip`,
`show_only_custom_tooltip`) ship 38 confirmed garbage lines across ~30 techs
in the current snapshot (see CR-01 below). Additionally, the fix's
skip-arrays guard introduced a new latent silent-drop of the exact
duplicate-key arity class this codebase keeps getting bitten by (WR-01
below), and the T-01-01 path validation stops at write paths, leaving the
`icon =` override as an unvalidated read path (WR-02 below).

The 10 prior Info findings were intentionally out of fix scope; 9 are carried
forward below. Prior IN-07 (`scratch-debug/` not gitignored) is dropped as
resolved — the directory is now empty (0 files), so nothing will be committed.
Three new Info findings were introduced by the fix commits themselves.

## Critical Issues

### CR-01: CR-03 fix incomplete — `custom_tooltip` / `show_only_custom_tooltip` modifier keys ship 38 garbage lines as user-facing grant text (confirmed in shipped snapshot)

**File:** `pipeline/src/unlocks.ts:77` (`MODIFIER_META_KEYS`)
**Issue:** The meta-key skip set contains only `description` and
`description_parameters`. A full corpus scan (all top-level `modifier` blocks
across the 33 tech files) shows two more non-stat keys, both confirmed
shipping in the regenerated `data/v4.5.0/tech.json`:

1. `show_only_custom_tooltip` (boolean engine directive — "hide the stat
   lines, show only the custom tooltip") ships as literal grant text in 7
   techs, e.g. `tech_construction_templates`:
   `"show_only_custom_tooltip: false"`. This is the only boolean-valued
   modifier key in the corpus, so it also produces the only
   `true`/`false`-stringified user-facing lines.
2. `custom_tooltip` ships as `"custom_tooltip: <raw_loc_key>"` in 31 techs —
   e.g. `tech_battleship_build_speed` ships
   `"custom_tooltip: tech_battleship_build_speed_effect"` and
   `tech_storm_prediction_1` ships the literal `"custom_tooltip: BLANK_STRING"`.
   These values are REAL localisation keys with real display strings
   (verified: `tech_battleship_build_speed_effect:0 "$mod_ship_battleship_cost_mult$: §G-5%§!\n..."`
   exists in localisation/english/) — the actual human-readable effect text
   the tooltip is supposed to show is being discarded in favor of the raw key
   with a `custom_tooltip:` prefix.

This is the same defect class iteration 1 classified Critical in CR-03
("ships literal garbage in user-facing grants text"), confirmed in the
current artifact. The fix-pass verification scanned only for the two known
meta-keys, so it reported "zero meta-key lines" while these shipped.
**Fix:**
```ts
// unlocks.ts
const MODIFIER_META_KEYS = new Set(["description", "description_parameters", "show_only_custom_tooltip"]);

// in grantsFromModifier, before the generic stat handling:
if (statKey === "custom_tooltip" && typeof statValue === "string") {
  const { text, resolved } = resolveOrVerbatim(statValue, locMap);
  if (text.length > 0) out.push({ text, resolved, unresolvedVariable: false });
  continue; // never emit the "custom_tooltip:" prefix or the raw key
}
```
(Resolving via locMap ships the real effect text; an empty resolution — the
`BLANK_STRING` case — should emit nothing.) Re-run the build and re-scan
grants for `custom_tooltip`/`show_only_custom_tooltip`/`: (true|false)$` to
confirm zero occurrences.

## Warnings

### WR-01: CR-03's skip-arrays guard silently drops auto-arrayed duplicate stat keys — new latent instance of the Pitfall-5 arity class

**File:** `pipeline/src/unlocks.ts:99`
**Issue:** The fix's guard
`if (typeof statValue !== "string" && typeof statValue !== "number" && typeof statValue !== "boolean") continue;`
skips arrays wholesale. If a future patch declares the same stat key twice in
one `modifier` block (e.g. `envoys_add = 1` then `envoys_add = @gain` —
duplicate scalar keys jomini auto-arrays, the exact mechanism that caused
CR-02 and WR-04 in iteration 1), BOTH values are silently dropped: no grant
line, no `unresolvedGrantLocKeys` increment, no `unresolvedVariableRefs`
increment, nothing in the D-17 report. Verified zero corpus instances today
(scanned every top-level modifier block across all 33 files: 0 array-valued
entries besides the known `description_parameters` object), so this is
latent — but the failure on arrival is completely silent, which iteration 1
consistently treated as Warning-level (WR-04 precedent).
**Fix:**
```ts
// Expand auto-arrayed duplicate scalars instead of skipping them:
const values = Array.isArray(statValue) ? statValue : [statValue];
for (const v of values) {
  if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue; // objects only
  // ...existing label/value resolution per scalar v...
}
```

### WR-02: `icon =` override and swap names flow into READ paths unvalidated — WR-03's traversal fix covers writes only

**File:** `pipeline/src/icons/resolve.ts:63-64,77-79,88`; `pipeline/src/assemble.ts:136-141`
**Issue:** Iteration 1's WR-03 fix validates identifiers before building
WRITE paths, but `resolveIconSource` runs BEFORE the `SAFE_NAME` check
(assemble.ts:136 vs :140) and builds READ paths from unvalidated,
game-file-controlled strings via
`join(gameRoot, ICONS_SUBDIR, iconName + ".dds")`:

- `iconOverrideRaw` (the tech's `icon = "..."` field) is never validated
  anywhere. In a hostile/modded game root (threat T-01-01 — the same threat
  model WR-03 cited), `icon = "..\\..\\..\\some\\path\\file"` resolves and
  existence-probes an arbitrary location; if `<that path>.dds` exists,
  `convertDdsToWebp` READS it via ImageMagick and publishes its converted
  content into `data/v{ver}/icons/{key}.webp` — content from outside the
  game root shipped into the public artifact.
- `swap.name` and the tech key get the same unvalidated existence probe
  (read-only; the `SAFE_NAME` throw fires before any conversion/write for
  those, so impact there is limited to path probing).

The write-side fix is correct and complete; this closes the same threat
model's read side.
**Fix:** Apply the same identifier validation at the resolution boundary:
```ts
// resolve.ts
const SAFE_ICON_NAME = /^[a-zA-Z0-9_\-@.]+$/;
function resolveIfExists(gameRoot: string, iconName: string): string | null {
  if (!SAFE_ICON_NAME.test(iconName)) return null; // or throw, matching assemble's fail-loud writes
  const path = iconPath(gameRoot, iconName);
  return existsSync(path) ? path : null;
}
```

## Info

### IN-01: `gateway` token ships verbatim with no localisation attempt and no unresolved count (carried from iteration 1)

**File:** `pipeline/src/unlocks.ts:160-162`
**Issue:** The gateway token (confirmed: `"biological"` still ships raw for
`tech_gene_tailoring`) is pushed without a `locMap` lookup and never counted
in `unresolvedGrantLocKeys`, contradicting SCHEMA.md's "resolved where a real
localisation entry exists".
**Fix:** Run it through `resolveOrVerbatim` (consider `gateway_${token}`
first) and count fallbacks.

### IN-02: Misleading comment — numeric coercion cannot resolve chained `@a = @b` references (carried)

**File:** `pipeline/src/parser/scripted-variables.ts:69-74`
**Issue:** Comment claims the looked-up value "might itself be … another
reference; try one more numeric coercion" — `Number("@other")` is NaN, so a
chained reference always throws.
**Fix:** Update the comment (the fail-loud behavior itself is fine) or
implement one level of chained lookup.

### IN-03: latin1 decode + `encoding: "windows1252"` on an already-decoded string mis-maps 0x80-0x9F characters (carried)

**File:** `pipeline/src/parser/clausewitz.ts:39,48`
**Issue:** Bytes decode as ISO-8859-1; the windows1252 option has no effect on
a string input, so Windows-1252 punctuation (curly quotes, em-dash) becomes C1
control chars in extracted string content.
**Fix:** Decode via `new TextDecoder("windows-1252").decode(buf)`.

### IN-04: `scanAllLocalisation` is non-recursive despite the "scans EVERY .yml file" docstring (carried)

**File:** `pipeline/src/localisation/loc-scanner.ts:45`
**Issue:** `readdirSync(locDir)` skips subdirectories (`name_lists/`,
`random_names/` — 99 files). No tech keys live there today; the stated
contract is not what the code does.
**Fix:** `readdirSync(locDir, { recursive: true })` or document the one-level
limitation.

### IN-05: Test name lies — "throws when rawVersion is absent" tests a nonexistent-path throw instead (carried)

**File:** `pipeline/test/skeleton.test.ts:75-77`
**Issue:** `"/nonexistent-path-xyz"` throws at the `existsSync` guard; the
rawVersion-absent branch (detect.ts:22-26) is never exercised by any test.
**Fix:** Add a fixture with a `launcher-settings.json` lacking `rawVersion`
and assert that specific error message.

### IN-06: Corpus test hardcodes the `v4.5.0` output path the pipeline auto-detects (carried)

**File:** `pipeline/test/corpus.test.ts:28-29`
**Issue:** The next game patch breaks the suite with a confusing missing-file
error rather than a version-drift message.
**Fix:** Derive the expected dir via
`detectGameVersion(resolveConfig([]).gameRoot)`.

### IN-07: Duplicate root tech keys silently mishandled — same-file duplicates vanish entirely; cross-file duplicates last-write-win (carried as prior IN-08, extended)

**File:** `pipeline/src/parser/tech-extractor.ts:342-347`; `pipeline/src/assemble.ts:178`
**Issue:** Cross-file duplicate keys: both records extracted, snapshot Record
keeps the last, `leadsTo` gets duplicate edges. NEW observation this
iteration: a duplicate tech key within the SAME file is auto-arrayed by
jomini, fails `isPlainObject`, and the tech vanishes from the snapshot
entirely (counted once in `totalTechKeysFound`, extracted zero times). Thanks
to the WR-02 fix the report now prints `match=false` in both cases — but the
build still succeeds with silently wrong data. Zero corpus instances today
(678/678, match=true).
**Fix:** Fail loud (or dedupe-with-warn) on a repeated key; treat an
auto-arrayed top-level `tech_*` value as a duplicate-key error, not a skip.

### IN-08: Icons are converted before the missing-name strict-fail — failed builds leave fully-populated icons output (carried as prior IN-09)

**File:** `pipeline/src/assemble.ts:120-197`
**Issue:** All icon conversion happens in the per-tech loop; the missing-name
throw fires after it (line 191). A failing run leaves `data/v{ver}/icons/`
populated with no `tech.json`, and repeats the conversion work every retry.
**Fix:** Resolve all names (collect missing) before the conversion loop.

### IN-09: `.default()` on schema fields weakens the pre-write validation gate (carried as prior IN-10)

**File:** `pipeline/src/schema/tech-snapshot.ts:41,60,63,68,70`
**Issue:** `category`, `prerequisites`, `dlc`, `description`, and `icon` carry
`.default(...)`, so a malformed tech missing `prerequisites` entirely passes
the D-16 gate and is silently patched.
**Fix:** Drop `.default()` in the pipeline-side validation schema.

### IN-10: Unused `existsSync` import in assemble.ts — dead code introduced by the fix commits (new)

**File:** `pipeline/src/assemble.ts:32`
**Issue:** `existsSync` is imported but no longer referenced anywhere in the
module (the CR-04 rework removed its last use). `tsc` doesn't catch it because
`noUnusedLocals` is not enabled in tsconfig.
**Fix:** Remove `existsSync` from the import; consider enabling
`noUnusedLocals` in `pipeline/tsconfig.json`.

### IN-11: `writePlaceholderIcon` is dead production code post-CR-04, and its test's comment describes a path assemble.ts no longer has (new)

**File:** `pipeline/src/icons/convert.ts:70-72`; `pipeline/test/icons.test.ts:137-145`
**Issue:** After the CR-04 fix, assemble.ts uses `copyFileSync` directly
inside `usePlaceholder()`; `writePlaceholderIcon` is referenced only by
icons.test.ts Test 3, whose comment ("Simulates assemble.ts's fallback path")
is now false — the test exercises a helper production no longer calls.
**Fix:** Either have `usePlaceholder()` call `writePlaceholderIcon` (keeping
one copy-helper), or delete the helper and repoint/retire the test.

### IN-12: Modifier grant labels never try the `mod_<statKey>` localisation convention — nearly every modifier grant ships a raw engine key as its label (new)

**File:** `pipeline/src/unlocks.ts:101`
**Issue:** `resolveOrVerbatim(statKey, locMap)` looks up the raw stat key,
but Stellaris localises modifier display names under `mod_<statKey>`
(verified: `$mod_ship_battleship_cost_mult$` and
`$mod_shipsize_battleship_build_speed_mult$` exist in localisation/english/
while the bare keys do not). Shipped grants therefore read
`"planet_jobs_energy_produces_mult: 0.15"` instead of a human label, and each
such line inflates `unresolvedGrantLocKeys`. SCHEMA.md promises resolution
"where a real localisation entry exists" — one does, under the `mod_` prefix.
Same family as IN-01; cosmetic per D-16.
**Fix:** Try `locMap.get(`mod_${statKey}`)` before the bare-key lookup.

---

_Reviewed: 2026-07-08T01:42:38Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
