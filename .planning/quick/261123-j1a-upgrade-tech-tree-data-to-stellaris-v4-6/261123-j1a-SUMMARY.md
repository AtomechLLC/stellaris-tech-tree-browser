---
phase: quick-261123-j1a
plan: 01
subsystem: pipeline + app
tags: [data, stellaris-4.6.0, dlc, factions, absolute-ethics]
requires: [quick-260924-qfo, quick-260924-vbv]
provides:
  - pipeline/data/v4.6.0 (Corona Borealis 3d1a): 683 techs, optional factions table, 1442 icons, diff vs v4.5.1
key-files:
  created:
    - pipeline/src/dlc/dlc-triggers.ts
    - pipeline/src/factions/faction-types.ts
    - app/src/lib/empire/labels.ts
    - pipeline/data/v4.6.0/
  modified:
    - pipeline/src/parser/tech-extractor.ts
    - pipeline/src/dlc/dlc-classifier.ts
    - pipeline/src/assemble.ts
    - pipeline/src/schema/tech-snapshot.ts
    - app/src/types/tech-snapshot.ts
    - app/src/components/EmpirePanel.tsx
    - app/src/lib/empire/savLoad.ts
    - app/src/lib/data/fetchSnapshot.ts
    - app/src/components/Header.tsx
    - app/src/lib/graph/weight.ts
completed: 2026-11-23
---

# Quick 261123-j1a: Stellaris v4.6.0 "Corona Borealis" data upgrade

Pipeline now extracts non-`tech_` keys and resolves DLC labels from the game's own scripted triggers. It also emits an optional faction/ideology table and faction icons. v4.6.0 is committed and is the app default, which no longer carries any hard-coded data-version fallback.

## Commits (7, all STOP conditions clear)

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 6579bd8 | test(pipeline): failing tests for scripted DLC triggers and non-tech_ keys |
| 1 GREEN | e7ebebd | fix(pipeline): extract non-tech_-prefixed techs and resolve DLC labels from scripted triggers |
| 2 RED | 673787f | test(pipeline): failing faction-type/ideology resolver tests |
| 2 GREEN | 0be715b | feat(pipeline): faction-type/ideology table + faction icons (optional schema field) |
| 3 | 010d7e6 | chore(pipeline): commit v4.6.0 data snapshot + v4.5.1->v4.6.0 diff |
| 4 RED | c8ca7d5 | test(app): failing tests for absolute ethics, faction extraction and mult weights |
| 4 GREEN | 123d3ef | feat(app): default to manifest-latest data, factions schema mirror, absolute ethics + faction chips, mult weights |

## Snapshot meta

v4.6.0: gameVersion `v4.6.0`, label `Corona Borealis v4.6.0 (3d1a)`, checksum `3d1a`, 683 techs (v4.5.1: 678). Area counts engineering 199, physics 168, society 316. 0 missing names, 0 placeholder icons, 0 dangling prerequisites, no `.tmp.png` left. All 4 force-of-will techs carry dlc `Willpower` (from `has_force_of_will_dlc` in common/scripted_triggers). v4.4.6/v4.5.0/v4.5.1 are untouched.

## Tech diff v4.5.1 -> v4.6.0 (diff.json: 5 added, 0 removed, 25 changed)

Added (5):
- `null_void_beam` (Null Void Beam, physics T2)
- `tech_cultural_envoys` (society T2; name resolves to the dynamic loc `[GetCulturalEnvoyNamePlural]`, shipped verbatim, a cosmetic caveat)
- `tech_galactic_halls` (Galactic Halls, society T2)
- `tech_ideology_projection_1` (Ideological Projection, society T3)
- `tech_ideology_projection_2` (Ideological Amplification, society T4)

Note on `null_void_beam`: it is not `tech_`-prefixed, so older pipelines silently dropped it. The install is now 4.6.0, so whether it is new in 4.6.0 or was already present and dropped in 4.5.1 cannot be verified. It is recorded as "added".

Removed: none.

Genuine 4.6.0 changes to existing techs (field-level): **none**. Every `changed` entry is a DLC-label change (below), so there were no genuine changes to spot-check against game files.

### Pipeline corrections, NOT Paradox changes (25 changed entries, dlc none -> X)

