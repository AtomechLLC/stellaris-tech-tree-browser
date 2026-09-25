---
phase: quick-260924-qfo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - pipeline/test/skeleton.test.ts
  - pipeline/test/corpus.test.ts
  - pipeline/data/v4.5.1/tech.json
  - pipeline/data/v4.5.1/diff.json
  - pipeline/data/v4.5.1/icons/
  - app/src/test/snapshots.test.ts
autonomous: true
requirements: [DATA-01, DATA-03, DATA-04, DATA-05]

must_haves:
  truths:
    - "pipeline/data/v4.5.1/tech.json exists with meta.gameVersion 'v4.5.1', meta.versionLabel 'Cygnus v4.5.1 (358e)', meta.checksum '358e', and it passed the pipeline's TechSnapshotSchema (assemble validates before writing)"
    - "Every v4.5.1 tech has a resolved non-empty name and a real icon file on disk; zero techs use placeholder-icon.webp (v4.4.6 and v4.5.0 both have 0)"
    - "The pipeline corpus suite checks the build it just made (data/{detected version}), not the committed v4.5.0 file, and its idempotency test passes for v4.5.1"
    - "pipeline/data/v4.5.1/diff.json records v4.5.0 -> v4.5.1 added/removed/changed techs, so the app's What's-new panel lights up for v4.5.1"
    - "app/public/data/versions.json has latest = v4.5.1, lists it first with label 'Cygnus v4.5.1 (358e)', and v4.5.0 and v4.4.6 stay selectable"
    - "Every shipped snapshot, including v4.5.1, parses with the app's own TechSnapshotSchema in the app test suite"
  artifacts:
    - path: "pipeline/data/v4.5.1/tech.json"
      provides: "v4.5.1 Cygnus (358e) tech snapshot"
      contains: "\"gameVersion\": \"v4.5.1\""
    - path: "pipeline/data/v4.5.1/diff.json"
      provides: "v4.5.0 -> v4.5.1 gameplay diff for the What's-new panel"
      contains: "\"toVersion\": \"v4.5.1\""
    - path: "pipeline/test/corpus.test.ts"
      provides: "Full-corpus suite targeting the detected install version"
      contains: "detectGameVersion"
    - path: "app/src/test/snapshots.test.ts"
      provides: "Manifest-driven app-schema validation of every shipped snapshot"
      contains: "TechSnapshotSchema"
  key_links:
    - from: "pipeline/test/corpus.test.ts"
      to: "pipeline/data/{detected version}/tech.json"
      via: "OUT_PATH/ICONS_DIR derived from detectGameVersion(resolveConfig([]).gameRoot)"
      pattern: "detectGameVersion\\(gameRoot\\)"
    - from: "app/scripts/copy-data.mjs"
      to: "app/public/data/versions.json"
      via: "numeric compareVersions picks newest pipeline/data/v* dir as latest (existing, unchanged)"
      pattern: "latest: versions\\[versions.length - 1\\]"
    - from: "app/src/test/snapshots.test.ts"
      to: "app/public/data/versions.json + each {dir}/tech.json"
      via: "readFileSync + TechSnapshotSchema.parse"
      pattern: "versions\\.json"
    - from: "app/src/components/WhatsNew.tsx"
      to: "data/v4.5.1/diff.json"
      via: "fetch(dataUrl(`${version}/diff.json`)) (existing, unchanged)"
      pattern: "diff\\.json"
---

<objective>
Regenerate the tech-tree data snapshot from the local Stellaris install, which is now at v4.5.1 "Cygnus" (358e). Commit it as `pipeline/data/v4.5.1/`, with a v4.5.0 -> v4.5.1 `diff.json`, and confirm the app lists it and makes it the default through the generated versions manifest.

Purpose: data accuracy is why this project exists (CLAUDE.md constraint), and DATA-05 promises that a version bump is cheap. This task is the first real use of that promise since the v4.5.0 snapshot was built. It also fixes two test pins that would otherwise give a false pass on this bump. `corpus.test.ts` hard-codes `data/v4.5.0`, so it would re-read the stale committed file instead of the new build. `skeleton.test.ts` hard-codes the install version.

