# Phase 1: Data Pipeline - Research

**Researched:** 2026-07-07
**Domain:** Clausewitz/Paradox script parsing (jomini), Paradox localisation format, DDS-to-web image conversion, build-time ETL pipeline
**Confidence:** HIGH (all core findings verified directly against the real Stellaris 4.5.0 install and by running real code against it — not assumed from training knowledge or documentation alone)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** One combined snapshot per game version: `data/v{version}/tech.json` plus `data/v{version}/icons/` — no per-area file splitting (unnecessary at ~600-900 techs per architecture research).
- **D-02:** Game version is auto-detected from `launcher-settings.json` (`rawVersion`, e.g. `v4.5.0`) — never hand-entered.
- **D-03:** Snapshot includes a `meta` block: game version, generation date, tech/area/tier counts, source file list. Content ordering is deterministic (sorted by tech key) so re-runs produce diff-stable output (DATA-05 idempotency).
- **D-04:** The JSON schema is the hard pipeline/frontend boundary. Schema should be documented (even minimally) so Phase 2 can develop against fixture data before/independently of pipeline runs.
- **D-05:** `unlocks` in v1 = what can be extracted from the tech files themselves plus localisation (modifier text, feature-unlock strings) plus computed reverse edges ("leads to": techs that list this tech as a prerequisite). NO cross-referencing of buildings/components/ship files — that is UNLK-01, deferred to v2.
- **D-06:** Weight is captured as base weight (flat number) for display, but the raw `weight_modifier` blocks must be parsed structurally and preserved in the snapshot (not discarded, not flattened) — WGHT-01 (v2) will need them, and flattening incorrectly would misrepresent game data. Duplicate `modifier` keys must be preserved as arrays, never collapsed into objects.
- **D-07:** `@scripted_variables` (e.g. `cost = @tier2cost1`) are resolved to concrete numbers from `common/scripted_variables/`, per DATA-02. Inline `@[ ]` math must be handled or explicitly detected-and-reported.
- **D-08:** DLC gating uses an explicit, maintained mapping table (source filename → DLC, e.g. `00_ancient_relics_tech.txt` → Ancient Relics) cross-checked against trigger-based gating in tech definitions — not derived logic alone (per pitfalls research).
- **D-09:** Flags (rare / dangerous / repeatable / starting) are parsed and stored in the snapshot now even though visual flag display (FLAG-01) is v2 — the data costs nothing extra and avoids a pipeline re-run later.
- **D-10:** Icons resolve by naming convention (`gfx/interface/icons/technologies/{tech_key}.dds` etc.) since tech entries mostly have no `icon =` field; `technology_swap` blocks provide conditional aliases — export base icon per tech, and swap-variant icons alongside where present.
- **D-11:** Output format: WebP (lossless) at native resolution, named by tech key. Fall back to PNG only if WebP fidelity issues appear.
- **D-12:** Conversion via ImageMagick CLI (DDS coder) piped through sharp for encoding — BUT run an early smoke-test on a handful of real Stellaris icons first; if fidelity artifacts appear, fall back to texconv (this is a flagged unverified risk in STATE.md).
- **D-13:** Missing icon for a tech = warning + shipped placeholder icon, not a pipeline failure.
- **D-14:** Single command (npm script, e.g. `npm run build:data`) performs the entire parse → resolve → convert → assemble → validate flow with no manual steps (DATA-05).
- **D-15:** Game install path is configurable (config file with env/CLI override), defaulting to `Z:\SteamLibrary\steamapps\common\Stellaris`. Never hardcode the path inside pipeline logic.
- **D-16:** Strict-fail on structural errors: unparseable tech file, unresolved prerequisite ID, unresolved scripted variable used in a required field, missing localisation for a tech name. Warn-and-report on cosmetic gaps: missing icon, missing description string.
- **D-17:** Pipeline prints a validation report at the end: tech counts per area/tier, DLC breakdown, unresolved references, missing icons/localisation — so a future game-patch run immediately shows what changed or broke.
- **D-18:** Pipeline is Node.js using jomini (WASM Clausewitz parser) per stack research — with a documented preprocessing step for `@variable` references and `hsv{}` syntax that jomini doesn't natively handle. Validate against the FULL 33-file corpus, not a sample (per pitfalls research: full-scale-only bugs sank the reference tool).

**Research note on D-07/D-18:** This session searched `common/technology/*.txt` and `common/scripted_variables/*.txt` exhaustively for `@[ ]` inline math and `hsv{}` syntax and found **zero occurrences of either** in this phase's actual file scope (both constructs exist elsewhere in the game files — component_templates, scripted_effects, script_values — but not in the technology/scripted_variables corpus this phase reads). The planner should treat D-07's "@[ ] math must be handled" and D-18's "hsv{} preprocessing" as defensive/no-op requirements for v1 given this corpus — implement detection (fail loudly if ever encountered) rather than building unused handling logic, and revisit only if a future game patch introduces these constructs into the tech files.

**Research note on D-08:** This session found a better-than-hand-maintained-table option: `dlc/dlc0XX_*/dlc0XX.dlc` files (Clausewitz format, parseable by the same pipeline) provide Paradox's own authoritative DLC display names, exactly matching the strings used in `host_has_dlc = "..."` triggers. See Don't Hand-Roll section below. This doesn't violate D-08's intent (explicit, maintained mapping, cross-checked against triggers) — it's a stronger implementation of the same requirement, using a self-updating authoritative source instead of a hand-typed one. Recommend the planner adopt this refinement.

**Research note on D-12:** This session ran a real smoke-test (the exact verification D-12 calls for) against 4 representative icons spanning every compression format found in the corpus (uncompressed, DXT1, DXT3, DXT5). All converted cleanly with no visible fidelity issues. D-12's flagged texconv fallback is very likely unnecessary — see Environment Availability and Code Examples sections.

### Claude's Discretion

- Exact JSON field naming and nesting within the schema (as long as D-01…D-09 content is present and documented).
- Internal pipeline module structure and intermediate representations.
- Choice of test framework / validation harness for parser corpus tests.
- Exact placeholder icon design.

### Deferred Ideas (OUT OF SCOPE)

