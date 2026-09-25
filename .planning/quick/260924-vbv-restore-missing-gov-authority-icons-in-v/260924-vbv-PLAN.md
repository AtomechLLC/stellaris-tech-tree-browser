---
phase: quick-260924-vbv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - pipeline/src/icons/gov-icons.ts
  - pipeline/test/gov-icons.test.ts
  - pipeline/src/assemble.ts
  - pipeline/data/v4.5.1/icons/
autonomous: true
requirements: [DATA-04, DATA-05]

must_haves:
  truths:
    - "pipeline/data/v4.5.1/icons/ contains exactly the same 1373 filenames as pipeline/data/v4.5.0/icons/ (0 missing, 0 extra), and every file is byte-identical to its v4.5.0 counterpart"
    - "The 71 `_auth_*` authority-swap icons come from `advanced_authority_swap` sub-blocks nested inside top-level authority defs, in both the repeated-key (array) form and the single-object form"
    - "The 20 `_civic_*` and 12 `_origin_*` legacy-alias icons, whose defs v4.5.1 deleted, come from the conventional art that is still shipped on disk. The origins art dir maps `origins_<rest>.dds` to id `origin_<rest>`"
    - "Size-variant art files (stems matching `_<N>x<N>`, e.g. `auth_*_35x35.dds`) never become icon ids"
    - "An `icon =` path declared in a def still wins over the conventional same-named file for that id (v4.5.0 behavior is preserved)"
    - "`placeholder-icon.webp` is emitted into every build's icons dir, even when no tech icon falls back to it"
    - "The v4.5.1 tech.json is unchanged apart from meta.generatedAt. pipeline/data/v4.5.0 and pipeline/data/v4.4.6 are untouched"
    - "The pipeline suite (68 existing tests plus the new gov-icons tests) and the app suite (tsc clean, 199 passed / 7 skipped baseline) both pass"
  artifacts:
    - path: "pipeline/src/icons/gov-icons.ts"
      provides: "resolveGovIconSources(gameRoot): the id-to-DDS-path resolver for civic/origin/authority icons (def pass + swap sub-blocks + legacy conventional-art scan)"
      exports: ["resolveGovIconSources"]
    - path: "pipeline/test/gov-icons.test.ts"
      provides: "Fixture-tree unit tests plus a version-agnostic real-install regression guard"
      contains: "advanced_authority_swap"
    - path: "pipeline/src/assemble.ts"
      provides: "Gov-icon conversion loop driven by resolveGovIconSources; placeholder emitted unconditionally"
      contains: "resolveGovIconSources"
    - path: "pipeline/data/v4.5.1/icons/_auth_bio_corporate_cloning.webp"
      provides: "Representative restored authority-swap icon"
    - path: "pipeline/data/v4.5.1/icons/_origin_clones.webp"
      provides: "Representative restored legacy-origin icon (from origins/origins_clones.dds)"
    - path: "pipeline/data/v4.5.1/icons/placeholder-icon.webp"
      provides: "Uniform snapshot shape (placeholder always present)"
  key_links:
    - from: "pipeline/src/assemble.ts"
      to: "pipeline/src/icons/gov-icons.ts"
      via: "await resolveGovIconSources(gameRoot), then convertDdsToWebp for each entry to _<id>.webp"
      pattern: "resolveGovIconSources\\(gameRoot\\)"
    - from: "pipeline/src/icons/gov-icons.ts"
      to: "common/governments/authorities/*.txt"
      via: "advanced_authority_swap sub-blocks read with normalizeToArray (handles array and single-object forms)"
      pattern: "advanced_authority_swap"
    - from: "app/src/components/EmpirePanel.tsx + EmpireManagerPanel.tsx"
      to: "data/v4.5.1/icons/_<id>.webp"
      via: "`${iconBase}/_${id}.webp` (existing consumer, unchanged)"
      pattern: "_\\$\\{(id|authority)\\}\\.webp"
---