Output: a committed `pipeline/data/v4.5.1/` snapshot (tech.json + diff.json + icons), pipeline tests that don't depend on the version, a new app test that schema-validates every shipped snapshot, and a v4.5.0 -> v4.5.1 diff summary in the SUMMARY.

STOP policy (applies to every task): if the 4.5.1 game files break the pipeline, stop and report the exact failure. Do not patch any schema, parser, or data by hand to get around it. That covers parse errors, a dangling prerequisite or cycle, missing localisation names, a pipeline or app Zod schema violation, or placeholder/missing icons. Schema changes are a separate decision for the user. Report the exact error text, the offending tech key(s) or Zod issue path(s), and the game file involved. Leave the working tree uncommitted for the failing step.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@pipeline/src/assemble.ts
@pipeline/src/diff.ts
@app/scripts/copy-data.mjs

<interfaces>
<!-- Extracted from the codebase. Use these directly; no exploration needed. -->

pipeline/src/config.ts:
- export function resolveConfig(argv: string[] = process.argv.slice(2)): { gameRoot: string }
  Test files call resolveConfig([]) to avoid vitest argv interference (see skeleton.test.ts line 9: `const { gameRoot } = resolveConfig([]);`).
  Default gameRoot: Z:\SteamLibrary\steamapps\common\Stellaris

pipeline/src/version/detect.ts:
- export function detectGameVersion(gameRoot: string): string   // returns launcher-settings.json rawVersion verbatim, e.g. "v4.5.1"
- export function detectVersionLabel(gameRoot: string): { label: string; checksum: string | null }  // e.g. "Cygnus v4.5.1 (358e)", "358e"

pipeline/src/assemble.ts:
- export async function runAssemble(): Promise<string>
  Writes join(process.cwd(), "data", gameVersion, "tech.json") plus icons/. MUST run with cwd = pipeline/.
  (The untracked repo-root `data/v4.5.0` is a stray from an earlier run with the wrong cwd. Never stage it.)
  Throws, and writes no tech.json, on: dangling prereq/cycle, a missing loc name, or a pipeline TechSnapshotSchema failure.
  Degrades to "placeholder-icon.webp" (with a console.warn) when an icon is missing or fails to convert.

pipeline/src/diff.ts (CLI via `npm run diff-data`):
- With no args it auto-picks the two numerically newest data/v* dirs (so v4.5.0 -> v4.5.1) and writes diff.json next to the newer tech.json.
- export function diffSnapshots(from, to): { fromVersion; toVersion; added: {key,name,tier,area}[]; removed: {key,name}[]; changed: {key,name,changes:{field,from,to}[]}[] }
- Compares only gameplay fields: tier, cost, weight, area, category[0], dlc, prerequisites.

pipeline/test/corpus.test.ts (current, lines 28-29, the pin to fix):
- const OUT_PATH = join(process.cwd(), "data", "v4.5.0", "tech.json");
- const ICONS_DIR = join(process.cwd(), "data", "v4.5.0", "icons");

pipeline/test/skeleton.test.ts (current, lines 70-73, the pin to fix):
- describe("version: detectGameVersion") -> it("returns v4.5.0 from the real install's launcher-settings.json", () => expect(detectGameVersion(gameRoot)).toBe("v4.5.0"))
- Lines 84 and 115 use gameVersion: "v4.5.0" inside hand-built schema FIXTURES. Those don't depend on the install, so leave them unchanged.

app/src/types/tech-snapshot.ts:
- export const TechSnapshotSchema  // Zod; meta: { gameVersion, versionLabel?, checksum?, generatedAt, techCount, areaCounts, tierCounts, sourceFiles }, techs: record<string, TechSchema>
- export type TechSnapshot

app/scripts/copy-data.mjs (unchanged): copies every pipeline/data/v* into app/public/data/{v}/ and writes app/public/data/versions.json:
  { latest: "<newest dir>", versions: [{ dir, label }] newest-first }, where label = meta.versionLabel ?? meta.gameVersion.
  app/public/data/ is gitignored (app/.gitignore line 3). Never commit it.
  App npm scripts: predev / prebuild / pretest all run copy-data automatically.

