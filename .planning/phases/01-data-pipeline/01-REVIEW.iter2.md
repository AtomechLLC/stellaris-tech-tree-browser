---
phase: 01-data-pipeline
reviewed: 2026-07-08T00:59:04Z
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
  critical: 4
  warning: 8
  info: 10
  total: 22
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-08T00:59:04Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Reviewed the full data-pipeline package (18 source files, 5 test suites, config).
The T-04-01 command-injection mitigation is genuinely in place: ImageMagick is
invoked exclusively via `execFileSync` argument arrays, tests assert the exact
call shape, and no shell string is ever built from `gameRoot`. The Zod
validation gate before write, the DAG cycle/dangling validation, and the
determinism sorting are implemented as designed.

However, several findings were **verified against the live 4.5.0 corpus and the
actual generated snapshot** (`pipeline/data/v4.5.0/tech.json`), and four are
Critical:

1. The documented `--game-root` CLI flag is dead code — the entrypoint passes
   `[]` to `resolveConfig`, so a user-specified install path is silently
   ignored and the default install is parsed instead.
2. `tech_gene_expressions` ships `unlocks.grants: []` — both of its
   `prereqfor_desc` unlock descriptions are silently dropped because the
   extractor does not handle jomini's duplicate-key array form at the
   `prereqfor_desc` level (the same Pitfall-5 arity handled everywhere else).
3. `tech_gene_tailoring` ships literal garbage in user-facing grants text:
   `"description_parameters: [object Object]"` and an unresolved
   `"@tech_gene_tailoring_POINTS"` variable — while the validation report
   prints a hardcoded "Unresolved @scripted_variable references: 0".
4. The placeholder-icon fallback writes the placeholder to `{key}.webp` but
   sets the tech's `icon` field to `"placeholder-icon.webp"`, a file that is
   never emitted under `data/v{version}/icons/` — any tech hitting this path
   ships a dangling icon reference, and the corpus test special-cases the
   placeholder prefix in a way that masks the bug.

The warnings cluster around (a) the validation report asserting constants
instead of measuring (several D-17 metrics are provably vacuous or false),
(b) latent duplicate-key/arity and filename-prefix bugs of the exact same
class as the confirmed Critical ones, and (c) a defense-in-depth gap where
tech keys and swap names parsed from game files flow into output file paths
unsanitized.

## Critical Issues

### CR-01: `--game-root` CLI argument is silently ignored by the pipeline entrypoint

**File:** `pipeline/src/assemble.ts:58`
**Issue:** `runAssemble()` calls `resolveConfig([])`, passing an empty argv
array. `resolveConfig`'s CLI parsing (`config.ts:69-80`) therefore never sees
`process.argv`, so the documented D-15 precedence #1 mechanism
(`npm run build:data -- --game-root=<path>`) does nothing. On a machine where
the default `Z:\SteamLibrary\...` install exists (this one), the pipeline
silently parses the **wrong** install while the user believes they targeted a
custom path — the exact corrupt-snapshot outcome the plan's threat model
flags. The env var path still works, which makes the failure harder to
notice. (The `resolveConfig([])` calls in the test files are deliberate to
avoid vitest argv interference; the entrypoint call is not.)
**Fix:**
```ts
// assemble.ts:58 — let resolveConfig use its default process.argv.slice(2)
const { gameRoot } = resolveConfig();
```

### CR-02: Duplicate `prereqfor_desc` blocks are silently dropped — confirmed data loss in the shipped snapshot

**File:** `pipeline/src/parser/tech-extractor.ts:154-167`
**Issue:** `extractUnlockContentRaw` guards with
`if (isPlainObject(prereqforDescBlock))`. When a tech declares
`prereqfor_desc` twice, jomini auto-arrays the duplicate key (Pitfall 5), the
value is an **array**, the guard fails, and ALL prereqfor_desc content for
that tech is silently discarded. This is not latent: `tech_gene_expressions`
(`00_soc_tech.txt:3150` and `:3157`) has two `prereqfor_desc` blocks, and the
generated `data/v4.5.0/tech.json` ships it with `unlocks.grants: []` — both
"Gene Expressions" and "Vocational Genes" unlock descriptions are lost. Every
other duplicate-key site in this codebase uses `normalizeToArray`; this one
was missed.
**Fix:**
```ts
const prereqforDesc: PrereqforDescEntry[] = [];
for (const block of normalizeToArray(
  raw.prereqfor_desc as Record<string, unknown> | Record<string, unknown>[] | undefined,
)) {
  if (!isPlainObject(block)) continue;
  for (const kindValue of Object.values(block)) {
    // ...existing entry loop...
  }
}
```