<objective>
Restore the 104 icon files that are missing from the committed `pipeline/data/v4.5.1/icons/` snapshot (1269 files, where v4.5.0 has 1373). To do that, adapt the civic/origin/authority icon extraction to v4.5.1's restructured government defs, then regenerate and commit the icons.

Purpose: the app's Saved Empire / Empire Manager views load `_<id>.webp` for each civic, origin, and authority id. When the file is missing, the icon is blank. v4.5.1 is now the default snapshot, so every user sees these gaps. Pre-4.5.1 save files still contain the deleted legacy ids, and the Saved Empire loader still accepts those saves, so their icons are still needed.

Output:
- A new pure resolver module, `pipeline/src/icons/gov-icons.ts`, with unit tests.
- `assemble.ts` rewired to use the resolver and to always emit the placeholder.
- A regenerated `pipeline/data/v4.5.1/icons/` that matches v4.5.0 exactly: 1373 files, byte-identical.

Root cause (verified against the live v4.5.1 install; do not re-derive). The 104 missing files break down as follows:
1. 71 `_auth_*` files. These ids moved out of top-level keys and into nested `advanced_authority_swap = { name = "auth_..." ... }` sub-blocks inside the 8 remaining authority defs in `common/governments/authorities/00_authorities.txt`. The current code only reads top-level keys. Swap blocks never declare `icon =`. All 71 ids have conventional art at `gfx/interface/icons/governments/authorities/<name>.dds`.
2. 20 `_civic_*` and 12 `_origin_*` files. v4.5.1 deleted these legacy alias defs outright, but their art still ships. The civics are at `gfx/interface/icons/governments/civics/<id>.dds`. The origins are at `gfx/interface/icons/origins/origins_<rest>.dds` for id `origin_<rest>`. Note the plural `origins_` prefix, and the typo name `origins_one_the_shoulders_of_giant.dds`.
3. `placeholder-icon.webp`. It is copied lazily, only when a tech icon conversion fails. The v4.5.1 build had no failures, so it was never emitted.

Pre-measured facts the plan relies on:
- A trial conversion of the conventional art for all 103 gov ids through the same magick+sharp path gave webp files byte-identical to the committed v4.5.0 files (103/103).
- The 1269 files shared between the two snapshots are already byte-identical. Conversion is deterministic.
- The 3 legacy art scans below produce no ids outside the v4.5.0 set, once size-variant stems (`_\d+x\d+`) are excluded.
- The target result is therefore "v4.5.1 icons dir == v4.5.0 icons dir, filename-for-filename and byte-for-byte".

STOP policy (applies to every task). Stop and report the exact output, leaving the failing step uncommitted, on any of:
- a test failure;
- parity showing any missing, extra, or byte-different file, or a count other than 1373;
- any tech.json change beyond `meta.generatedAt`;
- any `[assemble]` warning line during the build (especially `gov icon conversion failed`);
- any modification to `pipeline/data/v4.5.0` or `pipeline/data/v4.4.6`.

Do not hand-edit data files to force parity. Do not update STATE.md or ROADMAP.md; the orchestrator owns them.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@pipeline/src/assemble.ts
@.planning/quick/260924-qfo-regenerate-tech-tree-data-snapshot-for-s/260924-qfo-SUMMARY.md

Environment notes (this is a git worktree):
- `pipeline/node_modules` and `app/node_modules` do NOT exist yet. Run `npm ci` in `pipeline/` (Task 1) and in `app/` (Task 3). Both lockfiles are committed. No new packages are added.
- ImageMagick `magick` is on PATH (verified).
- The game install is at the default `Z:\SteamLibrary\steamapps\common\Stellaris` (v4.5.1). `resolveConfig([])` finds it with no env var.
- `npm run build:data` and `npm test` MUST run from `pipeline/`, not the repo root. They write to `pipeline/data/<detected version>/`.
- A full build converts about 1400 icons, and the pipeline suite takes about 140s (it runs two full builds). Pass a Bash timeout of 600000 for both.

