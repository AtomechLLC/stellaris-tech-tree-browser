# Phase 1: Data Pipeline - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

A single command turns the local Stellaris 4.5.0 install (`Z:\SteamLibrary\steamapps\common\Stellaris`) into an accurate, versioned JSON snapshot containing every technology's full data (tier, area, category, cost, weight, prerequisites, unlocks, DLC gating, flags — with `@scripted_variables` resolved) plus web-ready icons converted from the game's `.dds` assets. Covers DATA-01 through DATA-05. No frontend/rendering work in this phase — the snapshot schema is the contract Phase 2 builds against.

</domain>

<decisions>
## Implementation Decisions

### Snapshot contract & versioning
- **D-01:** One combined snapshot per game version: `data/v{version}/tech.json` plus `data/v{version}/icons/` — no per-area file splitting (unnecessary at ~600-900 techs per architecture research).
- **D-02:** Game version is auto-detected from `launcher-settings.json` (`rawVersion`, e.g. `v4.5.0`) — never hand-entered.
- **D-03:** Snapshot includes a `meta` block: game version, generation date, tech/area/tier counts, source file list. Content ordering is deterministic (sorted by tech key) so re-runs produce diff-stable output (DATA-05 idempotency).
- **D-04:** The JSON schema is the hard pipeline/frontend boundary. Schema should be documented (even minimally) so Phase 2 can develop against fixture data before/independently of pipeline runs.

### Parsed data depth (v1)
- **D-05:** `unlocks` in v1 = what can be extracted from the tech files themselves plus localisation (modifier text, feature-unlock strings) plus computed reverse edges ("leads to": techs that list this tech as a prerequisite). NO cross-referencing of buildings/components/ship files — that is UNLK-01, deferred to v2.
- **D-06:** Weight is captured as base weight (flat number) for display, but the raw `weight_modifier` blocks must be parsed structurally and preserved in the snapshot (not discarded, not flattened) — WGHT-01 (v2) will need them, and flattening incorrectly would misrepresent game data. Duplicate `modifier` keys must be preserved as arrays, never collapsed into objects.
- **D-07:** `@scripted_variables` (e.g. `cost = @tier2cost1`) are resolved to concrete numbers from `common/scripted_variables/`, per DATA-02. Inline `@[ ]` math must be handled or explicitly detected-and-reported.
- **D-08:** DLC gating uses an explicit, maintained mapping table (source filename → DLC, e.g. `00_ancient_relics_tech.txt` → Ancient Relics) cross-checked against trigger-based gating in tech definitions — not derived logic alone (per pitfalls research).
- **D-09:** Flags (rare / dangerous / repeatable / starting) are parsed and stored in the snapshot now even though visual flag display (FLAG-01) is v2 — the data costs nothing extra and avoids a pipeline re-run later.

### Icon pipeline
- **D-10:** Icons resolve by naming convention (`gfx/interface/icons/technologies/{tech_key}.dds` etc.) since tech entries mostly have no `icon =` field; `technology_swap` blocks provide conditional aliases — export base icon per tech, and swap-variant icons alongside where present.
- **D-11:** Output format: WebP (lossless) at native resolution, named by tech key. Fall back to PNG only if WebP fidelity issues appear.
- **D-12:** Conversion via ImageMagick CLI (DDS coder) piped through sharp for encoding — BUT run an early smoke-test on a handful of real Stellaris icons first; if fidelity artifacts appear, fall back to texconv (this is a flagged unverified risk in STATE.md).
- **D-13:** Missing icon for a tech = warning + shipped placeholder icon, not a pipeline failure.