The 25 techs below were mislabeled base-game (dlc null) in v4.5.1 because the filename heuristic cannot see scripted DLC triggers. The new fallback-only third classifier layer fixes them. The What's-new panel will show them as "changed". Their game-file `potential` blocks carry a top-level positive DLC trigger (e.g. `has_megacorp_dlc = yes`). No tech that had a non-null label changed label (verified: 0 relabels).

- Cosmic Storms (10): tech_advanced_industrial_storm_protection, tech_advanced_storm_manipulation, tech_industrial_storm_protection, tech_ship_hull_storm_breaker_1, tech_ship_hull_storm_breaker_2, tech_ship_storm_weapons_1, tech_ship_storm_weapons_2, tech_storm_manipulation, tech_storm_prediction_1, tech_storm_prediction_2
- Shadows of the Shroud (6): tech_alloy_fossilization, tech_cryovault, tech_georadiation_terraforming, tech_living_test_subjects, tech_orbital_maneuvers, tech_pyroclastic_resonation
- Galactic Paragons (2): tech_strike_craft_skrand, tech_xeno_linguistics
- Federations (1): tech_mega_shipyard
- The Machine Age (1): tech_leviathan_techgenesis
- Megacorp (4, **beyond the 20 the plan measured**): tech_interstellar_assembly, tech_matter_decompressor, tech_mega_art, tech_strategic_coordination. Evidence: `common/technology/00_megastructures.txt` potential blocks contain `has_megacorp_dlc = yes` (lines 352, 414, 472, 693).
- Infernals Species Pack (1, **beyond the 20**): tech_volcanic_terraforming. Evidence: `00_soc_tech.txt` line ~2223 `potential = { has_infernals = yes }`.

So 20 + 5 = 25. The 5 extras come from the same data-driven mechanism, backed by game-file evidence, and are not a STOP (no previously-labeled tech changed). The plan's "exactly 20" expectation was an incomplete probe.

## Icon-set parity vs v4.5.1 (v4.6.0: 1442 files; v4.5.1: 1373)

| Category | v4.5.1 | v4.6.0 |
|----------|--------|--------|
| tech (plain names) | 804 | 809 (+5 new techs) |
| ethics (`_ethic_*`) | 22 | 30 (+8 `_ethic_absolute_*`) |
| factions (`_factiontype_*`) | 0 | 41 (all 41 .dds under factions/types; includes all 8 `faction_icons_ideological_*`) |
| civics | 301 | 311 |
| origins | 89 | 92 |
| auth | 79 | 79 |
| ascension perks | 51 | 53 (`_ap_force_of_will`, `_ap_force_of_will_spiritual`) |
| other `_` | 27 | 27 |

Gov icons: auth 79 -> 79, civics 301 -> 311, origins 89 -> 92, so the vbv-style silent loss did not recur. Net +70 added, -1 lost = +69 (1373 -> 1442).

Lost vs v4.5.1: exactly one, `_civic_mindwarden.webp`. Justification: its source `civic_mindwarden.dds` is gone from the install (only `civic_mindwarden_enclave.dds` remains in gfx/interface/icons/governments/civics) and no `civic_mindwarden` id is referenced in common/ any more. All 1372 shared files are byte-identical to v4.5.1 (0 re-rendered).

## Factions table (42 types, 42 with icon, 9 with ideology, 0 resolver warnings)

Ideological factions (key -> ideologies): totalitarian -> authoritarian; progressive -> egalitarian; technologist -> materialist; imperialist -> militarist; prosperity -> pacifist; traditionalist -> spiritualist; xenoist -> xenophile; isolationist -> xenophobe_pacifist; supremacist -> xenophobe_militarist. All 8 ideological icons are referenced by at least one `ideologicalIcon`. totalitarian: `ideologies ["authoritarian"]`, `ideologyEthics ["ethic_fanatic_authoritarian"]`, ideologicalIcon `_factiontype_faction_icons_ideological_authoritarian.webp`.

Remaining entries are secret-society factions expanded from top-level inline_scripts (the_masquerade_*, the_curtain_*, the_grand_dance_*), the cyber_creed_* family, fire_cult, interlink and manifesti. Full dump saved during the run in the scratchpad (`check-out.txt`).

## Absolute-ethic gate-semantics evidence (Task 3 step D)

