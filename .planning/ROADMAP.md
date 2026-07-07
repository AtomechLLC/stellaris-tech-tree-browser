# Roadmap: Stellaris Tech Tree Visualizer

## Overview

The journey runs from raw game files to a navigable tool: first, build a rock-solid, automated data pipeline that parses Stellaris 4.5.0's Clausewitz-format tech files into an accurate versioned JSON snapshot — this is the project's entire reason for existing, so it must be correct before anything is built on top of it. Second, turn that snapshot into a rendered, readable, performant tech tree — icons, DAG layout, WebGL rendering, pan/zoom, and the CSS-token theming foundation — delivering the first genuinely viewable end-to-end capability. Third, layer on the navigation and discovery features (search, filters, prerequisite highlighting, detail panel, working links) that directly fix the reference tool's "hard to navigate, broken UI" failure mode, completing the v1 core value: players can quickly find any technology and understand how to reach it.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Pipeline** - Parse all Stellaris 4.5.0 tech data into an accurate, versioned, one-command-regenerable JSON snapshot
- [ ] **Phase 2: Tech Tree Visualization** - Render the full tech tree as a true DAG with icons, readable layout, and smooth pan/zoom
- [ ] **Phase 3: Navigation & Discovery** - Find any tech and understand how to reach it — search, filters, prerequisite chains, detail panel, working links

## Phase Details

### Phase 1: Data Pipeline

**Goal**: A single command turns the local Stellaris 4.5.0 install into an accurate, versioned JSON snapshot containing every technology's full data — the foundation everything downstream depends on
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):

  1. Running one command parses all 33 technology files (base game + DLC) into a single versioned JSON snapshot, with no manual steps
  2. Every parsed tech record includes tier, area, category, cost, base weight, prerequisites, unlocks, DLC gating, and flags (rare/dangerous/repeatable/starting), with all `@scripted_variables` resolved to concrete numbers
  3. Every tech's name and description in the snapshot matches the game's English localisation text
  4. Every tech's icon exists as a web-ready image file (converted from the game's `.dds` asset) referenced from the snapshot
  5. Re-running the pipeline against the same install reproduces an equivalent snapshot (idempotent), simulating what a future game-patch update would require

**Plans**: 5 plans
Plans:
**Wave 1**

- [ ] 01-01-PLAN.md — Walking skeleton: scaffold + Clausewitz parser + scripted-var resolver + Zod schema contract + version detect + minimal end-to-end tech.json

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Full tech extraction (all 33 files) + DLC classification + prerequisite DAG validation
- [ ] 01-03-PLAN.md — Localisation resolution (names/descriptions across all english .yml files)
- [ ] 01-04-PLAN.md — Icon pipeline (DDS→WebP conversion + resolution + placeholder fallback)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-05-PLAN.md — Full assembler + validation report + idempotency/corpus test + SCHEMA.md

### Phase 2: Tech Tree Visualization

**Goal**: Players can open the app and see the complete, accurately-laid-out tech tree, with icons, and pan/zoom smoothly across the full graph
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: TREE-01, TREE-02, TREE-03, TREE-04, UIFX-01
**Success Criteria** (what must be TRUE):

  1. User opens the app and sees the entire tech tree rendered, with multi-prerequisite techs correctly connected to all their parents (true DAG, not flattened into a tree)
  2. The tree is organized so techs are grouped/positioned by tier and research area, making the overall structure scannable at a glance
  3. User can pan and zoom across the full tree (hundreds of nodes) with no perceptible lag
  4. Each tech node shows its icon, localized name, and tier without needing to click into it
  5. All UI styling is driven by CSS custom property theme tokens, with a working light theme shipped

**Plans**: TBD
**UI hint**: yes

### Phase 3: Navigation & Discovery

**Goal**: Players can find any technology by name and understand exactly what it needs and what it unlocks, without hitting a dead end
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, DETL-01, DETL-02
**Success Criteria** (what must be TRUE):

  1. User can type a tech name or key into search and jump straight to that node in the tree
  2. User can filter the visible tree by research area (Physics/Society/Engineering), and independently by category, tier, and DLC
  3. Clicking a tech highlights its complete prerequisite chain (every ancestor) so the path to it is visually obvious
  4. Clicking a prerequisite or unlock reference inside the detail panel navigates to and selects that tech (no broken links)
  5. Selecting any tech shows its full details — cost, weight, tier, area, category, prerequisites, unlocks, and which DLC it requires

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Pipeline | 0/5 | Not started | - |
| 2. Tech Tree Visualization | 0/TBD | Not started | - |
| 3. Navigation & Discovery | 0/TBD | Not started | - |