<interfaces>
<!-- Extracted from the codebase. Use these directly; no exploration needed. -->

From pipeline/src/parser/clausewitz.ts:
```typescript
// Wraps the file in a synthetic root, parses with jomini (windows1252), strips BOM.
// Repeated keys inside a block (e.g. several advanced_authority_swap = {...}) come back as an ARRAY;
// a single occurrence comes back as a plain object. `yes`/`no` parse to booleans.
export async function parseClausewitzFile(filePath: string): Promise<Record<string, unknown>>;
export function normalizeToArray<T>(value: T | T[] | undefined): T[];
```

From pipeline/src/icons/convert.ts:
```typescript
export const PLACEHOLDER_ICON_NAME = "placeholder-icon.webp";
// magick (DDS->PNG, execFileSync arg array) then sharp lossless WebP; removes the temp PNG; THROWS on failure.
export async function convertDdsToWebp(ddsPath: string, pngTempPath: string, webpOutPath: string): Promise<void>;
```

From pipeline/src/assemble.ts (current state; the lines this plan changes):
```typescript
// line 32:  import { writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
// line 38:  import { parseClausewitzFile } from "./parser/clausewitz.js";
// line 54:  const PLACEHOLDER_ICON_PATH = join(process.cwd(), "assets", PLACEHOLDER_ICON_NAME);
// line 62:  const SAFE_NAME = /^[a-zA-Z0-9_\-@.]+$/;   // T-01-01 path-segment guard
// lines 116-133: lazy `placeholderEmitted` flag + `usePlaceholder()` closure (copyFileSync on first call)
//                called at lines 186 and 189 (tech icon conversion failure / no source)
// lines 339-403: gov-icon DEF pass — isPlain helper, govDefSources [{defDir, idPattern, fallbackDir}] for
//                civics (/^(civic_|origin_)/, gfx/interface/icons/governments/civics) then authorities
//                (/^auth_/, gfx/interface/icons/governments/authorities), govDone Set, per-file
//                parseClausewitzFile, Object.entries(raw) TOP-LEVEL keys only,
//                block = Array.isArray(val) ? val.find(isPlain) : val,
//                declared `icon` (string ending .dds) wins else conventional <id>.dds, existsSync skip,
//                convertDdsToWebp -> _<id>.webp, warn-and-skip on failure
// lines 404-429: ap_/ethic_ directory scans (govScanDirs) — KEEP UNCHANGED
// existsSync is used ONLY at line 390 and parseClausewitzFile ONLY at line 376 (both leave assemble.ts after this plan).
```

v4.5.1 authority swap shape (common/governments/authorities/00_authorities.txt, ~line 85):
```
auth_democratic = {
	...
	advanced_authority_swap	= {
		name = "auth_cyber_creed_democratic"
		description = "auth_cyber_creed_democratic_desc"
		inherit_icon = no
		inherit_effects = no
		trigger = { ... }
	}
	advanced_authority_swap	= { name = "auth_cyber_democratic_individualist" ... }
}
```
The game's own header comment says the swap `name` "will also be used to attempt and find an icon from interface/icons/governments/authorities/". This is why resolution is existence-driven (conventional `<name>.dds` if present) and does not consult `inherit_icon`. Civics use `swap_type = { name = ... }` sub-blocks. None of them declares an icon or has conventional art today; they are included only so the code stays correct in future versions.