- The game writes absolute ethics explicitly next to fanatic ones: in `common/technology/` there are 95 `ethic_absolute_militarist` and 95 `ethic_fanatic_militarist` references. In the snapshot, 58 techs carry `ethic_absolute_*` in `weightModifierRaw`, and 0 techs have a fanatic ethic in a weight modifier without the matching absolute one.
- Real block (00_phys_tech.txt line 1178): `modifier = { factor = 1.3  has_ethic = ethic_absolute_militarist }`.
- No tech `potential` gate (normalized `gate`) references `ethic_fanatic_*` or `ethic_absolute_*` at all (0/0), so there is no gate where absolute would need to satisfy a fanatic requirement.
- Conclusion: the app's exact-match `has_ethic` evaluator is already correct. No semantics decision is needed and no STOP.

## Pipeline/app behavior changes

- Tech extraction: every non-`@`, non-`inline_script` top-level key is a tech (extractTech's area/tier throw is the fail-loud guard). `totalKeysFound` now matches 683.
- DLC classification: host_has_dlc -> filename -> scripted-trigger fallback (positive top-level / AND / hidden_trigger / custom_tooltip only; never OR/NOT/NOR). Trigger map is parsed from common/scripted_triggers (no hand-typed table); rejects OR/NOT/trigger-referencing bodies.
- Schema: optional `factions` field, documented in pipeline/SCHEMA.md and mirrored in app types; older snapshots validate unchanged under both schemas.
- App: `resolveDataVersion` throws when the manifest is missing/empty (App already renders its error state); `fetchSnapshot` version is required; Header ethic icon follows the loaded `dataVersion`; `mult` treated as `factor` in weight lines (tech_galactic_halls' own weight line still drops since `exists = ideology`/`is_fanatic` are not describable, which is intended); Saved Empire panel shows a Factions row (names/icons from the snapshot table only) and absolute ethics as "Absolute <Ethic>" (via shared `humanizeId`); Empire Manager keeps a lone absolute ethic (tests for normalizeEthics and serialization added; a grep of EmpireManagerPanel/designSchema/useDesignsSession found no ethic-count or membership validation beyond normalizeEthics).

## Unparsed auxiliary files (warn-and-skip, not a STOP)

- `common/scripted_triggers/10_scripted_triggers_forceofwill.txt` fails jomini parse (as probed). The Willpower trigger lives in 00_scripted_triggers.txt, so labels are unaffected.
- Faction/ideology inline scripts and `.gfx` files: 0 failures, 0 warnings.

## Test literal updates

- `pipeline/test/tech-extractor.test.ts` Test 1 and Test 6 pinned the `tech_` prefix. Both were rewritten (key non-empty/non-`@`; every top-level non-`@` key extracted). This is a test bug the plan called out, not a data change.
- No other pinned literal changed. `npm test` in pipeline: 11 files / 91 tests green (including corpus idempotency on v4.6.0). App: `tsc --noEmit` clean, 18 files / 207 tests green (7 pre-existing skips), `vite build` succeeds. Pipeline tsc: errors identical to the pre-change baseline (no new errors).

## Deviations from Plan

**1. [Rule 3 - Blocking] jomini interleaved-array shape.** The plan said "string followed by null then value is a pair (advance 3)". Applied literally, `["optimize_memory", null, "host_has_dlc", null, "Willpower"]` parses `optimize_memory = host_has_dlc`. `parseDlcTriggerDefs` special-cases the marker (skips it and a following null). Fixed in the same GREEN commit (e7ebebd).

**2. [Info] 25, not 20, DLC corrections.** See above; extras are evidence-backed and clearly marked.

**3. Task 2 test commit.** The RED commit for Task 2 contains only the test file; the GREEN commit contains the six source/doc files (clausewitz.ts, faction-types.ts, schema, assemble.ts, SCHEMA.md).

None of the STOP conditions triggered.

## Spot check (non-blocking)

`cd app && npm run dev`, then open http://localhost:5173/?ver=4.6.0 (dev server binds 0.0.0.0). The picker should default to "Corona Borealis v4.6.0 (3d1a)"; What's new lists the 5 added techs plus the 25 DLC-label corrections; the Galactic Halls card shows the Willpower badge.

## Self-Check: PASSED

All created files exist (dlc-triggers.ts, faction-types.ts, labels.ts, data/v4.6.0/{tech.json,diff.json,icons}); the 7 commits are present in `git log`.