### Pipeline ergonomics & failure policy
- **D-14:** Single command (npm script, e.g. `npm run build:data`) performs the entire parse → resolve → convert → assemble → validate flow with no manual steps (DATA-05).
- **D-15:** Game install path is configurable (config file with env/CLI override), defaulting to `Z:\SteamLibrary\steamapps\common\Stellaris`. Never hardcode the path inside pipeline logic.
- **D-16:** Strict-fail on structural errors: unparseable tech file, unresolved prerequisite ID, unresolved scripted variable used in a required field, missing localisation for a tech name. Warn-and-report on cosmetic gaps: missing icon, missing description string.
- **D-17:** Pipeline prints a validation report at the end: tech counts per area/tier, DLC breakdown, unresolved references, missing icons/localisation — so a future game-patch run immediately shows what changed or broke.
- **D-18:** Pipeline is Node.js using jomini (WASM Clausewitz parser) per stack research — with a documented preprocessing step for `@variable` references and `hsv{}` syntax that jomini doesn't natively handle. Validate against the FULL 33-file corpus, not a sample (per pitfalls research: full-scale-only bugs sank the reference tool).

### Claude's Discretion
- Exact JSON field naming and nesting within the schema (as long as D-01…D-09 content is present and documented).
- Internal pipeline module structure and intermediate representations.
- Choice of test framework / validation harness for parser corpus tests.
- Exact placeholder icon design.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research (project-level, informs all Phase 1 decisions)
- `.planning/research/SUMMARY.md` — synthesized findings, phase implications, flagged risks
- `.planning/research/STACK.md` — prescriptive stack: jomini 0.10.0, ImageMagick + sharp 0.35.3, versions and known gotchas
- `.planning/research/ARCHITECTURE.md` — pipeline stage boundaries, data flow, build order, snapshot-as-contract design
- `.planning/research/PITFALLS.md` — Clausewitz parsing edge cases, key-preservation requirement, staleness failure analysis, phase mapping

### Requirements & state
- `.planning/REQUIREMENTS.md` — DATA-01…DATA-05 (this phase's scope)
- `.planning/STATE.md` — Blockers/Concerns: jomini corpus validation, DDS fidelity verification flags

### Game data (external source of truth, read-only)
- `Z:\SteamLibrary\steamapps\common\Stellaris\common\technology\` — 33 tech definition files + `category/` + `tier/` subdirs
- `Z:\SteamLibrary\steamapps\common\Stellaris\common\scripted_variables\` — `@variable` definitions needed for cost/weight resolution
- `Z:\SteamLibrary\steamapps\common\Stellaris\localisation\english\` — tech names/descriptions
- `Z:\SteamLibrary\steamapps\common\Stellaris\gfx\interface\icons\technologies\` — `.dds` icon assets
- `Z:\SteamLibrary\steamapps\common\Stellaris\launcher-settings.json` — game version detection (`rawVersion`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield repository (contains only `.planning/` and `CLAUDE.md`). This phase creates the first code.

### Established Patterns
- None yet — this phase establishes them. Pipeline conventions chosen here (module layout, config handling, validation reporting) become the project's patterns.

### Integration Points
- Output contract: `data/v{version}/tech.json` + `data/v{version}/icons/` consumed by Phase 2 frontend. Schema documentation is the handoff artifact.

</code_context>

<specifics>
## Specific Ideas

- The reference anti-example (bloodstainedcrow.github.io/stellaris-tech-tree) died from a manual per-version pipeline — the single-command regeneration requirement (D-14) is the direct countermeasure and should be treated as the phase's most important property after data correctness.
- User's stated pain: "data is dramatically out of date" — accuracy against the real 4.5.0 install is the phase's definition of success, verified against the game files themselves, not against other community tools.

</specifics>

<deferred>
## Deferred Ideas

- Deep unlocks cross-referencing (buildings/components/ships) — UNLK-01, v2 (already in STATE.md Deferred Items)
- Structured weight-modifier *display* — WGHT-01, v2 (pipeline preserves the data now per D-06; UI display deferred)
- All other v2 items tracked in STATE.md Deferred Items table

</deferred>

---

*Phase: 1-Data Pipeline*
*Context gathered: 2026-07-07*