App consumers (unchanged): app/src/components/EmpirePanel.tsx:335 and EmpireManagerPanel.tsx:44 load `${iconBase}/_${id}.webp`. The app never references placeholder-icon.webp directly.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build resolveGovIconSources (def pass + swap sub-blocks + legacy art scan) with fixture tests</name>
  <files>pipeline/src/icons/gov-icons.ts, pipeline/test/gov-icons.test.ts</files>
  <read_first>pipeline/src/assemble.ts (lines 339-429 only), pipeline/src/parser/clausewitz.ts, pipeline/test/icons.test.ts (lines 1-60, for test style and the resolveConfig([]) real-install pattern)</read_first>
  <behavior>
    Fixture tests use a temp gameRoot built with mkdtempSync under os.tmpdir() and removed in afterAll with rmSync recursive+force. Every `.dds` is a zero-byte file, because resolution only checks existence and never converts. Compare results as a plain object: id mapped to the path relative to the fixture root, with forward slashes. Use exact toEqual so that any extra id also fails.
    Fixture def files:
    - common/governments/civics/00_test_civics.txt defines 5 civic defs:
      - civic_declared, with icon = "gfx/interface/icons/governments/civics/civic_shared_art.dds";
      - civic_plain (no icon);
      - civic_noart (no icon, no art);
      - civic_with_swap, containing swap_type = { name = "civic_swapped" };
      - origin_def, with icon = "gfx/interface/icons/origins/origins_def_art.dds".
    - common/governments/authorities/00_test_authorities.txt defines 3 authority defs:
      - auth_parent, with TWO advanced_authority_swap blocks: name "auth_swap_a" (inherit_icon = no) and name "auth_swap_inherit" (inherit_icon = yes);
      - auth_single, with ONE advanced_authority_swap block, name "auth_swap_single";
      - auth_unsafe, with ONE advanced_authority_swap block, name "auth_bad/../name".
    Fixture art files:
    - gfx/interface/icons/governments/civics/: civic_shared_art, civic_declared, civic_plain, civic_swapped, civic_legacy, origin_in_civics, civic_legacy_35x35, not_a_civic.
    - gfx/interface/icons/governments/authorities/: auth_parent, auth_swap_a, auth_swap_single, auth_legacy, auth_legacy_35x35.
    - gfx/interface/icons/origins/: origins_def_art, origins_legacy.
    - Test 1 (exact map): the result equals exactly these 13 entries.
      - Def pass: civic_declared → civics/civic_shared_art.dds (declared wins, even though civic_declared.dds exists); civic_plain → civics/civic_plain.dds; origin_def → origins/origins_def_art.dds.
      - Swap sub-blocks: civic_swapped → civics/civic_swapped.dds; auth_parent → authorities/auth_parent.dds; auth_swap_a → authorities/auth_swap_a.dds (array form); auth_swap_single → authorities/auth_swap_single.dds (single-object form).
      - Legacy scan: civic_shared_art, civic_legacy, and origin_in_civics → their own civics files; auth_legacy → authorities/auth_legacy.dds; origin_def_art → origins/origins_def_art.dds; origin_legacy → origins/origins_legacy.dds. Each path is prefixed with gfx/interface/icons/ (governments/ for civics and authorities).
    - Test 2 (exclusions): none of these keys is present: civic_noart, auth_swap_inherit (inherit swap with no art), auth_unsafe (no art), "auth_bad/../name" (fails SAFE_NAME and is skipped, not thrown), civic_legacy_35x35 and auth_legacy_35x35 (size variants), not_a_civic (wrong prefix).
    - Test 3 (precedence): civic_declared maps to civic_shared_art.dds, NOT civic_declared.dds. The legacy scan must never overwrite an id resolved in the def pass.
    - Test 4 (real install, version-agnostic, 60s timeout): run with gameRoot from resolveConfig([]). The map is non-empty. Every value existsSync. No key matches /_\d+x\d+$/. Every key matches /^(civic_|origin_|auth_)/ and /^[a-zA-Z0-9_\-@.]+$/. Regression guard: parse every .txt in common/governments/authorities with parseClausewitzFile, and collect every advanced_authority_swap name (via normalizeToArray) whose gfx/interface/icons/governments/authorities/NAME.dds exists. Every such name must be a key in the map. Do NOT hard-code specific ids, so this test stays valid across game patches.
  </behavior>
  <action>
    First run `npm ci` in pipeline/ (node_modules is absent in this worktree; the lockfile is committed and no new deps are added).

    RED: write pipeline/test/gov-icons.test.ts per the behavior block, using vitest, node:fs (mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync), node:os tmpdir, node:path (join, relative, sep), resolveConfig from ../src/config.js, and parseClausewitzFile and normalizeToArray from ../src/parser/clausewitz.js. Import resolveGovIconSources from ../src/icons/gov-icons.js. Run it and confirm it fails because the module does not exist. Commit as `test(pipeline): add failing gov-icon resolver tests for v4.5.1 swap/legacy ids`.

    GREEN: create pipeline/src/icons/gov-icons.ts exporting `async function resolveGovIconSources(gameRoot: string): Promise<Map<string, string>>`. It maps each id to an absolute .dds path, built with join(gameRoot, ...relPath.split("/")) like assemble.ts does. Map insertion order: the def pass first (civics def dir, then authorities def dir, files in readdirSync order, same as today), then the legacy scans. Structure:
    - Module constants:
      - a local SAFE_NAME identical to assemble.ts's (/^[a-zA-Z0-9_\-@.]+$/), with a comment that it mirrors the T-01-01 path-segment guard;
      - SIZE_VARIANT = /_\d+x\d+$/;
      - GOV_DEF_SOURCES, an array of { defDir, idPattern, fallbackDir, swapKeys }: civics = "common/governments/civics", /^(civic_|origin_)/, "gfx/interface/icons/governments/civics", ["swap_type"]; authorities = "common/governments/authorities", /^auth_/, "gfx/interface/icons/governments/authorities", ["advanced_authority_swap"];
      - LEGACY_ART_SCANS, an array of { artDir, match: RegExp, toId: (m) => string }: civics art dir with /^((?:civic_|origin_).+)\.dds$/i and id = m[1]; authorities art dir with /^(auth_.+)\.dds$/i and id = m[1]; "gfx/interface/icons/origins" with /^origins_(.+)\.dds$/i and id = `origin_${m[1]}`.
    - A private `consider(id, block, source)` helper, shared by top-level defs and swap blocks so the logic stays in one place:
      - skip unless source.idPattern matches, SAFE_NAME matches, and the id is not already in the map;
      - a declared `block.icon` (string ending .dds, case-insensitive) wins; otherwise use the conventional fallbackDir/<id>.dds;
      - add to the map only if existsSync(path).
    - Def pass: port assemble.ts lines 363-403 faithfully. Keep the readdirSync .txt filter, the per-file parse try/catch that warns and continues, and block = Array.isArray(val) ? val.find(isPlain) : val.
      - Call consider on the top-level id.
      - Then, for every swapKey, iterate normalizeToArray(block[swapKey]), keep only plain objects whose `name` is a string, and call consider(swap.name, swap, source).
      - Iterate swaps for every plain top-level block, even when the parent id was skipped, had no art, or was already mapped.
    - Legacy scan (runs AFTER the whole def pass): for each LEGACY_ART_SCANS entry, readdirSync the art dir inside a try/catch that warns and continues.
      - For each matching file, derive the id and skip if the id's stem matches SIZE_VARIANT (strip .dds and test the stem; for origins, test the derived id), fails SAFE_NAME, or is already in the map.
      - Otherwise map the id to join(artDir, file).
    - Warnings use the prefix `[gov-icons]`. The function never throws for per-file problems.
    - Write a top-of-file doc comment giving the reasons:
      - v4.5.1 nested the authority swap ids (auth_bio_/cyber_/shroud_/synth_ etc.) in advanced_authority_swap sub-blocks;
      - v4.5.1 deleted legacy alias civic/origin defs, but their ids persist in pre-4.5.1 saves that the Saved Empire loader accepts, and their art still ships;
      - the origins art dir uses a plural `origins_` filename prefix;
      - `_35x35` files are small-size art duplicates, not ids;
      - resolution is existence-driven, matching the game's own swap-icon lookup comment, so `inherit_icon = yes` swaps with no art are naturally skipped.

    Run the test file until green. Commit as `feat(pipeline): resolve gov icons from authority swap sub-blocks and legacy conventional art`.
  </action>
  <verify>
    <automated>cd pipeline && npx vitest run test/gov-icons.test.ts</automated>
  </verify>
  <done>gov-icons.test.ts passes all 4 tests: the exact 13-entry fixture map, the exclusions, declared-icon precedence, and the real-install regression guard. The RED commit and the GREEN commit both exist. assemble.ts is not touched yet.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the resolver into assemble.ts, always emit the placeholder, regenerate v4.5.1 icons and prove byte parity with v4.5.0</name>
  <files>pipeline/src/assemble.ts, pipeline/data/v4.5.1/icons/</files>
  <read_first>pipeline/src/assemble.ts (lines 110-135 and 339-430 only; already in context if the executor read it in Task 1)</read_first>
  <action>
    Edit pipeline/src/assemble.ts:
    (a) Import resolveGovIconSources from "./icons/gov-icons.js". Replace the gov-icon def pass, which runs from the `// Civic / origin / authority / ascension-perk icons` comment through the closing brace of the govDefSources loop (current lines ~339-403: comment, isPlain, govDefSources, govDone, loop). The replacement is `const govIconSources = await resolveGovIconSources(gameRoot);` followed by a loop over its entries.
       - Each entry calls convertDdsToWebp(srcPath, join(iconsOutDir, `_${id}.tmp.png`), join(iconsOutDir, `_${id}.webp`)) inside try/catch.
       - On failure it warns with the existing message format `[assemble] gov icon conversion failed for "${id}" (${err}) — skipping`.
       - Keep a shortened version of the explanatory comment: `_<id>.webp` naming for the Saved Empire settings window, declared-icon-wins, and the D-13 warn-and-skip rule. Point to gov-icons.ts for the v4.5.1 swap/legacy details.
       - Leave the ap_/ethic_ govScanDirs block exactly as it is.
       - Remove the now-unused `existsSync` from the node:fs import and the now-unused parseClausewitzFile import. Grep first to confirm there are no other uses.
    (b) Placeholder: replace the lazy `placeholderEmitted` flag and closure at lines ~116-133. Directly after mkdirSync(iconsOutDir), copy PLACEHOLDER_ICON_PATH to join(iconsOutDir, PLACEHOLDER_ICON_NAME) unconditionally, inside a try/catch that keeps the existing warn message. Keep `usePlaceholder` as a function that only returns PLACEHOLDER_ICON_NAME, so the two call sites at ~186/189 are unchanged. Update the D-13 comment to say the placeholder is emitted every build, so every snapshot's icons dir has the same shape and icon-count diffs between versions stay meaningful. The v4.5.1 build emitted no placeholder because no tech fell back to it, and this accounted for 1 of the 104 missing files. tech.json `icon` refs and report.ts's "Placeholder icon: N" count are unaffected, because both count tech references, not the file.
    (c) Typecheck: from pipeline/, run `npx tsc --noEmit`. There must be zero errors mentioning gov-icons.ts, assemble.ts, or gov-icons.test.ts. If there are pre-existing errors in other files, record them in the SUMMARY and do not fix them.
    (d) Regenerate from scratch. Delete pipeline/data/v4.5.1/icons entirely (every build reconverts every icon anyway, so this costs nothing extra). A from-scratch dir proves the fix produces the complete set without relying on stale files. Then, from pipeline/, run `npm run build:data` with timeout 600000 and capture the output. Any `[assemble]` warning line is a STOP.
    (e) Parity: run the verify command from the worktree root. It must report v4.5.0=1373, v4.5.1=1373, missing=0, extra=0, byteDiff=0.
    (f) Git gates, all run from the worktree root:
       - `git status --porcelain --untracked-files=all -- pipeline/data/v4.5.1/icons`: exactly 104 lines, all `??`. Count them with `grep -c '^??'`, and check that the non-`??` count is 0. These are the 71 `_auth_`, 20 `_civic_`, and 12 `_origin_` files plus placeholder-icon.webp.
       - `git diff --numstat -- pipeline/data/v4.5.1/tech.json` shows `1	1`, and the only changed line in `git diff -U0` is `"generatedAt"`.
       - Then restore tech.json with `git checkout -- pipeline/data/v4.5.1/tech.json`, so the data commit contains only additions.
       - `git status --porcelain -- pipeline/data/v4.5.0 pipeline/data/v4.4.6 pipeline/data/v4.5.1/diff.json` must be empty.
    (g) Commit ONLY the code as `fix(pipeline): extract v4.5.1 authority-swap and legacy civic/origin icons; always emit placeholder` (stage pipeline/src/assemble.ts only). Leave the regenerated icons uncommitted; Task 3 commits them after the full suites pass.
  </action>
  <verify>
    <automated>cd pipeline && npx tsc --noEmit 2>&1 | grep -cE "(gov-icons|assemble)(\.test)?\.ts" ; cd .. && node -e "const fs=require('fs'),c=require('crypto');const h=p=>c.createHash('sha1').update(fs.readFileSync(p)).digest('hex');const A='pipeline/data/v4.5.0/icons/',B='pipeline/data/v4.5.1/icons/';const a=fs.readdirSync(A),b=fs.readdirSync(B),sa=new Set(a),sb=new Set(b);const miss=a.filter(f=>!sb.has(f)),extra=b.filter(f=>!sa.has(f)),dif=a.filter(f=>sb.has(f)&&h(A+f)!==h(B+f));console.log('v4.5.0='+a.length,'v4.5.1='+b.length,'missing='+miss.length,'extra='+extra.length,'byteDiff='+dif.length,[...miss,...extra,...dif].slice(0,20).join(' '));process.exit(miss.length||extra.length||dif.length||a.length!==1373||b.length!==1373?1:0)"</automated>
  </verify>
  <done>
    - The tsc grep count is 0.
    - Parity prints `v4.5.0=1373 v4.5.1=1373 missing=0 extra=0 byteDiff=0` and exits 0.
    - The build printed no `[assemble]` warnings.
    - The git gates show exactly 104 untracked additions and no modified or deleted icons, and tech.json is restored to HEAD.
    - The assemble.ts fix is committed and the regenerated icons are still uncommitted.
  </done>