app/src/test/smoke.test.ts (pattern to mirror for the new test):
- const __dirname = dirname(fileURLToPath(import.meta.url));
- path = join(__dirname, "..", "..", "public", "data", "v4.5.0", "tech.json")
- vitest environment is node (no DOM).

Baseline facts (measured 2026-09-24):
- v4.5.0: 678 techs, label "Cygnus v4.5.0 (aa56)", 1373 files in icons/, 0 placeholder techs, 0 missing icon files, has diff.json (v4.4.6 -> v4.5.0, empty).
- v4.4.6: 678 techs, label "Pegasus v4.4.6 (fdde)", 1372 icon files, 0 placeholder techs, no diff.json.
- Install launcher-settings.json: rawVersion "v4.5.1", version "Cygnus v4.5.1 (358e)".
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Stop pipeline tests depending on the v4.5.0 install</name>
  <files>pipeline/test/skeleton.test.ts, pipeline/test/corpus.test.ts</files>
  <read_first>pipeline/test/corpus.test.ts (lines 1-46), pipeline/test/skeleton.test.ts (lines 1-10 and 70-78)</read_first>
  <action>
Fix this first. If it waits until after the 4.5.1 build, the corpus suite passes for the wrong reason. `runAssemble()` writes `data/{detected version}`, but `corpus.test.ts` reads the hard-coded `data/v4.5.0`. After the bump, Tests 1-5 and the idempotency check would all run against the old committed v4.5.0 file and never touch the new build.

corpus.test.ts: import `resolveConfig` from "../src/config.js" and `detectGameVersion` from "../src/version/detect.js". At module scope, get `gameRoot` from `resolveConfig([])`, the same way skeleton.test.ts line 9 does. Add `const DATA_VERSION = detectGameVersion(gameRoot)`. Build OUT_PATH as join(process.cwd(), "data", DATA_VERSION, "tech.json") and ICONS_DIR as join(process.cwd(), "data", DATA_VERSION, "icons"). Update the header comment to say the suite targets the version detected from the install, so it re-checks every future game-version bump. Leave the test bodies and the 650+ threshold unchanged.

skeleton.test.ts: rename the test at line 71 to "returns the real install's launcher-settings.json rawVersion verbatim". Read `launcher-settings.json` directly with readFileSync(join(gameRoot, "launcher-settings.json"), "utf8") and JSON.parse it. Assert that detectGameVersion(gameRoot) equals the parsed rawVersion, and that it matches the pattern ^v\d+\.\d+\.\d+$. Add readFileSync to the imports; `join` is already imported. Leave the fixture `gameVersion: "v4.5.0"` values at lines 84 and 115 alone, because they're hand-built schema fixtures that don't depend on the install.

Commit only these two files with the message: `test(pipeline): derive version-pinned test paths from the detected install version`
  </action>
  <verify>
    <automated>cd /c/Projects/Stellaris/tech/pipeline && npx vitest run test/skeleton.test.ts && ! grep -n '"data", "v4\.5\.0"' test/corpus.test.ts && grep -n "detectGameVersion(gameRoot)" test/corpus.test.ts</automated>
  </verify>
  <done>skeleton.test.ts passes against the 4.5.1 install. corpus.test.ts no longer contains a literal "v4.5.0" data path and derives OUT_PATH and ICONS_DIR from detectGameVersion(gameRoot). The change is committed.</done>
</task>

<task type="auto">
  <name>Task 2: Build, validate, diff, and commit the v4.5.1 snapshot</name>
  <files>pipeline/data/v4.5.1/tech.json, pipeline/data/v4.5.1/diff.json, pipeline/data/v4.5.1/icons/</files>
  <read_first>pipeline/src/assemble.ts (lines 83-114 and 431-505), pipeline/src/diff.ts (lines 100-155)</read_first>
  <action>
Always run from the pipeline directory (/c/Projects/Stellaris/tech/pipeline). runAssemble writes relative to cwd, so running from the repo root creates the stray root `data/` again. Full builds convert about 1,370 icons through ImageMagick and take several minutes. Use the maximum Bash timeout (600000 ms) or run in the background and wait.

