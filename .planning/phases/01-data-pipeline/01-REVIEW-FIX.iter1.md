---
phase: 01-data-pipeline
fixed_at: 2026-07-08T01:30:58Z
review_path: .planning/phases/01-data-pipeline/01-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-07-08T01:30:58Z
**Source review:** .planning/phases/01-data-pipeline/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 12 (4 Critical + 8 Warning; Info findings excluded per fix_scope=critical_warning)
- Fixed: 12
- Skipped: 0

All fixes were verified with `tsc --noEmit` after each change, plus targeted
functional verification against the real 4.5.0 corpus for the data-affecting
fixes. After all fixes, `npm run build:data` was re-run (678/678 techs,
count match=true, 0 unresolved @vars, 0 dangling icon refs) and the full
vitest suite passed (5 files, 51 tests). The regenerated
`pipeline/data/v4.5.0/` snapshot (gitignored build output) was synced to the
working tree.

## Fixed Issues

### CR-01: `--game-root` CLI argument is silently ignored by the pipeline entrypoint

**Files modified:** `pipeline/src/assemble.ts`
**Commit:** 786a556
**Applied fix:** `runAssemble()` now calls `resolveConfig()` (default
`process.argv.slice(2)`) instead of `resolveConfig([])`, so
`npm run build:data -- --game-root=<path>` takes effect. Test files keep the
deliberate `[]` to avoid vitest argv interference.

### CR-02: Duplicate `prereqfor_desc` blocks are silently dropped

**Files modified:** `pipeline/src/parser/tech-extractor.ts`
**Commit:** 3220eb8
**Applied fix:** `extractUnlockContentRaw` now iterates
`normalizeToArray(raw.prereqfor_desc)` instead of guarding on a single plain
object, so jomini's duplicate-key array form is handled. Verified against the
live corpus: `tech_gene_expressions` now captures both entries
(TECH_UNLOCK_GENE_EXPRESSIONS_* and TECH_UNLOCK_VOCATIONAL_GENES_*), and the
rebuilt snapshot ships it with non-empty `unlocks.grants`.

### CR-03: `grantsFromModifier` ships `[object Object]` and raw `@variable` strings

**Files modified:** `pipeline/src/unlocks.ts`, `pipeline/src/parser/tech-extractor.ts`, `pipeline/src/assemble.ts`
**Commit:** 6995e08
**Applied fix:** `grantsFromModifier` now (1) skips the modifier meta-keys
`description`/`description_parameters`, (2) skips object/array values (never
`String()`s an object), and (3) resolves `@`-prefixed string values through a
scripted-variables map. To make file-local `@vars` resolvable, `extractAllTechs`
now merges each tech file's own root-level `@var` definitions over the global
map and carries the merged map on each `ExtractedTech` as `fileVars`;
`buildUnlocks` takes it as a new parameter. Still-unresolved `@vars` ship
verbatim and are counted in `unresolvedGrantLocKeys`. Verified:
`tech_gene_tailoring` now ships `"BIOLOGICAL_species_trait_points_add: 2"`
(`@tech_gene_tailoring_POINTS` resolved from its file-local definition) and a
full-snapshot scan finds zero `[object Object]`, `: @...`, or meta-key lines.

### CR-04: Placeholder icon fallback writes one filename but references another

**Files modified:** `pipeline/src/assemble.ts`, `pipeline/test/corpus.test.ts`
**Commit:** ca3fe74
**Applied fix:** Introduced a memoized `usePlaceholder()` helper that copies
`assets/placeholder-icon.webp` ONCE into `data/v{ver}/icons/` (in a try/catch
that warns instead of failing the build, per D-13) and returns the referenced
filename — every fallback `icon` ref now points at a file that actually exists
under the icons output dir. Removed the per-key orphan placeholder copy, and
removed the `placeholder-` special case from corpus.test.ts Test 4 so the test
checks the real SCHEMA.md contract.

### WR-01: `convertDdsToWebp` failures are not caught in assemble

