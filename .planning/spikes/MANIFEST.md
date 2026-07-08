# Spike Manifest

## Idea

Read a Stellaris `.sav` file (a zip containing a `gamestate` Clausewitz text file), scrape out
the empire (country) names, let the user pick an empire, then classify **every** tech in the
game into buckets relative to that empire: **already researched**, **available now**,
**reachable later**, and **never reachable** (permanently gated out by DLC, authority,
ethics/civics, origin, or species). First iteration may run server-side (Node); the final target
runs fully in-browser — the user drops a `.sav` in, it unzips + parses + classifies client-side.

Save under test: `2240.08.03.sav` (mp game "mp_CUBE-CUBE-CUBE-CUBE 11"), **Cygnus v4.5.0** —
matches the existing pipeline's `tech.json` exactly. Existing pipeline: `pipeline/` →
`data/v{version}/tech.json`.

## Requirements

Design decisions locked in from the user during spiking. Non-negotiable for the real build.

- **Four buckets, not three.** The "unlocked" middle bucket splits into **available now**
  (direct prerequisites all met) and **reachable later** (full prereq chain satisfiable, but not
  yet). Final taxonomy: `researched` / `available-now` / `reachable-later` / `never`.
- **Model real `potential` gates.** "Never reachable" must go beyond DLC + prerequisites and
  evaluate each tech's `potential = {}` block against the empire's actual identity (authority /
  ethics / civics / origin / species). This requires **extending the pipeline** to surface a
  machine-evaluable gate summary into `tech.json` (today the extractor captures `potentialRaw`
  but `assemble.ts` discards it after DLC classification).
- **Browser is the final target.** Server-side Node is acceptable for early spikes, but the
  parse strategy must have a credible path to running client-side on a 72 MB gamestate.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | sav-extract | standard | Given the `.sav`, when unzipped + parsed, then we list empire names + each empire's researched techs + identity (authority/ethics/civics/origin/species) | ✅ VALIDATED | save, parsing, jomini |
| 002 | potential-gates | standard | Given the game's tech files, when the pipeline is extended, then each tech's `potential` block is surfaced as a machine-evaluable gate summary in `tech.json`; validated on hive/machine/gestalt cases | PENDING | pipeline, gating, potential |
| 003 | classify-demo | standard | Given empire identity (001) + gate-annotated `tech.json` (002), when classified, then every tech lands in researched / available-now / reachable-later / never, shown in a pick-an-empire demo | PENDING | classification, ui, demo |
| 004 | browser-port | standard | Given the `.sav` in a browser file input, when unzipped + scanned client-side, then it finishes fast + low-memory without a server (targeted scan vs. full WASM parse) | PENDING | browser, performance, unzip |