Step A, build (DATA-05, one command): first confirm that pipeline/data/v4.5.1 does not already exist. Then run `npm run build:data`. Save the full console output, including the D-17 validation report and every `[assemble]` warning line, to the session scratchpad as build-4.5.1.log so you can quote it in the SUMMARY. If the build throws, STOP per the objective's STOP policy. Report the error verbatim with the offending keys and file(s).

Step B, post-build checks (DATA-01/03/04): run a node one-liner from the pipeline dir against data/v4.5.1/tech.json that checks all of the following:
- meta.gameVersion is "v4.5.1", meta.versionLabel is "Cygnus v4.5.1 (358e)", and meta.checksum is "358e".
- meta.techCount equals the number of keys in techs.
- Every tech has a non-empty name.
- The count of techs whose icon is "placeholder-icon.webp" is 0.
- Every tech's icon file exists under data/v4.5.1/icons/.
- No *.tmp.png files remain in data/v4.5.1/icons/.

Also print the icons/ file count next to v4.5.0's 1373. If the version or label doesn't match, STOP: the pipeline read a different install than expected. If any tech uses the placeholder or has a missing icon file, STOP and list the keys. Both baselines have 0, so this is a real 4.5.1 icon problem and needs a decision.

Step C, full pipeline test suite: run `npm test`. After Task 1, corpus.test.ts now rebuilds and re-checks data/v4.5.1, including the idempotency test that proves deterministic re-runs. Triage failures like this:
- (a) A crash, parse error, schema error, or structural failure: STOP per the policy.
- (b) An assertion pins a specific base-game value (for example a tech's weight or a scripted variable's value). Open the raw 4.5.1 file under Z:\SteamLibrary\steamapps\common\Stellaris\common\ and confirm Paradox actually changed that value. Only then update the literal, add a comment citing v4.5.1 and the source file, and list it in the SUMMARY under "Test expectations updated for 4.5.1 data". If you can't confirm it from the game file, treat it as (a).

The test runs leave tech.json with a newer generatedAt. That's expected, because generatedAt is the only field allowed to change between runs.

Step D, diff: run `npm run diff-data`. It auto-picks v4.5.0 -> v4.5.1 as the two newest snapshots and writes data/v4.5.1/diff.json. Check that the file exists and that fromVersion is "v4.5.0" and toVersion is "v4.5.1". If the CLI exits without writing the file (the entry-point guard compares process.argv[1] to the module path), fall back to a one-off tsx script in the session scratchpad. It should import diffSnapshots from pipeline/src/diff.ts and write the result to data/v4.5.1/diff.json with JSON.stringify(result, null, 2), the same format the CLI uses.

Step E, diff summary for the SUMMARY: with a node one-liner, print the added/removed/changed counts and every entry. For added, give key, name, tier and area. For removed, give key and name. For changed, give key, name and each field's from -> to. Also print the v4.5.0 and v4.5.1 meta side by side: techCount, areaCounts, tierCounts, and sourceFiles length. Save this to the scratchpad and include it in the SUMMARY under "## v4.5.0 -> v4.5.1 diff". An empty diff is a valid result (v4.4.6 -> v4.5.0 was empty too). Just record it.