### CR-03: `grantsFromModifier` ships `[object Object]` and raw `@variable` strings as user-facing grant text — confirmed in shipped snapshot

**File:** `pipeline/src/unlocks.ts:75-85`
**Issue:** `grantsFromModifier` iterates **every** key of a top-level
`modifier` block and emits `` `${label}: ${String(statValue)}` ``. Three
concrete failures, all confirmed in the generated `tech.json` for
`tech_gene_tailoring` (`00_soc_tech.txt:2751-2757`):
1. Nested-object values stringify to garbage:
   `"description_parameters: [object Object]"` is in the shipped grants.
2. Modifier meta-keys (`description`, `description_parameters`) are not stat
   grants at all, but are emitted as fake "stat: value" lines
   (`"description: tech_gene_tailoring_modifier_desc"`).
3. `@scripted_variable` values pass through unresolved:
   `"BIOLOGICAL_species_trait_points_add: @tech_gene_tailoring_POINTS"` ships
   raw — note this is a file-local variable defined at `00_soc_tech.txt:2740`,
   which `loadScriptedVariables` never sees (it only reads
   `common/scripted_variables/`). Meanwhile the D-17 report prints a
   hardcoded "Unresolved @scripted_variable references: 0" (see WR-02),
   which this proves false for shipped output.
**Fix:** In `grantsFromModifier`: skip the known meta-keys
(`description`, `description_parameters`); skip or recurse-and-format
object-valued entries (never `String()` an object); resolve `@`-prefixed
string values through the scripted-variables map (including per-file local
`@vars` captured during tech-file parsing — `parseClausewitzFile` already
returns them as root-level `@`-keys, they just need to be collected per file
and merged for lookup), and count any still-unresolved value in
`unresolvedGrantLocKeys`.

### CR-04: Placeholder icon fallback writes one filename but references another — dangling `icon` refs, masked by the test suite

**File:** `pipeline/src/assemble.ts:101-108` (mask: `pipeline/test/corpus.test.ts:96-98`)
**Issue:** When no icon source resolves, the code copies the placeholder to
`webpOutPath` (= `data/v{ver}/icons/{key}.webp`) but sets
`iconRef = "placeholder-icon.webp"`:
```ts
writePlaceholderIcon(PLACEHOLDER_ICON_PATH, webpOutPath); // writes {key}.webp
iconRef = PLACEHOLDER_ICON_NAME;                          // references placeholder-icon.webp
```
`placeholder-icon.webp` is never written into the icons output dir, so the
shipped `icon` field points at a file that does not exist under
`data/v{version}/icons/` — violating SCHEMA.md's contract ("the emitted
`.webp` filename under `data/v{version}/icons/`") and breaking every consumer
image load. The orphaned `{key}.webp` placeholder copy is written but never
referenced. Zero techs hit this path in the current corpus, but the first
future patch with a missing icon ships broken references — and
`corpus.test.ts:96-98` special-cases the `placeholder-` prefix to look in
`pipeline/assets/` instead of the output dir, so the D-18 coverage test will
still pass. Additionally, if `assets/placeholder-icon.webp` were missing,
`copyFileSync` throws and fails the build, violating D-13's "warn, never
fail".
**Fix:** Pick one consistent scheme — simplest: copy the placeholder once
into the icons dir and reference it:
```ts
// once, before the loop:
copyFileSync(PLACEHOLDER_ICON_PATH, join(iconsOutDir, PLACEHOLDER_ICON_NAME));
// in the fallback branch (no per-key copy):
iconRef = PLACEHOLDER_ICON_NAME;
```
Then remove the `placeholder-` special case from corpus.test.ts Test 4 so the
test checks the real contract.

## Warnings

### WR-01: `convertDdsToWebp` failures are not caught in assemble — violates the module's own documented D-13 contract

**File:** `pipeline/src/assemble.ts:103` (contract: `pipeline/src/icons/convert.ts:39-42`)
**Issue:** convert.ts's docstring states "the caller (assemble.ts, per D-13)
is responsible for catching a failure here and falling back to the shipped
placeholder rather than failing the whole build." assemble.ts calls
`await convertDdsToWebp(...)` with no try/catch — one corrupt/unreadable DDS
(or a transient magick failure) aborts the entire build instead of degrading
to the placeholder. Resolution failures (missing file) are handled; conversion
failures are not. Same applies to the swap-icon conversions at lines 111-115.
**Fix:**
```ts
if (iconSource.base) {
  try {
    await convertDdsToWebp(iconSource.base, pngTempPath, webpOutPath);
    iconRef = `${key}.webp`;
  } catch (err) {
    console.warn(`[assemble] conversion failed for "${key}" (${err}) — using placeholder`);
    iconRef = usePlaceholder(); // shared fallback path from CR-04's fix
  }
}
```

