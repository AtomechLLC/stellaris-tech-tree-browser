---
phase: quick-261123-j1a
verified: 2026-11-23
status: passed
score: 11/11 must-haves verified
---

# Quick Task 261123-j1a Verification: v4.6.0 Corona Borealis data upgrade

**Goal:** upgrade the tech-tree data to v4.6.0 (3d1a), map the Willpower DLC, add faction and absolute-ethic support, and remove hard-coded v4.5.0 fallbacks.

I checked the committed snapshot and app source directly. I did not re-run the pipeline build. The orchestrator confirmed the test suites and tsc separately.

## Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | v4.6.0 snapshot meta and tech count | VERIFIED | gameVersion v4.6.0, label "Corona Borealis v4.6.0 (3d1a)", checksum 3d1a, techCount 683 and 683 keys. Every v4.5.1 key is present (0 lost). 0 techs without a name, 0 placeholder or missing icons. |
| 2 | 5 new techs present | VERIFIED | tech_galactic_halls, tech_ideology_projection_1, tech_ideology_projection_2, tech_cultural_envoys and null_void_beam are all present, each with its own icon file that exists. |
| 3 | Willpower DLC label | VERIFIED | Exactly the 4 force-of-will techs carry dlc "Willpower". null_void_beam is null (base game). The label comes from the scripted-trigger map (dlc-triggers.ts). |
| 4 | DLC classifier is fallback-only | VERIFIED | 0 techs that had a non-null dlc in v4.5.1 changed label. 25 techs went from null to a label. 20 are the plan's measured set. The other 5 are legitimate and documented in the SUMMARY. Four are Megacorp (interstellar_assembly, matter_decompressor, mega_art, strategic_coordination). In the game files, `00_megastructures.txt` has `has_megacorp_dlc = yes` in each potential, and `has_megacorp_dlc` is defined as `host_has_dlc = "Megacorp"`. One is tech_volcanic_terraforming, labelled Infernals Species Pack; `00_soc_tech.txt` has `has_infernals = yes`, defined as `host_has_dlc = "Infernals Species Pack"`. These are correct classifier corrections, not regressions. |
| 5 | Icon set | VERIFIED | The only icon lost against v4.5.1 is `_civic_mindwarden.webp`. Its source `civic_mindwarden.dds` is gone from the install, and only `civic_mindwarden_enclave.dds` remains. There are 8 `_ethic_absolute_*.webp`. There are 41 `_factiontype_*.webp`, equal to the 41 .dds files in the install, and 8 of them are `_factiontype_faction_icons_ideological_*`. |
| 6 | Optional factions table, older snapshots valid | VERIFIED | v4.6.0 has 42 faction entries, all with icons, and 9 with ideologies. totalitarian maps to ideologies [authoritarian] and ideologicalIcon `_factiontype_faction_icons_ideological_authoritarian.webp`. The schema line is `factions: z.record(z.string(), FactionTypeSchema).optional()` (app mirror, line 127). v4.4.6, v4.5.0 and v4.5.1 have no `factions` key. The orchestrator confirmed snapshots.test and the app tests pass. |
| 7 | diff.json | VERIFIED | from v4.5.1, to v4.6.0, 5 added, 0 removed, 25 changed (the classifier corrections plus genuine changes). |
| 8 | App defaults to v4.6.0 with no hard-coded fallback | VERIFIED | versions.json has latest v4.6.0. resolveDataVersion has no `?? "v4.5.0"`, and fetchVersionManifest's doc comment says the app has no hard-coded default. A grep of non-test app source for `v4.x.y` finds only comments (categories.ts, grants.ts, designFromSav.ts, the types doc comment and a doc line in fetchSnapshot.ts). The Header ethic icon is built from `dataVersion`, not a constant. |
| 9 | Absolute ethics and Factions row in the Saved Empire panel | VERIFIED (by structure and tests) | The factionTypes key link is wired and the app vitest run (214/214) includes v46Empire tests. This was not re-inspected visually; see the optional spot-check below. |
| 10 | Empire Manager keeps a single absolute ethic | VERIFIED (by tests) | The regression tests for normalizeEthics and serializeDesignEntry are in v46Empire.test.ts and pass per the orchestrator. |
| 11 | `mult` renders as a multiplier | VERIFIED | weight.ts has `SKIP_KEYS` containing "mult" and `const factor = mod.factor ?? mod.mult`. |

## Other checks

- **Older snapshots:** `git diff origin/main` over pipeline/data/v4.4.6, v4.5.0 and v4.5.1 is empty.
- **Uncommitted working-tree change:** `pipeline/data/v4.6.0/tech.json` is modified relative to HEAD, but only `meta.generatedAt` differs (a rebuild timestamp). This is harmless. Revert it or commit it as you prefer.
- **Gate semantics:** the SUMMARY says the game writes absolute ethics explicitly in gates. The plan's STOP condition was not triggered.

## Anti-patterns

No TBD, FIXME or XXX blockers were found in the files I inspected.

## Optional human spot-check (non-blocking)

Load the app with a 4.6.0 save and confirm the absolute-ethic chip icon and label render in the Saved Empire settings panel. No 4.6.0 save was available locally, so this was covered by unit tests only.

## Gaps

None.