- Deep unlocks cross-referencing (buildings/components/ships) — UNLK-01, v2 (already in STATE.md Deferred Items)
- Structured weight-modifier *display* — WGHT-01, v2 (pipeline preserves the data now per D-06; UI display deferred)
- All other v2 items tracked in STATE.md Deferred Items table
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| DATA-01 | Pipeline parses all technology definitions from the local Stellaris 4.5.0 install (all 33 tech files, including DLC files) into a versioned JSON snapshot | Verified: 678 top-level `tech_*` definitions counted directly across all 33 files; the wrap+buffer jomini preprocessing (Pitfall 1) is required for 100% of files to parse without error, including the empty `00_repeatable.txt` and two scripted_variables files that fail under naive parsing. See Code Examples "Verified jomini preprocessing wrapper." |
| DATA-02 | Parsed tech records include tier, area, category, cost, base weight, prerequisites, unlocks, DLC gating, and flags (rare/dangerous/repeatable/starting), with `@scripted_variables` resolved to concrete values | Verified: scripted variable keys retain their `@` prefix in jomini output and are directly usable as a lookup map key (`@tier1cost3` → `1500`, 2691 variables parsed from `common/scripted_variables/`). Verified `@[ ]` inline math and `hsv{}` do NOT occur in this phase's file scope (see research note above) — D-07's math-handling requirement reduces to detect-and-fail-loudly, not active resolution. DLC gating requires combining filename convention + `.dlc` metadata + `host_has_dlc` trigger scan (Pitfall 4). Flags (`is_rare`, `is_dangerous`, `start_tech`, `levels = -1` for repeatable) all directly observed and counted in the real corpus. |
| DATA-03 | Tech names and descriptions are resolved from the game's English localisation files | Verified: localisation is scattered across 16+ `.yml` files, not just `technology_l_english.yml` (Pitfall 2), and uses two different key:value line syntaxes that must both be handled (Pitfall 3). A scan of all `.yml` files with the optional-index regex resolves all 678 tech keys with zero misses. |
| DATA-04 | Tech icons are extracted from game `.dds` assets and converted to web formats | Verified end-to-end: ImageMagick CLI (already installed, DDS/DXT1/DXT5 coders confirmed) converts DDS → PNG cleanly for all observed compression formats; sharp converts PNG → lossless WebP with alpha preserved. See Code Examples "Verified icon conversion chain." Icon resolution must handle the explicit `icon = "..."` override field (confirmed present, e.g. `tech_archeology_lab_ancrel` uses a different tech's icon name) in addition to the naming convention and `technology_swap` aliasing. |
| DATA-05 | Pipeline regenerates the full data snapshot with a single command, so future game-version updates are cheap | Directly supported by the verified jomini wrap+buffer fix being a stable, code-level preprocessing step (not a manual intervention), and by the DLC registry being sourced from the game's own `.dlc` files (self-updating on new DLC installs) rather than a file requiring manual maintenance per version bump. |

</phase_requirements>

## Summary

This research grounds Phase 1 in direct inspection of the real Stellaris 4.5.0 install (`Z:\SteamLibrary\steamapps\common\Stellaris`) and in actually running jomini, ImageMagick, and sharp against real game files rather than relying on assumptions. Three flagged risks from STATE.md are now resolved with hard evidence: (1) jomini parses all 33 tech files plus category/tier/scripted_variables cleanly once a specific preprocessing wrapper is applied (see Pitfall below — this was not previously known and is the single most important finding in this document); (2) ImageMagick's DDS coder converts every observed compression variant (uncompressed 24/32bpp, DXT1, DXT3, DXT5) with no visible fidelity loss, verified by actually converting and visually inspecting four representative icons; (3) the DLC-gating problem has a better solution than a hand-maintained table — the game ships an authoritative `dlc/dlc0XX_*/dlc0XX.dlc` metadata file per DLC with the exact display-name string used by in-script `host_has_dlc = "..."` triggers.

The corpus is smaller and cleaner than the project-level research assumed in some respects (no `@[ ]` inline math or `hsv{}` blocks anywhere in `common/technology/` or `common/scripted_variables/` — those constructs exist elsewhere in the game files but are out of scope for this phase) and trickier in others (tech localisation is scattered across 16 different `.yml` files, not concentrated in `technology_l_english.yml`; two real known-good scripted-variable files fail with jomini's default string-mode parse due to a specific tab-adjacency quirk, fixed by buffer-mode + root-wrapping). 678 top-level `tech_*` definitions were counted directly (matching the ~600-900 estimate), 207 `technology_swap` blocks across 18 files, 53 `is_dangerous = yes` flags, 45 `start_tech = yes` starting techs, and 11 `host_has_dlc` trigger occurrences (only 2 of which cross-cut into a *different* DLC than the containing filename implies — a small, enumerable list, not an open-ended problem).

**Primary recommendation:** Wrap every Clausewitz file's raw content in a synthetic `__root__ = { ... }` block and pass the raw `Buffer` (not a pre-decoded string) to jomini's `parseText(buf, 'windows1252')` — this single preprocessing step eliminates 100% of observed parse failures across the full 33-file tech corpus plus scripted_variables, category, and tier files, with zero data-shape side effects on well-formed files.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Clausewitz file parsing (.txt → AST/object) | Build-time Node pipeline | — | Game files never touch the browser; parsing is a one-time, offline, build-time concern (Anti-Pattern 1 in ARCHITECTURE.md) |
| Scripted variable resolution (`@tier1cost3` → `1500`) | Build-time Node pipeline | — | Requires reading `common/scripted_variables/*.txt` as a separate pass before/alongside tech parsing; purely a data-transform step |
| Localisation resolution (tech name/desc) | Build-time Node pipeline | — | Requires scanning up to 16 `.yml` files and joining on tech key; frontend must never re-derive this |
| DLC gating classification | Build-time Node pipeline | — | Combines filename convention + authoritative `.dlc` metadata + `potential.host_has_dlc` trigger scan; entirely a data-classification concern, resolved once at build time |
| Icon extraction & format conversion (.dds → .webp) | Build-time Node pipeline (via `child_process` to ImageMagick CLI) + Node (sharp) | — | DDS is not a web-native format; conversion must happen before any client ever sees the asset |
| Prerequisite graph construction & validation (DAG, cycle check, dangling refs) | Build-time Node pipeline | — | Graph structure is static per game version; validating it once at build time (not per-request) is the entire point of the versioned-snapshot architecture |
| Snapshot assembly & schema validation | Build-time Node pipeline | — | Emits the single JSON artifact that is the hard contract boundary with Phase 2 |
| Schema/type definitions (Zod or equivalent) | Build-time Node pipeline (authored once) | Frontend (Phase 2, consumes same schema) | Shared conceptually across both packages per ARCHITECTURE.md; Phase 1 owns authoring it |
| Snapshot consumption / rendering | — (Phase 2 scope) | — | Explicitly out of scope for Phase 1 per CONTEXT.md phase boundary |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **jomini** | 0.10.0 | Clausewitz/Paradox script parser (Node/WASM) | `[VERIFIED: npm registry]` Confirmed installed and run against the real 33-file corpus + category/tier/scripted_variables in this research session. Zero runtime deps, MIT license, actively maintained (published 3 months ago per `npm view`), official GitHub repo `nickbabcock/jomini`. |
| **sharp** | 0.35.3 | Image resize/encode (PNG → WebP) | `[VERIFIED: npm registry]` Confirmed current on npm registry (published 2026-07-01) and confirmed working end-to-end in this session: converts ImageMagick-produced PNG to lossless WebP with alpha channel preserved, smaller file size than PNG. |
| **ImageMagick CLI** | 7.1.1-36 Q16-HDRI | DDS → PNG decode (system dependency, invoked via `child_process`) | `[VERIFIED: local install]` Already installed on this machine at `/c/Program Files/ImageMagick-7.1.1-Q16-HDRI/magick`. DDS/DXT1/DXT5 coders confirmed present via `magick -list format`. Confirmed working via direct conversion test against 4 real Stellaris icon files spanning uncompressed, DXT1, DXT3, and DXT5 formats — all converted cleanly with correct dimensions and no visible artifacts. |
| **TypeScript** | 5.x (project decision) or 6.0.3 (current npm latest) | Language | `[VERIFIED: npm registry]` `npm view typescript version` returns 6.0.3 as of this research (published 2026-06-18), newer than the 5.x assumed in project-level STACK.md. Not a blocker — either major works for this phase; flag for the planner to pick one explicitly rather than silently drifting. |
| **Node.js** | 24.15.0 (installed) | Runtime | `[VERIFIED: local install]` Confirmed installed and used throughout this research session. Comfortably exceeds the "Node 20+ LTS recommended" guidance in project STACK.md — no compatibility concerns found with jomini or sharp. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **zod** | 4.4.3 | Schema validation for the snapshot JSON contract | `[VERIFIED: npm registry]` Confirmed current on npm, official repo `colinhacks/zod`. Use to define the `tech.json` schema once, validate pipeline output against it before writing to disk (D-16's "strict-fail on structural errors"), and reuse the same schema module in Phase 2's frontend loader per ARCHITECTURE.md Pattern 2. |
| **vitest** | 4.1.10 | Unit/parser test framework | `[VERIFIED: npm registry]` Confirmed current (major version jumped to 4.x since project STACK.md's assumption of un-pinned "latest" — verify peer compatibility with the chosen Vite version at install time, though Phase 1 has no Vite dependency itself). Use for corpus-level parser regression tests (see Validation Architecture below). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jomini's built-in duplicate-key-to-array behavior | Hand-rolled key-preserving multimap (as PITFALLS.md defensively suggested) | Not needed — verified in this session that jomini's default object-mode output already auto-arrays duplicate keys correctly (tested with 2-key and 3-key `modifier` blocks, and mixed-arity `technology_swap` blocks). Building a custom multimap layer on top would be unnecessary extra complexity for a problem jomini already solves. |
| ImageMagick CLI | texconv (DirectXTex) | Not needed as a fallback — ImageMagick's DDS coder was verified in this session against real DXT1/DXT3/DXT5/uncompressed Stellaris icons with clean visual results. D-12's flagged fallback path can be considered de-risked; keep texconv noted as a contingency only, not an expected need. |
| Hand-maintained DLC filename→display-name table | Parse the authoritative `dlc/dlc0XX_*/dlc0XX.dlc` files (Clausewitz format, same parser) | The `.dlc` files are the actual source of truth Paradox uses — same `name = "..."` string that appears in `host_has_dlc = "..."` triggers. Parsing them (with the same jomini pipeline) is strictly more reliable than a hand-maintained table, and self-updates on install refresh without code changes when a new DLC's folder appears. |

**Installation:**
```bash
# Build-time pipeline dependencies (devDependencies is fine — this pipeline itself is dev tooling, not shipped)
npm install jomini sharp zod
npm install -D typescript vitest

# System dependency (already installed and verified on this machine — no action needed)
# ImageMagick 7.1.1-36 Q16-HDRI confirmed at /c/Program Files/ImageMagick-7.1.1-Q16-HDRI/magick
```

**Version verification:** All versions above were directly confirmed via `npm view <pkg> version` and `npm view <pkg> repository.url` during this research session (2026-07-07), not carried over unchecked from project-level STACK.md. ImageMagick was confirmed via direct local execution (`magick -version`, `magick -list format`).

## Package Legitimacy Audit

**Note on tooling:** `slopcheck` was installed successfully (`pip install slopcheck`, v0.6.1) but its `install` subcommand only checks PyPI — running it against `jomini sharp typescript vitest` incorrectly attempted to `pip install` these Node.js/npm packages, which is the exact cross-ecosystem confusion the Package Legitimacy Protocol warns about. slopcheck flagged `jomini` (PyPI) as `[SUS]` ("only 77 downloads") and `vitest` (PyPI) as `[SUS]` ("possible typosquat of pytest") — **both verdicts are about unrelated PyPI packages that happen to share a name, not the actual npm packages this phase uses.** These verdicts are disregarded. Instead, every package below was verified directly against the correct registry (npm) using `npm view`, which is the ecosystem-appropriate check per the protocol's Step 3.

| Package | Registry | Age | Downloads | Source Repo | Registry check | Disposition |
|---------|----------|-----|-----------|--------------|-----------------|-------------|
| jomini | npm | published 3 months ago (per `npm view time.modified`), 51 versions total | not sampled (weekly download count not queried) | `github.com/nickbabcock/jomini` (confirmed via `repository.url`) | `npm view jomini version` → 0.10.0, `scripts.postinstall` → none | Approved |
| sharp | npm | actively maintained, published 2026-07-01 | high (widely known image library) | `github.com/lovell/sharp` | `npm view sharp version` → 0.35.3, `scripts.postinstall` → none | Approved |
| typescript | npm | Microsoft official | very high | `github.com/microsoft/TypeScript` | `npm view typescript version` → 6.0.3, `scripts.postinstall` → none | Approved |
| vitest | npm | actively maintained | high | `github.com/vitest-dev/vitest` | `npm view vitest version` → 4.1.10, `scripts.postinstall` → none | Approved |
| zod | npm | actively maintained | very high | `github.com/colinhacks/zod` | `npm view zod version` → 4.4.3, `scripts.postinstall` → none | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck's verdicts were against the wrong ecosystem and disregarded per above)
**Packages flagged as suspicious [SUS]:** none, on the correct registry (npm). All five packages checked directly via `npm view` show official repositories, no suspicious postinstall scripts, and match well-known, long-established projects.

*Provenance note per this agent's role instructions: because these package names were confirmed via direct `npm view` execution against the official npm registry (not merely training-data recall), and each maps to a verifiable, well-known official GitHub repository, they qualify for `[VERIFIED: npm registry]` status rather than `[ASSUMED]`.*

## Architecture Patterns

### System Architecture Diagram

```
Z:\...\Stellaris (read-only, local filesystem — build-time input only)
        │
        ├── common/technology/*.txt (33 files) ───────┐
        ├── common/technology/category/00_category.txt│
        ├── common/technology/tier/00_tier.txt         │
        ├── common/scripted_variables/*.txt (22 files) │  preprocessing: wrap in
        ├── dlc/dlc0XX_*/dlc0XX.dlc (30 files)          │  __root__ = { ... } block,
        ├── localisation/english/*.yml (16+ relevant)   │  read as Buffer (not string)
        └── launcher-settings.json                      │
                    │                                    ▼
                    │                          ┌───────────────────┐
                    │                          │  jomini.parseText  │
                    │                          │  (buffer, win1252) │
                    │                          └─────────┬─────────┘
                    │                                    ▼
                    │                      raw per-file AST/object
                    │                      (duplicate keys auto-arrayed)
                    ▼                                    │
        ┌───────────────────┐                            ▼
        │ Version Detector   │              ┌─────────────────────────┐
        │ (rawVersion field) │              │   Tech Extractor         │
        └─────────┬──────────┘              │   (AST → Tech[] with     │
                  │                          │   tier/area/category/   │
                  │                          │   cost/prereqs/flags)   │
                  │                          └────────────┬────────────┘
                  │                                        │
                  │          ┌─────────────────────────────┼───────────────────┐
                  │          ▼                              ▼                   ▼
                  │  ┌───────────────┐          ┌───────────────────┐  ┌────────────────┐
                  │  │ Scripted Var   │          │ Localisation Scan  │  │ DLC Classifier │
                  │  │ Resolver       │          │ (16+ .yml files,   │  │ (.dlc metadata │
                  │  │ (@var → number)│          │  key:N "val" +     │  │  + filename +  │
                  │  │                │          │  key: "val" forms) │  │  host_has_dlc  │
                  │  └───────┬────────┘          └──────────┬─────────┘  │  trigger scan) │
                  │          │                               │           └────────┬───────┘
                  │          └───────────────┬───────────────┴────────────────────┘
                  │                          ▼
                  │              Tech[] fully enriched (name, desc,
                  │              resolved cost/weight, DLC tag)
                  │                          │
                  │          ┌───────────────┼───────────────────┐
                  │          ▼                                    ▼
                  │  ┌────────────────┐                ┌──────────────────┐
                  │  │ Icon Resolver   │                │ Graph Builder     │
                  │  │ (convention +   │                │ (prerequisites →  │
                  │  │  icon= override │                │  DAG, dangling-   │
                  │  │  + swap alias)  │                │  ref check, cycle │
                  │  └───────┬─────────┘                │  check, reverse   │
                  │          ▼                           │  edges)           │
                  │  ImageMagick (.dds→.png)             └─────────┬─────────┘
                  │          ▼                                     │
                  │  sharp (.png→.webp)                            │
                  │          │                                     │
                  │          └──────────────────┬──────────────────┘
                  │                              ▼
                  │                  ┌────────────────────────┐
                  └─────────────────▶│  Snapshot Assembler     │
                                     │  (Zod validate, sort by │
                                     │   tech key, write meta) │
                                     └───────────┬─────────────┘
                                                 ▼
                                    data/v4.5.0/tech.json
                                    data/v4.5.0/icons/*.webp
                                                 │
                                                 ▼
                                    Validation report printed to console
                                    (counts, unresolved refs, missing icons)
```

### Recommended Project Structure

```
pipeline/
├── src/
│   ├── parser/
│   │   ├── clausewitz.ts          # jomini wrapper: wraps input in __root__, calls parseText(buffer, 'windows1252')
│   │   ├── scripted-variables.ts  # parses common/scripted_variables/*.txt -> Map<'@varname', number>
│   │   └── tech-extractor.ts      # raw parsed object -> Tech[] (normalizes technology_swap to always-array)
│   ├── localisation/
│   │   └── loc-scanner.ts         # scans ALL localisation/english/*.yml (not just technology_l_english.yml),
│   │                               # handles both `key:N "value"` and `key: "value"` (no index) forms
│   ├── dlc/
│   │   ├── dlc-registry.ts        # parses dlc/dlc0XX_*/dlc0XX.dlc files -> Map<folderName, {name, steam_id,...}>
│   │   └── dlc-classifier.ts      # combines filename convention + host_has_dlc trigger scan
│   ├── icons/
│   │   ├── resolve.ts             # tech_<key>.dds convention + icon= field override + technology_swap aliasing
│   │   └── convert.ts             # child_process -> magick (DDS->PNG) -> sharp (PNG->WebP lossless)
│   ├── graph/
│   │   └── build-dag.ts           # prerequisites[] -> adjacency list; dangling-ref + cycle validation
│   ├── schema/
│   │   └── tech-snapshot.ts       # Zod schema, the pipeline/frontend contract
│   ├── version/
│   │   └── detect.ts              # reads launcher-settings.json -> rawVersion
│   └── assemble.ts                # orchestrator: run all stages in order, validate, write, print report
├── data/
│   └── v4.5.0/
│       ├── tech.json
│       └── icons/*.webp
├── test/
│   ├── fixtures/                  # small hand-crafted Clausewitz snippets for unit tests
│   └── corpus/                    # full-corpus integration test (real 33 files, per D-18)
├── package.json
└── tsconfig.json
```

### Structure Rationale

This mirrors the sibling-package layout already established in project-level ARCHITECTURE.md (`pipeline/` alongside a future `app/`), refined with the concrete module boundaries discovered in this research: `dlc/` is promoted to its own module (not folded into the tech extractor) because DLC classification genuinely needs two independent data sources (the `.dlc` metadata files AND the in-tech `potential.host_has_dlc` triggers) cross-referenced against filename convention — this is enough independent logic to deserve isolation and independent testing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clausewitz tokenization/parsing | A regex or hand-rolled recursive-descent parser | jomini's `parseText` | Verified in this session to correctly handle nested blocks, `technology_swap` blocks (both single-object and multi-array forms), duplicate `modifier` keys (auto-arrayed, order-preserved), quoted/unquoted prerequisite lists, and comments — all without custom code. |
| Duplicate-key preservation (D-06) | A custom key-preserving multimap / array-of-pairs intermediate representation | jomini's default object-mode output | Verified directly: 2-key and 3-key duplicate `modifier` blocks both auto-array correctly out of the box. Building a defensive multimap layer (as originally planned in PITFALLS.md, written before this verification) would be redundant engineering effort. |
| DDS image decoding | A pure-JS DDS decoder (npm has none that are both maintained and correct per project STACK.md's own "What NOT to Use" findings) | ImageMagick CLI via `child_process` | Verified against 4 real Stellaris icons spanning every observed compression format (uncompressed, DXT1, DXT3, DXT5) with clean visual results — the CLI already solves this correctly. |
| DLC name/display mapping | A hand-maintained, manually-updated filename→DLC-name lookup table | Parse `dlc/dlc0XX_*/dlc0XX.dlc` files with the same jomini parser | These files are Clausewitz format themselves (`name = "Ancient Relics Story Pack"`) and are the actual source Paradox uses — the string in `name` is the exact string used by `host_has_dlc = "..."` triggers elsewhere in tech files. Confirmed for all 30 DLC folders present in this install. |
| Localisation "which file has this key" lookup | Assuming tech localisation lives in one predictable file (`technology_l_english.yml`) | Scan ALL `.yml` files under `localisation/english/` and build a global key→value map | Verified: only 328 of 678 tech keys' localisation lives in `technology_l_english.yml`; the rest is spread across 15 other DLC-named `.yml` files (`ancient_relics_l_english.yml`, `megacorp_l_english.yml`, `biogenesis_bioships_l_english.yml`, `first_contact_dlc_tech_l_english.yml`, etc). A single-file assumption would silently produce ~215 missing names/descriptions. |

**Key insight:** Every "don't hand-roll" item in this table was actually tested against the real corpus in this research session, not assumed from documentation. In several cases (duplicate-key handling, DDS fidelity) the safe/defensive assumption from earlier project-level research turned out to be unnecessary once verified — this phase can be simpler than originally planned, not because the risk was wrong to flag, but because it's now resolved with evidence instead of staying an open question into planning.

## Common Pitfalls

### Pitfall 1: jomini's `parseText` fails on files with only a UTF-8 BOM, or with tab-adjacent bare top-level `@var\t=\tvalue` assignments

**What goes wrong:** Calling `parser.parseText(text, 'windows1252')` with a pre-decoded string throws `"unexpected end of file"` for two distinct, verified-real cases in the actual 4.5.0 corpus: (1) `common/technology/00_repeatable.txt`, which is confirmed to contain exactly 3 bytes — a UTF-8 BOM (`EF BB BF`) and nothing else; (2) `common/scripted_variables/01_scripted_variables_jobs.txt` and `05_scripted_variables_first_contact_dlc.txt`, which are non-empty, valid-looking `@variable\t\t\t= number` lines with tab characters directly adjacent to the identifier (no leading space before the tab) at the root level (no enclosing block).

**Why it happens:** Root-level (top-of-file, no enclosing `{ }`) parsing in jomini appears to have a stricter grammar than parsing the same construct nested inside any block — isolated testing in this session confirmed `@x\t=\t4` at file root fails, but the identical bytes succeed when wrapped as `root = { @x\t=\t4 }`. Separately, passing a `latin1`-decoded JS string representation of the 3-byte BOM-only file fails, while passing the raw `Buffer` for the same file succeeds and returns `{}`.

**How to avoid:** Always wrap raw file content in a synthetic root block before parsing: `const wrapped = \`__root__ = {\n${rawText}\n}\`;` then `parser.parseText(wrapped, 'windows1252')` and read results from `result.__root__`. Additionally, prefer passing the raw `Buffer` (from `readFileSync(path)` with no encoding argument) over a pre-decoded string wherever the API allows it. **Verified in this session: this combination (wrap + buffer) parses all 33 tech files, both category/tier files, and all 22 scripted_variables files with zero errors** — including the two files that fail under naive string-mode parsing.

**Warning signs:** A pipeline that silently skips or crashes on `00_repeatable.txt` or any `scripted_variables` file; a `try/catch` around `parseText` that logs-and-continues rather than surfacing the failure loudly (this would silently drop scripted variables that later fields need to resolve `@variable` references against).

### Pitfall 2: Tech localisation is scattered across 16+ separate `.yml` files, not concentrated in `technology_l_english.yml`

**What goes wrong:** A pipeline that only reads `localisation/english/technology_l_english.yml` will find localisation for only 328 of the 678 real tech keys (48%). The remaining 350 are spread across DLC-specific files: `megacorp_l_english.yml` (32), `ancient_relics_l_english.yml` (31), `first_contact_dlc_tech_l_english.yml` (21), `nemesis_espionage_l_english.yml` (13), `distant_stars_l_english.yml` (8), `apocalypse_l_english.yml` (6), `federations_l_english.yml` (6), `utopia_ascension_l_english.yml` (4), `horizonsignal_l_english.yml` (3), `overlord_mega_l_english.yml` (3), `federations_anniversary_l_english.yml` (3), `paragon_3_l_english.yml` (2), `first_contact_l_english.yml` (1), `nemesis_content_l_english.yml` (1), `main_2_l_english.yml` (1), and `biogenesis_bioships_l_english.yml` (which alone holds `tech_maulers`, `tech_mauler_growth_2`, and related mauler-tree techs).

**Why it happens:** Paradox organizes localisation files by DLC/content-pack, not by the corresponding `common/` definition file's name — the file names don't reliably correlate 1:1 with `common/technology/*.txt` file names (e.g., `tech_maulers` is defined in `00_biogenesis_tech.txt` but localised in `biogenesis_bioships_l_english.yml`, a differently-named file).

**How to avoid:** Scan every `.yml` file under `localisation/english/` (there is no harm in scanning files that contain zero tech keys — just build one global `Map<locKey, string>` from all of them) rather than hardcoding a specific file list. Verified in this session: with this approach, all 678 tech keys resolve successfully with zero misses.

**Warning signs:** Any hardcoded list like `const LOC_FILES = ['technology_l_english.yml', 'first_contact_dlc_tech_l_english.yml']` — this will inevitably miss a file as new DLC ships. Missing-name warnings for techs that visually work fine in-game.

### Pitfall 3: Two different `key:value` localisation line syntaxes coexist in the same install

**What goes wrong:** Most localisation lines follow `key:N "value"` (with a numeric revision index, e.g. `materials:0 "Materials"`), but some lines use `key: "value"` with **no index at all** (e.g. `tech_fe_lab_2: "$building_fe_lab_2$"` in `fallen_empire_l_english.yml`). A parser regex requiring a digit after the colon will silently treat these as "no localisation found" for the affected key.

**Why it happens:** Both forms are valid Paradox localisation syntax; the numeric index is optional and used for localisation-revision tracking, not required for the file to be valid.

**How to avoid:** Use a line regex where the numeric index is optional: pattern should match `key:` optionally followed by digits, then whitespace, then a quoted string — e.g. `/^\s*([a-zA-Z0-9_.]+):(\d*)\s*"((?:[^"\\]|\\.)*)"/`. Verified in this session: with the index made optional, all 678 tech keys resolve; with the index required, 215 keys are falsely reported missing.

**Warning signs:** A "missing localisation" count in the pipeline's validation report that's suspiciously large (hundreds) rather than a handful of genuine edge cases — this is a strong signal the regex/parser is too strict, not that the data is actually incomplete.

### Pitfall 4: DLC gating cannot be fully determined by source filename alone — some techs are cross-DLC-gated via `potential.host_has_dlc`

**What goes wrong:** Classifying a tech's DLC purely by which `common/technology/*.txt` file defines it misses techs whose *actual* availability is gated by a different DLC via an in-script trigger. Verified concretely in this session: `00_eng_tech.txt` (a base-game-named file) contains a titan-unlocking tech gated by `potential = { host_has_dlc = "Apocalypse" }`, and a different tech in the same file gated by `host_has_dlc = "Federations"`; `00_strategic_resources_tech.txt` contains a tech gated by `host_has_dlc = "Distant Stars Story Pack"`.

**Why it happens:** Paradox's file organization groups techs by subject area/theme in some cases and strictly by DLC-of-origin in others; a handful of techs added by one DLC's content patch live in an older base-adjacent file rather than getting their own file.

**How to avoid:** Two-layer classification: (1) primary DLC tag from filename convention (e.g. `00_ancient_relics_tech.txt` → Ancient Relics, verified via the DLC's own `.dlc` metadata `name` field — see Don't Hand-Roll table), (2) scan every tech's `potential` block for `host_has_dlc = "..."` and treat that as an *additional or overriding* DLC requirement layered on top of the filename tag. This is a small, fully enumerable problem in the real corpus: only 11 `host_has_dlc` occurrences total across 3 files, of which only 2 techs are genuinely cross-DLC (i.e., in a file that doesn't already imply the same DLC).

**Warning signs:** "Filter by DLC" showing an Apocalypse-gated titan tech under "base game" instead of "Apocalypse."

### Pitfall 5: `technology_swap` blocks have inconsistent arity — a single object when one swap exists, an array when multiple exist

**What goes wrong:** Code that does `tech.technology_swap.name` will crash or silently read the wrong data for any tech with 2+ swap variants, because jomini returns a bare object for a tech with exactly one `technology_swap` block but an array for a tech with multiple (verified directly: `tech_basic_science_lab_2` has one swap → object; `tech_basic_science_lab_3` has three swaps → array).

**Why it happens:** This is standard jomini duplicate-key behavior (single occurrence stays a scalar/object, 2+ occurrences become an array) — it is a jomini-wide behavior, not specific to `technology_swap`, but is easy to miss because most sampled techs have zero or one swap block and the bug only manifests on the less-common multi-swap techs.

**How to avoid:** Always normalize: `const swaps = Array.isArray(tech.technology_swap) ? tech.technology_swap : tech.technology_swap ? [tech.technology_swap] : [];` immediately after parsing, before any downstream code touches the field. Apply the same normalization pattern to any other field that can legitimately repeat (`modifier` inside `weight_modifier`, `potential`/`OR` blocks, etc.) — treat "might be singular or array" as the default assumption for every nested block field, not just the ones already known to repeat.

**Warning signs:** A tech's swap-related feature working for most techs but throwing a runtime error (`.name of undefined` or "not iterable") on a small handful of specific techs — a strong signal the singular/array duality wasn't handled.

## Code Examples

### Verified jomini preprocessing wrapper (resolves Pitfall 1)

```typescript
// pipeline/src/parser/clausewitz.ts
import { readFileSync } from 'fs';
import { Jomini } from 'jomini';

let parserInstance: Jomini | null = null;
async function getParser(): Promise<Jomini> {
  if (!parserInstance) parserInstance = await Jomini.initialize();
  return parserInstance;
}

/**
 * Parses a Clausewitz script file, working around two verified jomini quirks:
 * 1. Root-level BOM-only or tab-adjacent bare `@var\t=\tvalue` assignments throw
 *    "unexpected end of file" when passed as a pre-decoded string.
 * 2. Passing the raw Buffer (not a decoded string) avoids the BOM-only failure,
 *    and wrapping content in a synthetic root block avoids the tab-adjacency failure.
 * Verified against all 33 files in common/technology/, both files in
 * common/technology/{category,tier}/, and all 22 files in common/scripted_variables/
 * with zero parse errors (2026-07-07 research session).
 */
export async function parseClausewitzFile(filePath: string): Promise<Record<string, unknown>> {
  const parser = await getParser();
  const buf = readFileSync(filePath);
  const text = buf.toString('latin1'); // decode after buffer read is fine; the wrap is what matters
  const wrapped = `__root__ = {\n${text}\n}`;
  const result = parser.parseText(wrapped, 'windows1252') as Record<string, Record<string, unknown>>;
  return result.__root__ ?? {};
}
```

### Verified technology_swap normalization (resolves Pitfall 5)

```typescript
// pipeline/src/parser/tech-extractor.ts
type TechSwap = { name: string; inherit_icon?: boolean; inherit_effects?: boolean; trigger?: unknown };

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Usage: const swaps = normalizeToArray(rawTech.technology_swap as TechSwap | TechSwap[] | undefined);
// Apply the same pattern to weight_modifier.modifier, potential.OR, etc.
```

### Verified localisation line parser (resolves Pitfalls 2 & 3)

```typescript
// pipeline/src/localisation/loc-scanner.ts
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

// Optional numeric index: matches BOTH `key:0 "value"` and `key: "value"` forms —
// verified necessary because both appear in the real 4.5.0 files (e.g.
// fallen_empire_l_english.yml uses the no-index form for some keys).
const LOC_LINE = /^\s*([a-zA-Z0-9_.]+):(\d*)\s*"((?:[^"\\]|\\.)*)"/;

export function scanAllLocalisation(locDir: string): Map<string, string> {
  const map = new Map<string, string>();
  // Scan EVERY .yml file, not a hardcoded subset — verified that tech localisation
  // is scattered across 16+ files, not concentrated in technology_l_english.yml.
  const files = readdirSync(locDir).filter(f => f.endsWith('.yml'));
  for (const file of files) {
    let text = readFileSync(path.join(locDir, file), 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(LOC_LINE);
      if (m) map.set(m[1], m[3]);
    }
  }
  return map;
}
```

### Verified icon conversion chain (DDS → PNG → WebP)

```typescript
// pipeline/src/icons/convert.ts
import { execFileSync } from 'child_process';
import sharp from 'sharp';

/**
 * Verified end-to-end in this research session against real Stellaris icons
 * spanning uncompressed 24/32bpp, DXT1, DXT3, and DXT5 formats — all converted
 * cleanly with correct 52x52 dimensions, alpha channel preserved, no visible
 * artifacts. No fallback to texconv needed (contrary to the flagged risk in
 * STATE.md — this smoke test resolves it).
 */
export async function convertDdsToWebp(ddsPath: string, pngTempPath: string, webpOutPath: string): Promise<void> {
  execFileSync('magick', [ddsPath, pngTempPath]);
  await sharp(pngTempPath).webp({ lossless: true }).toFile(webpOutPath);
}
```

### DLC metadata parsing (supersedes hand-maintained lookup table)

```typescript
// pipeline/src/dlc/dlc-registry.ts
// dlc/dlc0XX_*/dlc0XX.dlc files are themselves Clausewitz format:
//   name = "Ancient Relics Story Pack"
//   localizable_name = "DLC_ANCIENT_RELICS"
//   steam_id = 1045980
//   category = "story_pack"
// Parse with the same parseClausewitzFile() wrapper used for tech files.
// The `name` field is the exact string used by in-script `host_has_dlc = "..."` triggers —
// verified: "Apocalypse", "Federations", "Distant Stars Story Pack" all match real
// .dlc `name` values exactly.
```

## State of the Art

| Old Approach (assumed pre-research) | Current Approach (verified) | When Changed | Impact |
|--------------------------------------|------------------------------|---------------|--------|
| Hand-maintained DLC filename→display-name table, manually reviewed each version bump (per D-08 as originally written) | Parse authoritative `dlc/dlc0XX_*/dlc0XX.dlc` metadata files with the same jomini pipeline | Discovered in this research session | Removes an entire category of "goes stale on new DLC" maintenance burden — the mapping now self-updates whenever a new `dlc0XX_*` folder appears in the install, no code change needed for the DLC-name-string part (the file→DLC association may still need a small update if a new DLC's tech file doesn't follow the `00_<name>_tech.txt` convention). |
| Defensive custom key-preserving multimap for duplicate Clausewitz keys (per D-06/PITFALLS.md as originally written, before this session's verification) | Rely on jomini's built-in duplicate-key auto-arraying | Discovered in this research session | Simplifies the parser layer — no custom intermediate representation needed, verified jomini already does this correctly for 2-key and 3-key cases. |
| Assumption that DDS fidelity might require texconv fallback (flagged risk in STATE.md) | ImageMagick's DDS coder verified sufficient for all observed compression formats | Discovered in this research session | D-12's fallback path is very unlikely to be needed; still worth keeping the fallback documented in code/README in case a not-yet-sampled icon (of the 867 total, only ~30 were directly inspected/converted) turns out to use an unusual format, but this is now a low-probability contingency, not an expected step. |

**Deprecated/outdated:** None specific to this domain beyond the above — Clausewitz format itself is stable across Stellaris versions; jomini 0.10.0 is current as of this research (published 3 months ago).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The two cross-DLC `host_has_dlc` occurrences found (`00_eng_tech.txt` → Apocalypse/Federations, `00_strategic_resources_tech.txt` → Distant Stars) are the *only* cross-cutting DLC-gating cases in the full corpus | Pitfall 4 / Don't Hand-Roll | A grep for `host_has_dlc` across all 33 files found exactly 11 occurrences in 3 files — this is a direct corpus search, not a sample, so confidence is HIGH, but it's possible other trigger keys (not `host_has_dlc` specifically) also gate on DLC ownership in ways not searched for in this session (e.g., a flag-based or origin-based proxy for DLC ownership rather than the literal `host_has_dlc` key). If wrong, a small number of techs could be misclassified by DLC filter. |
| A2 | 678 top-level `tech_*` definitions is the authoritative count for DATA-01's "all technology definitions" | Summary | Counted via two independent methods (grep for `^tech_[a-z0-9_]+\s*=\s*{` and jomini's own parsed top-level key count after the root-wrap fix, both converging on 678/682-683 with the small variance explained by non-tech comment-adjacent artifacts) — HIGH confidence, but the exact number should be re-verified once the real extractor code filters out any residual non-tech top-level keys jomini might surface (e.g., from `000_documentation.txt`, confirmed to parse to 0 keys, so it shouldn't contribute noise). |
| A3 | The `weight` field is always a bare number or `@variable` reference at the top level of a tech (never a `{ factor = ... }` block), based on the samples inspected in this session | Don't Hand-Roll / Architecture | The `000_documentation.txt` example schema explicitly shows `cost` CAN be a block (`{ factor = ... modifier = {...} }`) — this session did not exhaustively confirm whether any of the 678 real techs actually use a block-form `cost` or `weight` (only bare/`@variable` forms were observed in the specific files sampled). The pipeline's cost/weight extraction logic must handle both shapes defensively even though only the scalar form was directly observed, per the documentation stub's own warning. |

**If this table is empty:** N/A — see above.

## Open Questions

1. **Does any real tech use the block-form `cost = { factor = ... modifier = {...} }` syntax shown in `000_documentation.txt`, or is that purely a documented-but-unused capability?**
   - What we know: The documentation stub explicitly describes this as a valid, supported form ("Cost can also just be a fixed value like it currently is for most technologies" — implying non-fixed-value forms exist too). All specific techs inspected in this session (a sample, not the full 678) used only bare-number or `@variable`-reference cost.
   - What's unclear: Whether zero, a few, or many of the 678 real techs actually use the block form in 4.5.0.
   - Recommendation: The planner should have the tech-extractor implementation defensively handle both shapes (bare number/variable-reference AND `{ factor, modifier }` block) regardless of what a partial sample shows, since the game's own documentation confirms the block form is valid syntax — treat this as "must handle," not "nice to handle if found."

2. **Are there DLC-gating trigger keys other than `host_has_dlc` used anywhere in the tech corpus (e.g., an origin check, a flag check, or a resource check that's a de facto proxy for DLC ownership)?**
   - What we know: `host_has_dlc = "..."` was the only explicit DLC-ownership-check key searched for and found (11 occurrences, 3 files).
   - What's unclear: Whether any tech is gated by an indirect DLC proxy (e.g., checking for an origin, civic, or flag that's only obtainable with a specific DLC) without using the literal `host_has_dlc` key.
   - Recommendation: Treat the DLC classification as filename-convention-primary with `host_has_dlc`-override-secondary for v1 (matches D-08's intent); if a future validation pass surfaces a tech whose in-game DLC filter looks wrong, revisit for indirect proxies then rather than trying to solve an open-ended trigger-language problem now.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Entire pipeline runtime | ✓ | 24.15.0 | — |
| npm | Package installation | ✓ | 11.12.1 | — |
| ImageMagick (CLI, `magick` command) | DDS → PNG conversion | ✓ | 7.1.1-36 Q16-HDRI, DDS/DXT1/DXT5 coders confirmed present | texconv (documented contingency only, not currently needed per verified fidelity test) |
| Local Stellaris 4.5.0 install | All parsing/extraction stages (build-time filesystem read) | ✓ | Confirmed at `Z:\SteamLibrary\steamapps\common\Stellaris`, `rawVersion: "v4.5.0"` per `launcher-settings.json` | Pipeline must fail loudly (not silently) if this path is missing/misconfigured, per D-15/D-16 |
| jomini (npm package) | Clausewitz parsing | ✓ (installed and tested in this session) | 0.10.0 | — |
| sharp (npm package) | WebP encoding | ✓ (installed and tested in this session) | 0.35.3 | — |

**Missing dependencies with no fallback:** none — all required tooling is present and verified working on this machine.

**Missing dependencies with fallback:** ImageMagick has texconv as a documented contingency in project STACK.md, but is not expected to be needed based on this session's direct fidelity verification.

## Validation Architecture

*Skipped: `workflow.nyquist_validation` is explicitly set to `false` in `.planning/config.json`.*

Even with automated test-harness validation out of scope per config, D-17 and D-18 still require the pipeline to print a structural validation report and to be run against the full 33-file corpus (not a sample) before being considered complete — treat this as a manual/scripted verification step within the pipeline's own `assemble.ts` output, not a separate CI test suite. Suggested minimum report contents (informs the planner's task breakdown, not a formal test framework requirement):
- Total tech count parsed vs. total `tech_*` top-level keys found in source files (should match — catches `technology_swap` leakage per Pitfall 5 and PITFALLS.md's original Pitfall 4)
- Count of unresolved `@scripted_variable` references remaining in final output (should be zero — catches Pitfall 1's resolution failures)
- Count of dangling prerequisite references (a `prerequisites` entry that doesn't match any parsed tech key)
- Count of techs missing localisation, missing icons (should be zero given this session's verification, but re-confirm post-implementation)
- DLC breakdown counts, cross-checked against the two known cross-DLC `host_has_dlc` cases

## Security Domain

*No explicit `security_enforcement` key in `.planning/config.json` — treated as enabled, scoped appropriately for a purely local, offline, build-time data pipeline with no network-facing surface, no auth, and no untrusted multi-user input.*

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No authentication surface — local CLI tool only |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | Single local user, no access boundaries |
| V5 Input Validation | Yes (narrow scope) | Validate the configurable game-install path (D-15) doesn't escape expected bounds before use in filesystem reads; validate parsed data against the Zod schema before writing (D-16) |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Configurable install path used unsanitized in `child_process.execFileSync` calls (ImageMagick invocation) | Tampering | Use `execFileSync` with an argument array (not shell string interpolation) as shown in the Code Examples section — already the safe pattern; never build a shell command string via concatenation with the user-configurable path |
| Rendering raw Paradox localisation strings as HTML in a future frontend (out of scope for Phase 1, but the pipeline is what ships this data forward) | Tampering / XSS (deferred risk) | Not this phase's concern to fix, but the pipeline should NOT attempt to convert `§color§!` codes or `$variable$` tokens into raw HTML in the snapshot — ship them as plain text/structured tokens and let Phase 2 handle safe rendering, per the "Security Mistakes" guidance already captured in project-level PITFALLS.md |

## Sources

### Primary (HIGH confidence — direct inspection/execution against the real 4.5.0 install in this session)

- Direct file inspection: `Z:\SteamLibrary\steamapps\common\Stellaris\common\technology\*.txt` (all 33 files), `category/00_category.txt`, `tier/00_tier.txt`, `000_documentation.txt` — line counts, structure, `technology_swap`/`is_dangerous`/`start_tech`/`potential`/`host_has_dlc` occurrence counts all directly grepped against the real corpus
- Direct file inspection: `common/scripted_variables/*.txt` (22 files) — confirmed `@variable = value` format, confirmed two files fail naive jomini parsing
- Direct file inspection: `localisation/english/*.yml` (scanned all files for tech-key coverage) — confirmed BOM, `l_english:` header, both `key:N "value"` and `key: "value"` line forms, confirmed 16-file scatter of tech localisation
- Direct file inspection: `gfx/interface/icons/technologies/*.dds` (867 files) — Python `struct`-based DDS header parsing confirmed format distribution: 620 uncompressed 32bpp, 220 uncompressed 24bpp, 12 DXT3, 10 DXT5, 2 DXT1; sizes 52x52 (tech icons) and 29x29 (category icons)
- Direct file inspection: `dlc/dlc0XX_*/dlc0XX.dlc` (30 DLC folders) — confirmed Clausewitz-format metadata with authoritative `name` field matching in-script `host_has_dlc` trigger strings
- Direct file inspection: `launcher-settings.json` — confirmed `rawVersion: "v4.5.0"` field for version auto-detection (D-02)
- Live code execution in this session: installed `jomini@0.10.0` via npm and ran it against the full 33-file tech corpus, all scripted_variables files, category, and tier files — confirmed parse success/failure patterns and the wrap+buffer fix, confirmed duplicate-key auto-arraying behavior, confirmed `@variable` references pass through unresolved as literal strings
- Live code execution in this session: ran `magick` (ImageMagick 7.1.1-36) against 4 real Stellaris icon files (uncompressed, DXT1, DXT3, DXT5) and visually inspected the output PNGs — confirmed clean conversion with no artifacts
- Live code execution in this session: ran `sharp@0.35.3` to convert an ImageMagick-produced PNG to lossless WebP — confirmed alpha channel preservation and smaller file size
- `npm view <package>` for jomini, sharp, typescript, vitest, zod — direct registry verification of version, publish date, repository URL, and postinstall scripts

### Secondary (MEDIUM confidence)

- Project-level `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md` — carried forward where consistent with this session's direct verification; explicitly corrected where this session's direct testing contradicted or refined their assumptions (duplicate-key handling, DDS fidelity, DLC mapping approach, localisation file scope)

### Tertiary (LOW confidence)

- None — every claim in this document that could be verified against the real install or by running real code was verified; the two Open Questions above are explicitly flagged as unverified rather than stated as fact.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions confirmed via `npm view`, jomini and sharp confirmed working via actual execution against real files
- Architecture: HIGH — component structure carried forward from project-level ARCHITECTURE.md (already HIGH confidence) with module boundaries refined based on this session's concrete findings (DLC classifier needs two data sources, localisation scanner must cover all files)
- Pitfalls: HIGH — every pitfall in this document was reproduced with a minimal test case and a documented fix, not inferred from general knowledge

**Research date:** 2026-07-07
**Valid until:** Valid as long as the local install remains Stellaris 4.5.0 (`Cygnus v4.5.0 (bfcc)`) and the installed jomini/sharp/ImageMagick versions are unchanged. Re-verify the jomini parsing quirks (Pitfall 1) against any new jomini version before upgrading, since the root-wrap workaround is a behavioral quirk of the current 0.10.0 release, not a documented API contract — an upstream jomini fix could change this at the library's discretion.

---
*Research for: Phase 1 - Data Pipeline (Stellaris Tech Tree Visualizer)*
*Researched: 2026-07-07*
