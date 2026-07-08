---
spike: 001
name: sav-extract
type: standard
validates: "Given the .sav, when unzipped + parsed, then we list empire names + each empire's researched techs + identity (authority/ethics/civics/origin/species)"
verdict: VALIDATED
related: []
tags: [save, parsing, jomini]
---

# Spike 001: sav-extract

## What This Validates

Given the Stellaris `.sav` (zip → `gamestate` Clausewitz text), when we parse it, then we can
list the empires with human-readable names, each empire's set of researched techs, and each
empire's identity fields (authority / ethics / civics / origin / species ref) — the raw material
for buckets 1 (researched) and 4 (never, via `potential` gates).

## Research

- **Format:** `.sav` is a plain zip: `gamestate` (68.8 MB Clausewitz text) + `meta` (DLC list +
  `version="Cygnus v4.5.0"`, matching our pipeline exactly). Confirmed via `System.IO.Compression`.
- **Parser:** reused the pipeline's jomini approach (`pipeline/src/parser/clausewitz.ts`) — wrap
  the root in `__root__ = { … }`, parse with `{ encoding: "windows1252" }`. jomini resolved via
  `createRequire` pointed at `pipeline/node_modules` (no separate install).
- **Save structure (confirmed):**
  - `player = { { name="Salmon" country=0 } … }` → human player display name per country id.
  - `country = { 0={ name={key literal} government={type authority civics[] origin} ethos={ethics[]}
    founder_species_ref tech_status={ technology=/level= pairs } } … }`.
  - `tech_status` stores researched techs as **parallel** `technology[]` / `level[]` arrays
    (jomini auto-arrays the repeated keys); zip by index, keep `level >= 1`.

## How to Run

```
NODE_OPTIONS=--max-old-space-size=8192 \
  pipeline/node_modules/.bin/tsx .planning/spikes/001-sav-extract/extract.ts [gamestatePath]
```

Writes `empires.json` (all 123 country entries) and prints an empire table + a join-validation
against `pipeline/data/v4.5.0/tech.json`.

## What to Expect

- Parse timing + heap line, ~10 human players listed first, then AI/FE/caravaneer entries.
- Join validation: player empires' researched keys matched N/N against `tech.json`.

## Investigation Trail

1. **Full-parse baseline.** Tried the simplest thing — full jomini parse of the whole 68.8 MB
   gamestate. Result: **1.9 s, 224 MB heap.** Far lighter than feared; no need for streaming or
   slicing on the server. (Browser memory is a separate question → Spike 004.)
2. **Identity diagnostic.** Dumped country 0's raw keys before trusting field names. Revealed
   `government={type,authority,civics[],origin}` and — the catch — ethics live under
   `ethos={ ethics=[…] }`, **not** `ethos.ethic`. First pass read the wrong key and got empty
   ethics. Fixed to read `ethos.ethics` (kept `ethic` fallback for older saves).
3. **Join validation.** The make-or-break question: do save tech keys match our data? Checked all
   123 empires: **9,198 tech references, 0 unmatched.** Even Fallen Empires' 584-tech lists
   resolve fully. The save↔`tech.json` join needs no remapping.
4. **Name resolution edge.** Human players + literal-named empires resolve cleanly. AI/FE/
   caravaneer names are unresolved tokens (`%ADJ%`, `%ADJECTIVE%`, `NAME_Caravaneer_Home`) that
   need save-side name composition. `country_type` is **not** a country-root field, so FE/marauder
   can't be filtered that way. Deferred — the picker targets human players, who all resolve.

## Results

**VALIDATED.** All three sub-goals met with strong evidence:

| Goal | Result |
|------|--------|
| Empire names | 10 human players extracted via `player→country` map; literal empire names clean |
| Researched techs | `tech_status` zipped correctly; **100% join** to `tech.json` (0/9198 unmatched) |
| Identity for gating | authority, ethics, civics, origin, `founder_species_ref` all present & clean |

**Surprises:**
- Parse is *cheap* (1.9 s / 224 MB) — biggest de-risk of the session; the browser target looks
  more feasible than assumed.
- Perfect key join — no version drift between this 4.5.0 save and our 4.5.0 `tech.json`.

**Gotchas for the build:**
- Ethics key is `ethos.ethics` (array), not `ethos.ethic`.
- `founder_species_ref` can be a huge id (e.g. 16777217) — it indexes a species DB; resolving the
  archetype (machine/lithoid/bio) for species-based gates is deferred to when 002/003 need it.
- Non-player empire name resolution requires save-side token composition — out of scope; flag
  non-literal names in the picker rather than mis-displaying `%ADJ%`.
