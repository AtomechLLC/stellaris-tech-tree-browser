# Walking Skeleton — Stellaris Tech Tree Visualizer (Data Pipeline)

**Phase:** 1
**Generated:** 2026-07-07

## Capability Proven End-to-End

> One sentence: the smallest capability that exercises the full pipeline stack.

A single command (`npm run build:data`) reads the local Stellaris install, auto-detects the game version, parses one real tech file, resolves an `@scripted_variable` to a concrete number, validates the result against the Zod schema, and writes `data/v4.5.0/tech.json` — a versioned snapshot a trivial consumer can load and read.

Note: In Phase 1 the "user" of the deliverable is the pipeline operator/maintainer and the downstream consumer is Phase 2's frontend — there is no interactive UI in this phase. The full React app is Phase 2. The skeleton here proves the pipeline architecture (game files → parse → resolve → snapshot → validated output) end-to-end on a minimal slice before Plans 02–05 widen it to full fidelity.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language / runtime | TypeScript 5.x on Node.js 24 (ESM, `"type":"module"`) | D-18: Node.js pipeline; RESEARCH.md verified Node 24.15.0 works with jomini/sharp; TS 5.x resolves the 5.x/6.x drift flagged in RESEARCH.md |
| Clausewitz parser | jomini 0.10.0 (WASM), with the verified `__root__ = { … }` wrap + Buffer parse | The single most important finding in RESEARCH.md: this wrap+buffer combo parses all 33 tech files + scripted_variables with zero errors (Pitfall 1). Never hand-roll a Clausewitz parser (Don't Hand-Roll). |
| Schema / validation | Zod 4.4.3 — `TechSnapshotSchema` is the hard pipeline/frontend contract (D-04) | Validate the snapshot before writing (D-16 strict-fail); same schema module reused by Phase 2's loader |
| Scripted-variable resolution | Eager global map from `common/scripted_variables/`, `@name`-keyed, resolved to concrete numbers (D-07, DATA-02) | 2691 variables load once; `resolveValue` fails loud on unresolved/inline-math references |
| Localisation | Global scan of ALL `localisation/english/*.yml`, optional-index line regex (DATA-03) | Pitfalls 2 & 3: tech text is scattered across 16+ files and uses two line syntaxes; a single-file/strict-index assumption silently drops ~215 keys |
| DLC classification | Parse authoritative `dlc/dlc0XX_*/dlc0XX.dlc` `name` fields + filename convention + `host_has_dlc` trigger override (D-08) | Refined per RESEARCH.md: the `.dlc` files are Paradox's self-updating source of truth, superseding a hand-maintained table |
| Icon conversion | ImageMagick CLI (DDS→PNG, `execFileSync` argument array) → sharp (PNG→lossless WebP), placeholder fallback (D-10..D-13) | RESEARCH.md ran the D-12 smoke test: ImageMagick 7.1.1 converts all observed formats cleanly; texconv is a documented contingency only |
| Version detection | Auto-read `rawVersion` from `launcher-settings.json` (D-02) | Never hand-entered; drives the `data/v{version}/` output path |
| Install path | Configurable via CLI `--game-root` > `STELLARIS_INSTALL_PATH` env > config file > default `Z:\SteamLibrary\steamapps\common\Stellaris`, confined to `config.ts` (D-15) | Fail loud if the path is missing; never hardcode inside pipeline logic; never interpolate into a shell string (T-04-01) |
| Output layout | One combined `data/v{version}/tech.json` + `data/v{version}/icons/*.webp`, deterministic key ordering (D-01, D-03) | Byte-identical re-runs (DATA-05 idempotency); no per-area file splitting |
| Directory layout | `pipeline/src/{parser,localisation,dlc,icons,graph,schema,version}/` + `assemble.ts` orchestrator | Mirrors RESEARCH.md Recommended Project Structure; module-per-concern for isolated testing |
| Test framework | Vitest 4.1.10, real-corpus integration test against the 33 files (D-18) | Corpus-scale validation, not sampled — the reference tool died from full-scale-only bugs |

## Stack Touched in Phase 1

- [x] Project scaffold (Node/TS package, `build:data` + `test` scripts, tsconfig, lint-free strict mode) — Plan 01
- [x] "Routing" analog — the single `npm run build:data` entrypoint orchestrating all stages — Plan 01 (skeleton) → Plan 05 (full)
- [x] Real data read AND real write — parse game files (read) + write `data/v4.5.0/tech.json` and `icons/*.webp` (write) — Plan 01 (skeleton) → Plan 05 (full)
- [x] Interactive element wired end-to-end — the command exercises parse → resolve → validate → write; a trivial consumer test loads the output — Plan 01
- [x] Documented full-stack run command — `cd pipeline && npm install && npm run build:data` regenerates everything from scratch (DATA-05, D-14)

## Out of Scope (Deferred to Later Slices)

> Explicit — prevents later phases re-litigating Phase 1's boundaries.

- The entire React/Vite frontend, Sigma/graphology rendering, ELK layout, search, filters, detail panel — **Phase 2 and Phase 3**.
- Deep unlocks cross-referencing (buildings/components/ship files) — **UNLK-01, v2** (D-05: v1 unlocks = reverse prerequisite edges only).
- Structured weight-modifier *display* — **WGHT-01, v2** (D-06: the pipeline preserves the raw `weight_modifier` data now; the UI display is deferred).
- Visual flag legend/rendering — **FLAG-01, v2** (D-09: flags are parsed and stored now; display deferred).
- Mod tech support, live save integration, draw-weight simulation — **explicitly out of scope** per REQUIREMENTS.md.
- `@[ ]` inline math and `hsv{}` preprocessing — **detect-and-fail-loudly only** (RESEARCH.md verified zero occurrences in this corpus; no active handling built).
- texconv DDS fallback — **documented contingency only** (RESEARCH.md D-12 smoke test showed ImageMagick suffices).

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this pipeline without altering its architectural decisions (the `tech.json` schema is the frozen contract):

- **Phase 1, Plan 02:** Full tech extraction (all 33 files) + DLC classification + prerequisite DAG — widens the skeleton's single tech to all ~678.
- **Phase 1, Plan 03:** Localisation resolution (names/descriptions) — fills real display text.
- **Phase 1, Plan 04:** Icon pipeline (DDS→WebP + placeholder) — fills per-tech icons.
- **Phase 1, Plan 05:** Full assembler + validation report + idempotency/corpus test + SCHEMA.md — completes the full-fidelity snapshot and the DATA-05 single-command guarantee.
- **Phase 2:** Render `tech.json` as a true DAG with icons, tier/area layout, and smooth pan/zoom (consumes this schema).
- **Phase 3:** Search, filters, prerequisite-chain highlighting, detail panel, working links (navigation on top of Phase 2).