### WR-02: Validation report asserts constants instead of measuring — multiple D-17 metrics are vacuous or provably false

**File:** `pipeline/src/assemble.ts:66,171-176`; `pipeline/src/report.ts:85-87,99-104`
**Issue:** Four report metrics cannot detect what they claim to detect:
1. `unresolvedVariableCount: 0` and `danglingPrerequisiteCount: 0` are
   hardcoded literals (assemble.ts:173-174). CR-03 proves unresolved `@vars`
   DO ship in grants text, so the printed "Unresolved @scripted_variable
   references: 0" is false for the actual artifact.
2. `totalTechKeysFound = extractedTechs.length` (assemble.ts:66) is the
   **already-filtered** extraction count, not "total tech_* keys found before
   filtering" as report.ts:30 documents. `techKeyCountMatches` can therefore
   only ever catch duplicate-key Record collisions, not the technology_swap
   leakage it claims to guard (report.ts:8).
3. `missingIconCount` counts `!tech.icon` (report.ts:87), but after CR-04's
   fallback `icon` is always a truthy string — the count is permanently 0
   even when every tech uses the placeholder. Count
   `icon === "placeholder-icon.webp"` instead.
4. `missingNameCount` is dead: the strict-fail throw at assemble.ts:130 makes
   a snapshot with missing names unreachable.
**Fix:** Measure, don't assert: count raw `tech_*` keys during
`extractAllTechs` before filtering and pass that through; count
placeholder-icon techs during assembly; have `resolveValue`/unlocks return
unresolved-variable tallies that assemble aggregates into the report.

### WR-03: Tech keys and swap names from game files flow into output file paths unsanitized (path-traversal defense-in-depth)

**File:** `pipeline/src/assemble.ts:99,102,112-113`
**Issue:** `join(iconsOutDir, `${key}.webp`)` and
`join(iconsOutDir, `${swap.name}.webp`)` build write paths from strings
parsed out of game files. `TECH_KEY_PATTERN` (`/^tech_/`) does not constrain
the rest of the key — a quoted Clausewitz key like `"tech_..\..\x"` in a
modded/hostile game root (gameRoot is user-configurable, threat T-01-01)
would escape `data/v{ver}/icons/` and write `.webp`/`.tmp.png` content to an
arbitrary location. The plans explicitly flagged path traversal from the
configurable install path; the mitigation stops at the execFileSync boundary
and never validates the path segments themselves.
**Fix:** Validate identifiers before using them in paths:
```ts
const SAFE_NAME = /^[a-zA-Z0-9_\-@.]+$/;
if (!SAFE_NAME.test(key)) throw new Error(`unsafe tech key for output path: "${key}"`);
// same check for swap.name before building swapWebpPath/swapPngTempPath
```

### WR-04: Array-form `host_has_dlc` (duplicate keys) is silently ignored by the DLC classifier

**File:** `pipeline/src/dlc/dlc-classifier.ts:72-89`
**Issue:** `findHostHasDlc` only matches `typeof block.host_has_dlc ===
"string"`. If a trigger block ever contains two `host_has_dlc` entries (e.g.
`OR = { host_has_dlc = "A" host_has_dlc = "B" }` — a natural way to gate a
tech on either of two DLCs), jomini auto-arrays them to `["A","B"]`, the
string check fails, and the recursion skips string array entries — result:
the override is missed and the tech silently misclassifies. This is the exact
duplicate-key arity pattern confirmed live in CR-02; no current corpus case
exists (verified: all 11 `host_has_dlc` occurrences are singletons), but the
failure is silent when it arrives.
**Fix:**
```ts
const hhd = block.host_has_dlc;
if (typeof hhd === "string") return hhd;
if (Array.isArray(hhd)) {
  const first = hhd.find((v): v is string => typeof v === "string");
  if (first) return first;
}
```

### WR-05: `filenameStem` only strips zero-prefixes — docstring says "numeric prefix"; non-`00_` DLC files misclassify silently as base game

**File:** `pipeline/src/dlc/dlc-classifier.ts:41-44`
**Issue:** The docstring says "Strips the leading numeric prefix (00_/000_)",
but `/^0+_?/` matches only zeros. A future `10_paragon_tech.txt` or
`05_astral_tech.txt` keeps its numeric token (`"10"`/`"5"`), which will never
be a subset of any DLC display-name token set, so `classifyByFilename`
returns null and the tech silently ships as base game — a silent `dlc`-field
data error on the project whose #1 constraint is data accuracy. All current
corpus files are `00_`/`000_`, so this is latent.
**Fix:**
```ts
return sourceFilename.replace(/\.txt$/i, "").replace(/^\d+_?/, "");
```