</task>

<task type="auto">
  <name>Task 3: Run the full pipeline and app suites, confirm the tree is clean, and commit the restored v4.5.1 icons</name>
  <files>pipeline/data/v4.5.1/icons/ (104 new files: _auth_* x71, _civic_* x20, _origin_* x12, placeholder-icon.webp)</files>
  <action>
    1. From pipeline/, run `npm test` with timeout 600000. Expected result: all 8 existing test files and 68 existing tests pass, plus the new gov-icons.test.ts (9 files, 72 tests). The corpus suite runs two full builds into data/v4.5.1, which rewrites tech.json's generatedAt and reconverts the icons to byte-identical output. Afterwards, restore tech.json with `git checkout -- pipeline/data/v4.5.1/tech.json`. Then re-run the Task 2 parity command; it must still print 1373/1373/0/0/0. That proves the test builds reproduce the restored set.
    2. From app/, run `npm ci` (node_modules is absent in this worktree). Then run `npx tsc --noEmit`, which must be clean. Then run `npm test`. Its pretest step copies pipeline/data into the gitignored app/public/data. The baseline is 199 passed / 7 skipped, and snapshots.test.ts still validates v4.4.6, v4.5.0, and v4.5.1 and checks that every tech icon exists on disk.
    3. Hygiene gates, from the worktree root:
       - `git status --porcelain -- app` is empty (app/public/data is gitignored);
       - `git status --porcelain -- pipeline/src pipeline/test pipeline/data/v4.5.0 pipeline/data/v4.4.6 pipeline/data/v4.5.1/tech.json pipeline/data/v4.5.1/diff.json` is empty;
       - the only pending changes are the 104 untracked files under pipeline/data/v4.5.1/icons.
    4. Stage `pipeline/data/v4.5.1/icons` and commit as `chore(pipeline): restore 104 missing gov/authority icons in v4.5.1 snapshot (1373 files, byte-parity with v4.5.0)`.
    5. Write the SUMMARY. Include:
       - the corrected breakdown: 71 auth swaps + 20 civics + 12 origins + placeholder. This supersedes 260924-qfo's "104 authority swaps" wording;
       - the parity line;
       - the test counts;
       - any pre-existing tsc errors recorded in Task 2;
       - a note that future icon-count diffs between snapshots are now stable, because the placeholder is always emitted.
  </action>
  <verify>
    <automated>cd pipeline && npm test && cd ../app && npx tsc --noEmit && npm test && cd .. && git status --porcelain -- app pipeline/src pipeline/test pipeline/data/v4.5.0 pipeline/data/v4.4.6 pipeline/data/v4.5.1/tech.json pipeline/data/v4.5.1/diff.json</automated>
  </verify>
  <done>
    - The pipeline suite is green (72 tests including the new gov-icons tests).
    - App tsc is clean and the app suite is green at the 199 passed / 7 skipped baseline.
    - Parity is still 1373/1373/0/0/0 after the test builds.
    - The restored icons are committed in one commit containing only the 104 file additions. Nothing else is dirty.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game files -> output paths | Ids parsed from `common/governments/**.txt` and filename stems scanned from `gfx/interface/icons/**` (under the user-configurable gameRoot) become path segments under `data/v{version}/icons/` |
