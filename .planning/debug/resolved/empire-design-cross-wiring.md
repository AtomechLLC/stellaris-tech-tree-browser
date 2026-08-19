---
status: resolved
trigger: "Empire Manager save→design extraction produced an INVALID in-game design ('Nexan Bloom'): wrong/missing origin, missing ethic_gestalt_consciousness, and apparently cross-wired species vs civics data."
created: 2026-08-19T00:00:00Z
updated: 2026-08-19T00:00:00Z
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "There is NO cross-wiring in extractDesignFromCountry. The 'Nexan Bloom' screenshot is a different, live in-game empire; the real defects are (a) ethos plural-key blindness, (b) runtime-only/empty origins."
  confirming_evidence:
    - "sample.sav country 3 ('Nexan Collective') extracts fully self-consistently: MACHINE species 'Nexan' (species_db 5), machine civics, origin_machine, gov_machine_assimilator — every field from country 3."
    - "'Nexan Bloom' IS country 6 of the user's NEW save mpcubecubecubecube5/2246.05.04.sav (started 22:04 today): gov_wilderness, auth_hive_mind, civics [civic_hive_divided_attention, civic_hive_natural_neural_network], origin_wilderness, room wilderness_room, founder_species_ref 7 = AQUATIC 'Nexan' with traits organic/hive_mind/wilderness/rooted/repugnant/aquatic/agrarian + pc_ocean_preference — an EXACT match for the screenshot, including planet 'Acreon'."
    - "The user's designs file NEVER received an app-produced add: live file (181 entries) vs the app's own 22:08 backup (183 entries) differ by exactly the two ARCHIVED removals ('Emberwatch Nomads', 'Qvagh Empire'). No entry named Nexan* exists in either. So the app's output was never loaded in-game."
    - "mpcubecubecubecube5: 72 countries carry ethos.ethics (PLURAL), 0 carry ethos.ethic. mp16: 62 plural, 0 singular. sample.sav (Pegasus v4.4.6): all singular. Current code reads only `ethic` -> ZERO ethics from any current save -> gestalt design with no ethic line."
    - "Game files list 16 non-playable origins (01_origins_non_playable.txt) incl. origin_default_pre_ftl, origin_fallen_empire(_hive), origin_enlightened, origin_separatists — all observed on runtime countries."
    - "root.galaxy.design exists in sample.sav (64 blocks, exact design shape) but is ABSENT from both of the user's current saves — so it must be an opportunistic preference with synthesis fallback."
  falsification_test: "If extraction were cross-wired, country 3's design would contain fields traceable to another country id. It does not — species/name/gov/flag/planet all resolve through country 3's own refs."
  fix_rationale: "Fixes C (dual ethos key + gestalt guarantee) and D (playable-origin mapping) address the two mechanisms that actually make the emitted design invalid in-game. B adds ground-truth extraction where the save carries it."
  blind_spots: "The user's exact in-game repro sequence is unconfirmed (no app-written design ever reached disk); the screenshot is explained but the user's own recollection of which empire they clicked is not independently verifiable."

hypothesis: confirmed (see above)
test: n/a — proceeding to fixes
expecting: n/a
next_action: Implement fixes C, D, B, E, F, G, H, I with tests.

## Symptoms

expected: "Add to my empires" produces a valid, game-loadable custom empire design matching the country the user clicked.
actual: In-game the design ("Nexan Bloom") is INVALID — wrong/missing origin, missing ethic_gestalt_consciousness; screenshot shows civics Divided Attention + Natural Neural Network (hive) with an AQUATIC "Nexan" species (Organic, Hive-Minded, Wilderness, Rooted, Repugnant, Aquatic, Agrarian) and Ocean World "Acreon".
errors: In-game empire-designer validation rejects the design (invalid origin / missing gestalt ethic).
reproduction: Load app/public/data/v4.5.0/sample.sav in the Saved Empire tab, click "Add to my empires" for the Nexan empire, save, load the produced user_empire_designs file in Stellaris.
started: Phase 04 initial implementation (never worked in-game).

## Eliminated

## Evidence

- timestamp: pre-session (measured by orchestrator)
  checked: sample.sav country 126
  found: name %ADJECTIVE%+NAME_Pyorun+Society_Name, gov auth_hive_mind, civics [civic_hive_divided_attention, civic_hive_natural_neural_network], origin "origin_post_apocalyptic", ethos {"ethic":"ethic_gestalt_consciousness"} singular, founder_species_ref 169 → species NAME_Pyorun class HUM portrait humanoid_03.
  implication: Only country with those civics — yet in-game showed aquatic "Nexan". Species/name vs government disagree, OR the clicked design maps to a different country.

- timestamp: pre-session (measured by orchestrator)
  checked: ethos shape across saves
  found: sample.sav uses ethos.ethic (singular scalar); user's MP save uses ethos.ethics (plural array).
  implication: savLoad.ts:172 and designFromSav.ts:275 read ONLY `ethic` → empty ethics on plural-shaped saves.