### WR-06: `parseClausewitzFile` does not strip a UTF-8 BOM — a future BOM+content file silently loses its first tech

**File:** `pipeline/src/parser/clausewitz.ts:38-41`
**Issue:** The raw bytes are decoded as latin1 and wrapped without stripping
a BOM. The UTF-8 BOM bytes (EF BB BF) decode under latin1 to the three
characters `ï»¿` (rendered "ï»¿"), which fuse with the file's
first root token — the first tech key becomes `ï»¿tech_x`, fails
`TECH_KEY_PATTERN`, and is **silently dropped** (compare loc-scanner.ts:48,
which does strip the BOM — the two parsers are inconsistent). Today the only
BOM'd tech file is the 3-byte BOM-only `00_repeatable.txt` (verified), so the
wrap workaround holds, but the first future patch that saves a tech file as
UTF-8-with-BOM loses a tech with no error, and WR-02's vacuous count-match
check won't catch it.
**Fix:**
```ts
let text = buf.toString("latin1");
// UTF-8 BOM bytes decoded as latin1:
if (text.startsWith("ï»¿")) text = text.slice(3);
// Defensive: a real U+FEFF if the input was already unicode-decoded:
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
```

### WR-07: Swap-icon writes collide with real tech keys' outputs — last-writer-wins, currently benign only by luck

**File:** `pipeline/src/assemble.ts:111-115`
**Issue:** Swap icons are written to `{swap.name}.webp` in the same output
dir as per-tech icons keyed `{key}.webp`. Verified against the corpus: 28
swap names ARE real tech keys (e.g. `tech_basic_science_lab_3`,
`tech_space_mining_1..5`, `tech_hyper_drive_3`). Each such file is written
twice per run (redundant conversions), and if any colliding tech ever gains
an `icon =` override (12 techs use overrides today; currently none collide),
the two writes would have **different content** with iteration-order-dependent
last-writer-wins — the wrong icon for a real tech, silently. Also note the
swap `.webp` files are emitted but nothing in `tech.json` references them, so
consumers cannot discover them (SCHEMA.md never mentions them).
**Fix:** Skip the swap conversion when `swap.name` is an extracted tech key
(its own pass will produce the file), or detect content-source divergence and
fail loud; document the swap-icon emission contract in SCHEMA.md.

### WR-08: Extractor silently defaults `area` to "physics" and `tier` to 0 on malformed data — contradicts the pipeline's own fail-loud policy

