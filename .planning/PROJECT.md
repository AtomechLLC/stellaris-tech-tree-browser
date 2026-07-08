# Stellaris Tech Tree Visualizer

## What This Is

A modern, interactive visual tech tree for Stellaris, built from the current game data (v4.5.0 "Cygnus"). It replaces the outdated community tool at bloodstainedcrow.github.io/stellaris-tech-tree (stuck on Cetus 4.3.7) whose data is stale, whose UI elements are broken, and which is very hard to navigate. This tool presents accurate, up-to-date technology data in a fast, responsive interface that players can actually explore.

## Core Value

Players can quickly find any technology and understand how to reach it — accurate 4.5.0 data, presented clearly, navigable without friction.

## Requirements

### Validated

- ✓ Parse technology definitions from the local Stellaris 4.5.0 install (`common/technology/`, categories, tiers, localisation, icons) — Phase 1 (Data Pipeline): one command builds `data/v4.5.0/tech.json` (678 techs) + 803 WebP icons

### Active

- [ ] Render the full tech tree visually with prerequisite relationships
- [ ] Fast, responsive navigation — pan, zoom, and search without lag
- [ ] Better data presentation than the reference site — filter by research area, category, tier, and DLC; clear tech detail display (cost, weight, prerequisites, unlocks)
- [ ] UI elements that actually work (search, filters, links between techs)

### Out of Scope

- Fixing/forking the existing bloodstainedcrow tool — its data pipeline and UI are the problem; building fresh
- Mod tech support — base game + official DLC first; mods add unbounded parsing complexity *(assumed; revisit if desired)*
- Live game integration (save file reading, in-game overlay) — this is a reference/planning tool *(assumed)*

## Context

- **Reference (anti-)example:** https://bloodstainedcrow.github.io/stellaris-tech-tree/cetus-4.3.7/ — a visual tech tree whose data is dramatically out of date (4.3.7 vs current 4.5.0), whose UI elements don't work, and which is incredibly hard to navigate. It demonstrates demand for the tool and the failure modes to avoid.
- **Data source available locally:** Stellaris v4.5.0 "Cygnus" installed at `Z:\SteamLibrary\steamapps\common\Stellaris`. Verified: 33 technology definition files in `common/technology/` (including DLC tech files like `00_ancient_relics_tech.txt`, `00_biogenesis_tech.txt`), plus `category/` and `tier/` subdirectories, localisation files, and icon assets.
- **Data format:** Paradox Clausewitz script format (`key = { ... }` blocks) — requires a custom parser or existing library; tech entries include tier, area, category, prerequisites, cost, weight modifiers, and gated DLC/conditions.
- **Delivery model:** The reference tool is a static web page (GitHub Pages). A parse-at-build-time → static/client-side web app model fits: game data changes only on game patches, so the pipeline can regenerate a data snapshot per game version.

## Constraints

- **Data accuracy**: Must reflect Stellaris v4.5.0 — the entire reason this project exists; the pipeline should make future version updates cheap
- **Performance**: Fast and responsive navigation is a headline requirement — the tree has hundreds of techs; rendering and interaction must not lag
- **Data source**: Local game install at `Z:\SteamLibrary\steamapps\common\Stellaris` — parse real game files, don't hand-transcribe
- **Assets**: Game icons/art are Paradox IP — fine for personal use; public hosting follows the same community-tool conventions as the reference site

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build new instead of forking bloodstainedcrow tool | Existing tool's data pipeline is stale and UI is broken; fresh build is cheaper than rescue | — Pending |
| Parse from local 4.5.0 game files | Guarantees accuracy; makes version updates repeatable | — Pending |
| Static/client-side web app | Data only changes on game patches; no server needed; easy hosting | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-08 after Phase 1 (Data Pipeline) completion*