Step F, commit: confirm that `git status --porcelain pipeline/data/v4.5.0 pipeline/data/v4.4.6` prints nothing, because historical snapshots must stay untouched. Confirm that `git check-ignore pipeline/data/v4.5.1/tech.json` prints nothing, meaning the file is not ignored. Stage with the explicit path only: `git add pipeline/data/v4.5.1`, plus any test literals updated under Step C(b). Never use `git add -A` or `git add .`. The repo has an unrelated modified .claude/launch.json, an untracked phase-04 .gitkeep, and the stray root data/, none of which belong in this commit. Commit with the message: `chore(pipeline): commit v4.5.1 "Cygnus" (358e) data snapshot + v4.5.0->v4.5.1 diff`
  </action>
  <verify>
    <automated>cd /c/Projects/Stellaris/tech/pipeline && node -e "const fs=require('fs');const d='data/v4.5.1/';const s=JSON.parse(fs.readFileSync(d+'tech.json','utf8'));const m=s.meta;const T=Object.values(s.techs);const bad=[m.gameVersion!=='v4.5.1'&&'version',m.versionLabel!=='Cygnus v4.5.1 (358e)'&&'label',m.techCount!==T.length&&'count',T.some(t=>!t.name)&&'names',T.some(t=>t.icon==='placeholder-icon.webp')&&'placeholder',T.some(t=>!fs.existsSync(d+'icons/'+t.icon))&&'iconfile',fs.readdirSync(d+'icons').some(f=>f.endsWith('.tmp.png'))&&'tmp'].filter(Boolean);const df=JSON.parse(fs.readFileSync(d+'diff.json','utf8'));if(df.fromVersion!=='v4.5.0'||df.toVersion!=='v4.5.1')bad.push('diff');console.log(bad.length?'FAIL '+bad:'OK techs='+T.length+' diff +'+df.added.length+'/-'+df.removed.length+'/~'+df.changed.length);process.exit(bad.length?1:0)" && git -C /c/Projects/Stellaris/tech ls-files --error-unmatch pipeline/data/v4.5.1/tech.json pipeline/data/v4.5.1/diff.json</automated>
  </verify>
  <done>data/v4.5.1/ holds a valid snapshot (version, label and checksum correct, every name resolved, 0 placeholders, every icon file present, no temp files). `npm test` in pipeline is green, and the corpus idempotency test now runs against v4.5.1. diff.json records v4.5.0 -> v4.5.1. v4.5.0 and v4.4.6 are unchanged. The snapshot is committed, the diff summary and D-17 report are saved for the SUMMARY, or the task stopped with an exact failure report.</done>
</task>

<task type="auto">
  <name>Task 3: Wire v4.5.1 into the app and schema-validate every shipped snapshot</name>
  <files>app/src/test/snapshots.test.ts</files>
  <read_first>app/src/test/smoke.test.ts, app/src/types/tech-snapshot.ts (lines 95-115)</read_first>
  <action>
No app source changes are expected. copy-data.mjs builds the manifest at build/test time from whatever pipeline/data/v* exists, and WhatsNew.tsx already fetches {version}/diff.json. The gap is that no app test validates any snapshot against the app's own schema. smoke, layout and exploreLayout read only v4.5.0 on purpose, as a fixed layout benchmark. Leave those three tests, the Header.tsx XENOPHILE_ICON path (v4.5.0 still ships), and the fetchSnapshot "v4.5.0" fallback (only used when the manifest is missing) unchanged. Mention them in the SUMMARY as observations only.

Create app/src/test/snapshots.test.ts. Resolve __dirname the same way smoke.test.ts does, and set the data root to join(__dirname, "..", "..", "public", "data"). The test reads versions.json and asserts:
- latest is a string and equals versions[0].dir.
- There is at least one version, and the dir names are unique.

Then, for each manifest entry (one `it` per version is fine, or a loop with clear messages), read {dir}/tech.json and parse it with TechSnapshotSchema from "../types/tech-snapshot". Assert:
- meta.gameVersion equals the entry's dir.
- The entry's label equals meta.versionLabel, falling back to meta.gameVersion.
- meta.techCount equals the number of tech keys.
- Every tech.icon file exists under {dir}/icons/.
- If {dir}/diff.json exists, its toVersion equals dir and its fromVersion is another dir in the manifest.

Don't hard-code "v4.5.1" anywhere. The test has to keep working for future version bumps, and the task-level verify below checks v4.5.1 explicitly.

Then, from /c/Projects/Stellaris/tech/app, run `npm run copy-data`, `npx tsc --noEmit`, and `npm test` (pretest re-runs copy-data, which is harmless). If TechSnapshotSchema.parse fails for v4.5.1, STOP per the objective's STOP policy. Report the Zod issue paths and the offending tech keys, and do NOT edit app/src/types/tech-snapshot.ts or pipeline/src/schema/tech-snapshot.ts. If it fails for v4.5.0 or v4.4.6, that's pre-existing contract drift: STOP and report it the same way, and don't modify those snapshots.

