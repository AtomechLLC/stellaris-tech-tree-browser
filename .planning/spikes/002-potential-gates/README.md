---
spike: 002
name: potential-gates
type: standard
validates: "Given the game's tech files, when the pipeline is extended, then each tech's potential block is surfaced as a machine-evaluable gate summary; validated on hive/machine/gestalt cases"
verdict: VALIDATED
related: [001]
tags: [pipeline, gating, potential]
---

# Spike 002: potential-gates

## What This Validates

Can we (a) turn each tech's `potential = {}` block into a machine-evaluable gate summary, and
(b) evaluate it against an empire's identity to decide **"never reachable"** correctly? This is
the bucket that needs data our current `tech.json` doesn't ship — the extractor captures
`potentialRaw` but `assemble.ts` discards it.

## Research

Vocabulary survey (`analyze-gates.ts`) over all 678 techs: **376 have a `potential` block**, using
**56 distinct trigger keys**. jomini parses `potential` into a nested object keyed by combinators
(`NOT`/`NOR`/`OR`/`AND`) with leaf triggers. Real shapes (`dump-potential.ts`):

```
tech_robotic_workers    → NOR{ has_ethic=ethic_gestalt_consciousness, is_individual_machine }
tech_interplanetary_commerce → is_gestalt=no
tech_collective_production_methods → is_hive_empire=true
tech_psionic_theory     → OR{ has_shroud_dlc, NOT{has_ethic=gestalt}, is_active_resolution, has_relic }
                          AND NOT{ has_origin=origin_mindwardens }
```

**Trigger taxonomy (the core design decision):**
- **STATIC** (immutable for the empire's life → a static-false gate = permanent "never"):
  `has_origin`, `is_gestalt`, `is_hive_empire`, `is_machine_empire`, all `has_*_dlc`,
  `has_ethic=ethic_gestalt_consciousness`.
- **MONOTONIC** (false→true possible, true→false ~never): `is_individual_machine`,
  `has_ascension_perk`, `has_technology`, `has_tradition`, `country_uses_bio_ships`. If currently
  true, pinned true.
- **DYNAMIC** (mutable both ways / situational): other ethics, `has_civic`, `has_country_flag`,
  `is_active_resolution`, `has_relic`, … → treated as free variables.

## How to Run

```
pipeline/node_modules/.bin/tsx .planning/spikes/002-potential-gates/analyze-gates.ts   # vocab survey
pipeline/node_modules/.bin/tsx .planning/spikes/002-potential-gates/run-gates.ts       # build + assert
```

`run-gates.ts` writes `tech-gates.json` (`{ prerequisites, gate }` per tech) and prints per-empire
"never" counts + known-case assertions.

## What to Expect

- `tech-gates.json` with 376 gates. Per-empire never counts. Assertion block ending `N/N passed`.

## Investigation Trail

1. **Vocabulary first.** Tallied every trigger before designing. 87 techs gate on
   `country_uses_bio_ships`, 58 `is_nomadic`, 38 `is_wilderness_empire` — the long tail is
   DLC/origin/authority checks. This told me a leaf-classification scheme (static/dynamic) was the
   crux, not the parse.
2. **Normalizer.** jomini's combinator-keyed objects → explicit AND/OR/NOT/NOR tree of leaves,
   each tagged static. Handles duplicate keys (jomini arrays them) and nested combinators.
3. **"Never" = satisfiability, not evaluation.** A tech is never-reachable iff its gate is
   **unsatisfiable** with STATIC leaves fixed to this empire and DYNAMIC leaves free. Implemented
   `canBeTrue`/`canBeFalse` recursion (correct 2-valued SAT over the fixed/free split). "passesNow"
   is a separate Kleene 3-valued eval against current state.
4. **The monotonic discovery (failing assertion → model fix).** First pass: 7/8. CUBE
   (`is_individual_machine=true`) + `tech_robotic_workers` (`NOR{gestalt, individual_machine}`)
   came back "open" — SAT treated `is_individual_machine` as free, i.e. assumed CUBE could *un*-become
   an individual-machine empire. That's wrong: the flag is **monotonic**. Added a MONOTONIC class
   pinned true when currently true → **8/8**, and CUBE correctly gained the robotic/droid/synthetic
   workers line (never 16→24).
5. **False-positive audit.** Dumped a regular empire's full 16-tech never list: every one is a
   genuine gestalt/hive/machine-only or origin-locked tech (`node_reformatting`→machine,
   `node_culling`→hive, `critter_feeder`→`origin_fruitful`). Zero false positives.

## Results

**VALIDATED.** 8/8 known-case assertions pass. Per-empire "never" counts are sensible and match
game rules:

| Empire | Type | never (gate-only) |
|--------|------|-------------------|
| Regular empires (7 players) | non-gestalt | **16** (gestalt/hive/machine/origin-locked) |
| CUBE-CUBE-CUBE-CUBE | individual-machine | **24** (+ robotic/droid/synthetic workers) |
| Nexan Collective | machine intelligence | **45** (locked out of most regular-empire tech) |

**Surprises / signal for the build:**
- "Never" must be **satisfiability**, not truth evaluation — the OR-with-DLC cases (psionic_theory)
  would be mis-flagged by naive evaluation, and the monotonic cases (individual-machine) need the
  fixed-vs-free split. This is the key algorithmic finding.
- The normalizer is small and the raw material (`potentialRaw`) is **already extracted** — folding
  this into the real pipeline is just: add a `gate` field to `TechSchema`, call `normalizePotential`
  in `assemble.ts`. Low risk, well-scoped.

**Known gaps (documented, safe direction — we under-report "never", never over-report):**
- **DLC gates assumed owned** (this save owns ~every DLC). Saves missing DLC need a per-DLC
  trigger→name map checked against `meta.required_dlcs`.
- **`country_uses_bio_ships` (87 techs — the most common gate)** is dynamic and not yet detected
  from the save, so bio-ship weapon/defense techs currently read as reachable for everyone.
  Detecting bio-ship adoption from the save would tighten this — biggest remaining coverage gap.
- **Ascension perks / traditions / country flags not extracted** from the save, so gates on them
  stay "free" (conservatively not-never). Extracting them (spike 001 already sees the country
  block) would sharpen both "never" and "available now".