**File:** `pipeline/src/parser/tech-extractor.ts:191,195`
**Issue:** A tech with a missing/misspelled `area` is silently classified as
physics; a missing `tier` becomes 0. Both are silent data corruption of
exactly the kind D-16 elsewhere treats as strict-fail (unparseable file,
unresolved variable, missing name all throw). A future patch introducing a
new area value (or a typo'd file) ships misclassified techs with no signal —
worse than failing the build, per the project's data-accuracy constraint.
**Fix:**
```ts
if (typeof raw.area !== "string" || !VALID_AREAS.has(raw.area)) {
  throw new Error(`extractTech: tech "${key}" has missing/invalid area ${JSON.stringify(raw.area)}`);
}
if (typeof raw.tier !== "number") {
  throw new Error(`extractTech: tech "${key}" has missing/invalid tier`);
}
```

## Info

### IN-01: `gateway` token ships verbatim with no localisation attempt and no unresolved count

**File:** `pipeline/src/unlocks.ts:121-123`
**Issue:** SCHEMA.md says every grant token is "resolved to a human-readable
display string where a real localisation entry exists"; the gateway token
(e.g. `"biological"`, confirmed shipped raw for tech_gene_tailoring) is
pushed without a `locMap` lookup and never counted in
`unresolvedGrantLocKeys`.
**Fix:** Run gateway through `resolveOrVerbatim` (consider trying
`gateway_${token}` first) and count fallbacks.

### IN-02: Misleading comment — numeric coercion cannot resolve chained `@a = @b` variable references

**File:** `pipeline/src/parser/scripted-variables.ts:69-74`
**Issue:** The comment claims the looked-up value "might itself be … another
reference; try one more numeric coercion before failing" — `Number("@other")`
is NaN, so a chained reference always throws. Fail-loud is fine; the comment
promises behavior the code doesn't have.
**Fix:** Either implement one level of chained lookup or correct the comment.

### IN-03: latin1 decode + `encoding: "windows1252"` on an already-decoded string mis-maps 0x80–0x9F characters

**File:** `pipeline/src/parser/clausewitz.ts:39-41`
**Issue:** Bytes are decoded with latin1 (ISO-8859-1), then the
windows1252 option is passed to `parseText` for a string input (where it has
no effect). Windows-1252 characters in that range (curly quotes, §, em-dash)
decode to C1 control chars. Harmless for keys/numbers; wrong for any string
content extracted from script files.
**Fix:** Decode via `new TextDecoder("windows-1252").decode(buf)` or pass the
raw Buffer to jomini with the encoding option.

### IN-04: `scanAllLocalisation` is non-recursive despite the "scans EVERY .yml file" docstring

**File:** `pipeline/src/localisation/loc-scanner.ts:42-47`
**Issue:** `readdirSync(locDir)` skips subdirectories; 99 `.yml` files under
`localisation/english/name_lists/` and `random_names/` (verified) are never
scanned. No tech keys live there today, but the module's stated contract
("never a hardcoded subset") is not what the code does.
**Fix:** Use `readdirSync(locDir, { recursive: true })` (Node 20+) or note the
one-level limitation in the docstring.

### IN-05: Test name lies — "throws when rawVersion is absent" actually tests a nonexistent path

**File:** `pipeline/test/skeleton.test.ts:75-77`
**Issue:** The test passes `"/nonexistent-path-xyz"`, which throws at the
`existsSync` guard — the `rawVersion`-absent branch (detect.ts:22-26) is
never exercised by any test.
**Fix:** Add a fixture dir with a `launcher-settings.json` lacking
`rawVersion` (or point at a temp file) and assert that specific error.

### IN-06: Corpus test hardcodes the `v4.5.0` output path the pipeline itself auto-detects

**File:** `pipeline/test/corpus.test.ts:28-29`
**Issue:** `OUT_PATH`/`ICONS_DIR` pin `v4.5.0` while `runAssemble` derives the
version from the install. The next game patch breaks the suite with a
confusing missing-file error rather than a version-drift message.
**Fix:** Derive the expected dir via `detectGameVersion(resolveConfig([]).gameRoot)`.

### IN-07: `.gitignore` does not exclude the `scratch-debug/` working directory

**File:** `pipeline/.gitignore:1-4`
**Issue:** `pipeline/scratch-debug/` exists in the working tree and is not
ignored (only `node_modules/`, `dist/`, `data/`, `*.log` are) — debug scratch
files will be committed with the phase.
**Fix:** Add `scratch-debug/` (or delete the directory before commit).

### IN-08: Duplicate root tech keys across files would silently last-write-win and duplicate `leadsTo` entries

**File:** `pipeline/src/parser/tech-extractor.ts:278-281`; `pipeline/src/graph/build-dag.ts:92-96`
**Issue:** If a tech key appears in two files (Paradox override pattern),
`extractAllTechs` yields both records; `assemble.ts:117` keeps the last
silently, and `build-dag` pushes reverse edges once per record so `leadsTo`
can contain duplicates. Verified none exist in the current 678-key corpus;
the report's count mismatch would print `match=false` but not fail.
**Fix:** Detect and fail loud (or dedupe explicitly with a warn) when a key
repeats across files.

### IN-09: Icons are written before the missing-name strict-fail — failed builds leave partial versioned output

**File:** `pipeline/src/assemble.ts:80-136`
**Issue:** All icon conversion (the expensive step) happens inside the loop,
but the missing-name throw fires after it. A failing run leaves
`data/v{ver}/icons/` fully populated with no `tech.json` — "throw, write
nothing" holds for the snapshot only, and the wasted conversion work repeats
on every retry.
**Fix:** Resolve names (and collect missing) before the icon-conversion loop,
throwing before any output is written.

### IN-10: `.default()` on schema fields weakens the pre-write validation gate

**File:** `pipeline/src/schema/tech-snapshot.ts:41,60,63,68,70`
**Issue:** `category`, `prerequisites`, `dlc`, `description`, and `icon` carry
`.default(...)`, so a malformed tech missing `prerequisites` entirely passes
the D-16 gate and is silently patched. For a schema whose documented job is
to be the hard boundary that "gates every write", required-with-explicit-value
is stricter and matches SCHEMA.md's nullability table.
**Fix:** Drop `.default()` on pipeline-side validation (keep defaults, if
desired, in a separate lenient schema for Phase-2 fixtures).

---

_Reviewed: 2026-07-08T00:59:04Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