**Files modified:** `pipeline/src/assemble.ts`
**Commit:** 08c50a3
**Applied fix:** Base-icon conversion is wrapped in try/catch — on failure it
warns and falls back to `usePlaceholder()` (shared with CR-04's fix). Swap-icon
conversions are likewise wrapped (warn and skip). One corrupt DDS no longer
aborts the whole build, honoring convert.ts's documented D-13 contract.

### WR-02: Validation report asserts constants instead of measuring

**Files modified:** `pipeline/src/assemble.ts`, `pipeline/src/report.ts`, `pipeline/src/unlocks.ts`, `pipeline/src/parser/tech-extractor.ts`, `pipeline/src/icons/convert.ts`
**Commit:** a617640
**Applied fix:** All four vacuous metrics are now measured:
(1) `unresolvedVariableCount` aggregates a new `unresolvedVariableRefs` tally
returned by `buildUnlocks` (unresolved `@var` modifier values);
(2) `totalTechKeysFound` is counted inside the new `extractAllTechsWithStats`
BEFORE the extraction filter (the old `extractAllTechs` remains as a wrapper
for tests), so the parsed-vs-found count match can detect drift;
(3) `missingIconCount` became `placeholderIconCount`, counting
`icon === PLACEHOLDER_ICON_NAME` (constant now shared from convert.ts) since
`!icon` is permanently falsy-free after the fallback;
(4) `danglingPrerequisiteCount` is measured from the validated snapshot rather
than hardcoded. Post-fix build prints: `totalKeysFound=678 match=true`,
`Unresolved @scripted_variable references: 0` (now a real measurement),
`Placeholder icon: 0`.

### WR-03: Tech keys and swap names flow into output file paths unsanitized

**Files modified:** `pipeline/src/assemble.ts`
**Commit:** 9527722
**Applied fix:** Added `SAFE_NAME = /^[a-zA-Z0-9_\-@.]+$/` validation
(no path separators or segment syntax) for both the tech key and each
`swap.name` before any output path is built under `data/v{ver}/icons/`;
violations throw (fail-loud, T-01-01 defense-in-depth).

### WR-04: Array-form `host_has_dlc` (duplicate keys) silently ignored

**Files modified:** `pipeline/src/dlc/dlc-classifier.ts`
**Commit:** 048de01
**Applied fix:** `findHostHasDlc` now handles both the scalar and jomini's
auto-arrayed duplicate-key form, taking the first string entry — same Pitfall-5
arity handling as CR-02.

### WR-05: `filenameStem` only strips zero-prefixes

**Files modified:** `pipeline/src/dlc/dlc-classifier.ts`
**Commit:** 3ef5a7b
**Applied fix:** Prefix regex changed from `/^0+_?/` to `/^\d+_?/` so future
non-`00_` DLC tech files (e.g. `10_paragon_tech.txt`) still classify by
filename convention. DLC breakdown in the rebuilt snapshot is unchanged for the
current all-`00_`/`000_` corpus (including both known cross-DLC checks).

### WR-06: `parseClausewitzFile` does not strip a UTF-8 BOM

**Files modified:** `pipeline/src/parser/clausewitz.ts`
**Commit:** 37f2648
**Applied fix:** After the latin1 decode, the three latin1-decoded UTF-8 BOM
characters (U+00EF U+00BB U+00BF) are stripped, plus a defensive real-U+FEFF
strip — consistent with loc-scanner.ts. Functionally verified: a synthetic
BOM+`tech_x` file now parses with an intact `tech_x` key, and a BOM-only file
(real corpus: `00_repeatable.txt`) still parses to empty.

### WR-07: Swap-icon writes collide with real tech keys' outputs

**Files modified:** `pipeline/src/assemble.ts`, `pipeline/SCHEMA.md`
**Commit:** 444931a
**Applied fix:** The swap-conversion loop now skips any swap whose `name` is a
real extracted tech key (that tech's own pass produces `{name}.webp`),
eliminating the 28 double-writes and the latent last-writer-wins content
conflict. The swap-icon emission contract (including this rule and the fact
that swap files are not referenced from `tech.json`) is now documented in
SCHEMA.md.

### WR-08: Extractor silently defaults `area` to "physics" and `tier` to 0

**Files modified:** `pipeline/src/parser/tech-extractor.ts`
**Commit:** 0e210ed
**Applied fix:** Missing/invalid `area` now throws (fail-loud per D-16).
`tier` is resolved via `resolveValue` (numbers pass through, `@var` references
resolve, anything else throws naming the tech). Note: applying the review's
literal throw-on-non-number suggestion exposed a REAL instance of the silent
corruption this finding warned about — `tech_weaver_bio_healing_6` has
`tier = @fallentechtier` and was shipping `tier: 0`; it now correctly ships
`tier: 5` (the fix was adapted to resolve rather than reject this legitimate
corpus case). The rebuilt snapshot's tierCounts reflect the correction.

## Verification Summary

- `npx tsc --noEmit`: clean after every individual fix.
- `npm run build:data` (post-all-fixes): 678/678 techs, `match=true`,
  0 unresolved `@scripted_variable` refs (measured), 0 dangling prerequisites,
  0 placeholder icons, both cross-DLC checks match.
- Snapshot scan: `tech_gene_expressions` grants non-empty; zero
  `[object Object]` / `: @var` / meta-key lines across all 678 techs' grants;
  every `icon` ref (678/678) exists on disk under `data/v4.5.0/icons/`.
- `npx vitest run`: 5 test files, 51 tests, all passed (includes the
  full-corpus D-18 integration suite with the CR-04 test mask removed).
- Regenerated `pipeline/data/v4.5.0/` (tech.json + 803 icons) synced to the
  working tree (gitignored build output, not committed).

---

_Fixed: 2026-07-08T01:30:58Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
