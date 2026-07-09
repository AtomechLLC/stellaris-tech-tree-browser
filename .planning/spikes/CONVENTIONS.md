# Spike Conventions

Patterns and stack choices established across the sav-tech-classifier spike session. New spikes
follow these unless the question requires otherwise.

## Stack

- **Language/runner:** TypeScript executed with the pipeline's `tsx`
  (`pipeline/node_modules/.bin/tsx`). No separate toolchain per spike.
- **Clausewitz/save parsing:** `jomini` 0.10.0 (already the pipeline's parser). Reuse the pipeline's
  proven approach — wrap content in `__root__ = { … }` and parse with `{ encoding: "windows1252" }`
  (`pipeline/src/parser/clausewitz.ts`).
- **In-browser unzip:** `fflate` (`unzipSync`) — tiny, zero-dep, shared Node/browser.
- **Browser bundling:** `esbuild --bundle --format=esm --platform=browser`. jomini's ESM build
  inlines its WASM as base64, so the bundle is self-contained (no `.wasm` to serve).

## Module resolution (spikes live outside `pipeline/`)

- **Server scripts:** import pure pipeline modules by relative path
  (`../../../pipeline/src/parser/…`). Their bare `jomini` import resolves from `pipeline/node_modules`
  because Node resolves bare specifiers from the *importing* file's location. For loading jomini
  directly in a spike script, `createRequire("C:/Projects/Stellaris/tech/pipeline/")` also works.
- **tsx quirk:** files outside `pipeline/` are treated as CJS (no top-level await). Wrap script
  bodies in `async function main(){…}; main().catch(…)`.
- **Browser bundles:** give the spike its own `node_modules` (`npm install fflate jomini` in the
  spike dir) so esbuild resolves them; pure logic (`gates.ts`, `classify.ts`) is imported by relative
  path and bundled.

## Structure

- One self-contained dir per spike: `.planning/spikes/NNN-name/`.
- `.gitignore` large/generated/local-only files inside the spike: `node_modules/`, `save.sav`,
  `bundle.js`, copied data. Commit source + small artifacts (READMEs, `tech-gates.json`,
  `demo-data.json` ≈ 0.4 MB is fine).
- Interactive demos served with `npx -y serve -l <port> <dir>` via a `.claude/launch.json` config
  named `spikeNNN`; preview + verify with the `preview_*` tools.

## Domain model (the reusable core)

- **Save extraction:** `country={ N={ name, government={type,authority,civics[],origin},
  ethos={ethics[]}, tech_status={ technology[]/level[] } } }`; `player={ {name,country} }` maps human
  players. Ethics key is `ethos.ethics` (not `ethic`).
- **Tech gates:** `potential={}` → normalized boolean tree (`gates.ts::normalizePotential`). Each
  leaf is STATIC / MONOTONIC / DYNAMIC. **"Never" = gate unsatisfiability** with static leaves fixed
  and dynamic leaves free (monotonic-true leaves pinned). Not truth-evaluation.
- **Four buckets:** researched / available-now / reachable-later / never (`classify.ts`). Invariant:
  no researched tech may be "never" (falseNever must be 0).

## Tools & Libraries

- `jomini@0.10.0`, `fflate` (latest), `esbuild` (via pipeline), `serve` (via npx). All confirmed
  working. Avoid: hand-rolled Clausewitz parsing / brace-matching unless a targeted perf optimization
  specifically calls for it (see spike 004's optimization note).