| pipeline -> magick subprocess | Resolved .dds paths are passed to ImageMagick |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vbv-01 | Tampering / Elevation | gov-icons.ts consider() + legacy scans (swap `name`, scanned stems) | mitigate | Every id (top-level, swap `name`, derived `origin_<rest>`) must pass SAFE_NAME `/^[a-zA-Z0-9_\-@.]+$/` before it is added to the map. Unsafe ids are skipped, never used in a path. Covered by Test 2 (`auth_bad/../name` absent, no throw) |
| T-vbv-02 | Denial of Service | gov-icons.ts def/scan loops | mitigate | Per-file readdir/parse failures and per-id conversion failures warn and skip (D-13). A malformed def file cannot abort the build |
| T-vbv-03 | Tampering | convertDdsToWebp magick call | accept | Existing mitigation is unchanged: execFileSync with an argument array and no shell (T-04-01). This plan adds no new subprocess call shape |
| T-vbv-SC | Tampering | npm ci in worktree | accept | Installs only the existing committed lockfiles. No new packages, so no legitimacy audit is needed |
</threat_model>

<verification>
- `pipeline/data/v4.5.1/icons/` and `pipeline/data/v4.5.0/icons/` both contain 1373 files, with the same names and byte-identical content (the parity command exits 0).
- The fixture tests prove the swap array and single-object forms, the legacy civic/origin/authority scans, the origins_ to origin_ remap, size-variant exclusion, SAFE_NAME skipping, and that a declared icon takes precedence.
- The real-install regression guard proves that every v4.5.1 advanced_authority_swap name that has art is resolved, without pinning ids.
- The pipeline suite is green, app tsc is clean, and the app suite is green at baseline.
- The historical snapshots (v4.5.0, v4.4.6) and v4.5.1 tech.json/diff.json are unchanged.
</verification>

<success_criteria>
- 104 restored files committed (71 `_auth_*`, 20 `_civic_*`, 12 `_origin_*`, `placeholder-icon.webp`); v4.5.1 icon count 1269 -> 1373.
- Zero extra files and zero byte differences versus v4.5.0.
- assemble.ts gov-icon extraction is driven by `resolveGovIconSources` and handles v4.5.1's nested authority swaps and deleted legacy defs. The placeholder is emitted every build.
- 4 atomic commits: the RED test, the GREEN resolver, the assemble.ts fix, and the restored data.
</success_criteria>

<output>
Create `.planning/quick/260924-vbv-restore-missing-gov-authority-icons-in-v/260924-vbv-SUMMARY.md` when done
</output>
