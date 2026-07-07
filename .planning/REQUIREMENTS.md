# Requirements: Stellaris Tech Tree Visualizer

**Defined:** 2026-07-07
**Core Value:** Players can quickly find any technology and understand how to reach it — accurate 4.5.0 data, presented clearly, navigable without friction.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Pipeline

- [ ] **DATA-01**: Pipeline parses all technology definitions from the local Stellaris 4.5.0 install (all 33 tech files, including DLC files) into a versioned JSON snapshot
- [ ] **DATA-02**: Parsed tech records include tier, area, category, cost, base weight, prerequisites, unlocks, DLC gating, and flags (rare/dangerous/repeatable/starting), with `@scripted_variables` resolved to concrete values
- [ ] **DATA-03**: Tech names and descriptions are resolved from the game's English localisation files
- [ ] **DATA-04**: Tech icons are extracted from game `.dds` assets and converted to web formats
- [ ] **DATA-05**: Pipeline regenerates the full data snapshot with a single command, so future game-version updates are cheap

### Tree Visualization

- [ ] **TREE-01**: User can view the full tech tree with prerequisite edges rendered as a true DAG (multi-prerequisite techs placed correctly, not tree-flattened)
- [ ] **TREE-02**: Tree layout is readable at full scale — organized by tier and research area
- [ ] **TREE-03**: User can pan and zoom smoothly at full-tree scale (hundreds of nodes) without lag
- [ ] **TREE-04**: Tech nodes display icon, localized name, and tier at a glance

### Navigation

- [ ] **NAV-01**: User can search techs by name or tech key (substring match) and jump to the matching node in the tree
- [ ] **NAV-02**: User can filter the tree by research area (Physics / Society / Engineering)
- [ ] **NAV-03**: User can filter the tree by category, tier, and DLC
- [ ] **NAV-04**: Clicking a tech highlights its full prerequisite chain (all ancestors) in the tree
- [ ] **NAV-05**: Links between techs work — clicking a prerequisite or unlock reference in the detail panel selects and navigates to that tech

### Tech Details

- [ ] **DETL-01**: User can view a tech's details: cost, weight (flat value at launch), tier, area, category, prerequisites, and unlocks
- [ ] **DETL-02**: Detail panel shows which DLC a tech requires

### UI Foundation

- [ ] **UIFX-01**: UI styling is built on theme tokens (CSS custom properties) from day one — light theme ships at launch, additional themes require no rework

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Differentiators

- **BEEL-01**: User can select a target tech and see the cost-aware cheapest path ("beeline") highlighted, with accumulated cost
- **SHARE-01**: App state (search, filters, selected tech) is URL-shareable
- **THEME-01**: User can toggle dark mode
- **WGHT-01**: Detail panel shows weight modifiers as structured condition → multiplier rows, not a flat number
- **FLAG-01**: Tech nodes carry visual flags for rare / dangerous / repeatable / starting techs, with a legend
- **MINI-01**: Minimap overview while zoomed in
- **UNLK-01**: Deep unlocks browser — buildings/components/ships cross-linked from techs
- **MOBL-01**: Mobile/touch-optimized layout (pinch-zoom, tap for detail)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mod tech support | Unbounded parsing complexity; conflicts with data-accuracy guarantee; base game + official DLC only (per PROJECT.md) |
| Live save-file integration / in-game overlay | Different product (game mod), different distribution; this is a reference/planning web tool |
| Draw-weight RNG simulator | Replicating the game's full draw logic is a simulation engine; subtle errors would undermine the accuracy value prop |
| Real-time collaborative planning | Requires backend/websockets; conflicts with static-site delivery model — URL sharing (v2) covers the need |
| Account system / saved profiles | Requires backend + auth; URL state and localStorage cover it with zero server |
| Exhaustive customization settings | Configuration surface grows faster than value; ship one good default + dark mode toggle |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Pending |
| DATA-05 | Phase 1 | Pending |
| TREE-01 | Phase 2 | Pending |
| TREE-02 | Phase 2 | Pending |
| TREE-03 | Phase 2 | Pending |
| TREE-04 | Phase 2 | Pending |
| UIFX-01 | Phase 2 | Pending |
| NAV-01 | Phase 3 | Pending |
| NAV-02 | Phase 3 | Pending |
| NAV-03 | Phase 3 | Pending |
| NAV-04 | Phase 3 | Pending |
| NAV-05 | Phase 3 | Pending |
| DETL-01 | Phase 3 | Pending |
| DETL-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-07*
*Last updated: 2026-07-07 after roadmap creation*