Commit only the new test file with the message: `test(app): schema-validate every shipped data snapshot from the versions manifest`. First confirm that `git status --porcelain app/public` prints nothing (public/data is gitignored and must not be committed).
  </action>
  <verify>
    <automated>cd /c/Projects/Stellaris/tech/app && npm run copy-data && node -e "const m=require('./public/data/versions.json');const ok=m.latest==='v4.5.1'&&m.versions[0].dir==='v4.5.1'&&m.versions[0].label==='Cygnus v4.5.1 (358e)'&&['v4.5.0','v4.4.6'].every(d=>m.versions.some(v=>v.dir===d));console.log(JSON.stringify(m));process.exit(ok?0:1)" && npx tsc --noEmit && npm test</automated>
  </verify>
  <done>versions.json has latest = v4.5.1 and lists it first as "Cygnus v4.5.1 (358e)", with v4.5.0 and v4.4.6 still present. The new snapshots.test.ts parses every shipped snapshot with the app schema and passes. tsc is clean and the full app suite is green. Only the test file is committed, and app/public stays untracked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local game install -> pipeline | Tech keys, swap names, and localisation text come from files under the configurable gameRoot and flow into output file paths and the JSON |
| Committed snapshot -> browser | Static tech.json, diff.json and icons are served to clients and parsed at runtime |
| Working tree -> git | The repo has unrelated dirty and untracked files (.claude/launch.json, phase-04 .gitkeep, stray root data/) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qfo-01 | Tampering | assemble.ts output paths built from game-derived keys | mitigate | Existing SAFE_NAME check (assemble.ts line 62) throws on any key or swap name with path syntax. Unchanged here, and a throw triggers the STOP policy |
| T-qfo-02 | Tampering | 4.5.1 data contract drift reaching clients | mitigate | Pipeline TechSnapshotSchema.parse before writing (assemble.ts line 466), plus the new app-side snapshots.test.ts parsing every shipped snapshot with the app schema, plus the existing runtime parse in fetchSnapshot.ts. Any failure means STOP, with no schema edits |
| T-qfo-03 | Information disclosure | git staging | mitigate | Stage only explicit paths (pipeline/test/*.test.ts, pipeline/data/v4.5.1, app/src/test/snapshots.test.ts). Never `git add -A`. app/public/data is gitignored and checked with git status before committing |
| T-qfo-SC | Tampering | package installs | accept | No npm/pip/cargo installs in this task. It only uses existing pinned dependencies and the already-installed ImageMagick |
</threat_model>

<verification>
- `pipeline/data/v4.5.1/tech.json` + `diff.json` + `icons/` are committed. v4.5.0 and v4.4.6 are unchanged (`git diff HEAD~3 --stat -- pipeline/data/v4.5.0 pipeline/data/v4.4.6` is empty).
- Pipeline `npm test` is green, and the corpus suite (including idempotency) ran against data/v4.5.1.
- App `npx tsc --noEmit` and `npm test` are green, and snapshots.test.ts validates v4.5.1, v4.5.0 and v4.4.6 with the app schema.
- versions.json: latest v4.5.1, label "Cygnus v4.5.1 (358e)", three versions listed.
- Optional manual spot check (not a blocker): with `npm run dev` in app/, open http://localhost:5173/?ver=4.5.1 (or the port Vite prints). The version selector should show "Cygnus v4.5.1 (358e)" as default, and What's new should reflect diff.json. Give the user this URL in the final report instead of a screenshot.
</verification>

<success_criteria>
- The v4.5.1 snapshot was generated with a single command (DATA-05): every name resolved (DATA-03), every icon real with 0 placeholders (DATA-04), and full-corpus coverage with 650+ techs and 0 dangling prerequisites (DATA-01).
- Deterministic re-runs are proven by corpus Test 2 running against v4.5.1.
- The app offers v4.5.1 as latest/default without any app source change, and a durable manifest-driven schema test guards future bumps.
- The SUMMARY contains: the v4.5.0 -> v4.5.1 diff (counts plus every added, removed and changed entry), the meta comparison (techCount, area and tier counts, icon file count), notable D-17 report warnings, any test literals updated under Task 2 Step C(b) with game-file evidence, and the observations about Header.tsx XENOPHILE_ICON and the fetchSnapshot fallback.
- There are three atomic commits (test de-pin, snapshot, app test), or the task stopped with an exact failure report per the STOP policy.
</success_criteria>

<output>
Create `.planning/quick/260924-qfo-regenerate-tech-tree-data-snapshot-for-s/260924-qfo-SUMMARY.md` when done
</output>