- timestamp: pre-session (measured by orchestrator)
  checked: runtime origins in save country blocks
  found: origin_default_pre_ftl present on hive countries; wilderness empires carry NO wilderness origin at runtime.
  implication: designFromSav.ts:303 emits runtime-only or empty origin → invalid design.

- timestamp: pre-session (measured by orchestrator)
  checked: root.galaxy.design in sample.sav
  found: ARRAY of 64 design blocks in EXACTLY user_empire_designs shape (key, species+traits, authority, government, planet_class, initializer, room, ethic, civics, origin).
  implication: Ground-truth original designs exist in the save — prefer them over synthesis.

## Resolution

root_cause: |
  Three separate findings.

  (1) NO cross-wiring exists. `extractDesignFromCountry` resolves every field
  through the clicked country's own refs. The "Nexan Bloom" screenshot is a
  live in-game empire — country 6 of the user's NEW save
  `mpcubecubecubecube5/2246.05.04.sav` (started 22:04 the same evening) —
  whose species (species_db 7, AQUATIC "Nexan", traits organic/hive_mind/
  wilderness/rooted/repugnant/aquatic/agrarian) and capital planet "Acreon"
  match the screenshot exactly. The species-name collision with sample.sav's
  MACHINE "Nexan" (same player, Alcareus, reusing a naming theme) is what made
  it look cross-wired. Corroborating: the app's own pre-write backup proves no
  app-produced design ever reached the designs file — live file (181 entries)
  differs from the backup (183) by exactly the two ARCHIVED removals.

  (2) ETHOS KEY BLINDNESS (the actual "missing ethic_gestalt_consciousness").
  `savLoad.ts` and `designFromSav.ts` read only `ethos.ethic`. Measured:
  sample.sav (Pegasus v4.4.6) 132/132 countries singular; the user's current
  saves 72/72 and 62/62 countries PLURAL (`ethos.ethics`), zero singular. So
  every empire extracted from any current save had EMPTY ethics — a gestalt
  design with no ethic line, which the empire editor rejects. This also
  silently emptied `RawEmpire.ethics`, breaking `has_ethic` gate evaluation in
  the Saved Empire tab for those saves.

  (3) RUNTIME-ONLY / EMPTY ORIGINS (the "wrong/missing origin").
  `origin: typeof gov.origin === "string" ? gov.origin : ""` emitted whatever
  the runtime country carried. `common/governments/civics/01_origins_non_playable.txt`
  lists 16 origins that are NOT selectable in the designer (origin_default_pre_ftl,
  origin_fallen_empire[_hive], origin_enlightened, origin_separatists, ...),
  all observed on real countries; an empty string was also reachable.
fix: |
  - readEthos() reads both `ethic` and `ethics` (country + pop-group paths).
  - normalizeEthics() forces exactly ethic_gestalt_consciousness for gestalt
    authorities and strips it from non-gestalt designs.
  - resolveOrigin() maps the 16 runtime-only origins to playable analogues and
    infers origin_wilderness (gov_wilderness / wilderness_room /
    trait_wilderness) instead of ever emitting "".
  - galaxy.design preference: a conservatively-matched stored design block is
    used verbatim (ground truth incl. origin, ethics, secondary_species).
  - CR-01 sanitizeToken/numberLine for every bare-emitted value.
  - CR-02 archive re-baseline after save; WR-01 total save(); WR-02 D-09 on the
    sanitized key; WR-03 relative entry counts.
verification: |
  - Full app suite: 196/196 pass across 17 files (was 3 failing).
  - tsc --noEmit clean; vite build clean; lazy-chunk invariant verified in dist
    (origin_default_pre_ftl only in savLoad chunk, jomini only in its own chunk).
  - Against the user's CURRENT save (mpcubecubecubecube5/2246.05.04.sav):
    72 extractable designs, 12 gestalt, 0 missing the gestalt ethic, 0 with
    empty ethics, 0 with an empty/runtime-only origin. The very empire from the
    screenshot now extracts correctly: "Nexan Bloom" -> auth_hive_mind,
    origin_wilderness, [ethic_gestalt_consciousness], hive civics,
    AQUATIC/aqu7 with the wilderness traits, pc_ocean.
  - Against sample.sav: 17 of 93 designs now come from stored galaxy.design
    blocks; the randomly generated AI empires correctly do not match.
files_changed:
  - app/src/lib/empire/designFromSav.ts
  - app/src/lib/empire/savLoad.ts
  - app/src/lib/empire/designSerialize.ts
  - app/src/lib/empire/useDesignsSession.ts
  - app/src/test/designFromSav.test.ts
  - app/src/test/designSerialize.test.ts
  - app/src/test/designsOutputs.test.ts
  - app/src/test/stageAdd.test.ts
  - app/src/test/realFileRoundtrip.test.ts
