# Project Research Summary

**Project:** Stellaris Tech Tree Visualizer
**Domain:** Interactive game-data visualization web app (build-time ETL pipeline + static client-side graph UI)
**Researched:** 2026-07-07
**Confidence:** HIGH

## Executive Summary

This project is a build-time-parsed, static-hosted interactive graph visualizer — the same architectural category as Path of Exile's passive tree, Factorio tech calculators, and EU4/CK3 community wikis-as-apps. The category has a well-established two-stage shape: a Node/TS pipeline parses proprietary Clausewitz script files into a versioned JSON snapshot (never shipped raw), and a static React SPA renders that snapshot with WebGL-accelerated graph rendering, search, and filtering. The existing reference tool (bloodstainedcrow) fails not because the *concept* is wrong but because of two structural mistakes this research directly diagnoses: (1) a manual, hand-maintained per-version data pipeline that a volunteer maintainer inevitably stops running (it's now 3+ major patches stale), and (2) a tree-only layout library (Treant.js) that cannot correctly place multi-parent DAG nodes, combined with no search/pan/zoom — making a large tree genuinely unnavigable. Both are avoidable with decisions made now, not retrofitted later.

The recommended approach is unambiguous and well-supported: React + Vite for the app shell, sigma.js (WebGL) + graphology for rendering (the only graph library in this class with an official React wrapper and headroom well beyond this project's ~600-900 node scale), elkjs for one-time build-time layered DAG layout (tier as primary rank axis, matching the game's own hierarchy), and `jomini` for Clausewitz parsing rather than a hand-rolled regex parser. The single highest-risk technical unknown is the Clausewitz parser — the format is deceptively irregular (`@variable` references, polymorphic scalar-or-block fields, semantically-meaningful duplicate keys, `technology_swap` blocks) and a naive implementation will silently produce wrong data, which is fatal for a project whose entire value proposition is "accurate, current data." The second major risk is layout/rendering choice, since Stellaris tech prerequisites form a genuine multi-parent DAG, not a tree — this must be decided as a foundational architecture choice validated against the *full* real dataset early, not a curated 20-node sample, because problems here only surface at full scale and are expensive to retrofit.

Mitigating both risks is straightforward if sequenced correctly: build the parser as a real tokenizer/AST (not regex) and validate it against all 33 real technology files from day one; precompute layout at build time using a Sugiyama-style layered algorithm (elkjs) driven by tier/area data, so the frontend never runs a layout pass at runtime; and automate the entire pipeline as a single command from the start, since ease-of-rerun is the actual determinant of whether this tool avoids the reference tool's stale-data fate. Feature scope is well-bounded by strong competitive research: table-stakes features (tree render, search, filters, detail panel, prerequisite highlighting) are well-understood and low-risk; the most valuable differentiator — cost-aware "beeline" path-to-target highlighting — currently exists in the ecosystem only as a separate console script, representing a genuine leapfrog opportunity if sequenced into v1.x.

## Key Findings

### Recommended Stack

The stack is chosen around a single de-risking principle: pick the graph-rendering library first (since it's the highest-risk dependency at this project's scale), then pick the frontend framework that has official support for it. Sigma.js (WebGL) is the only library in its class rated for 100K+ nodes with an official React wrapper (`@react-sigma/core`), giving comfortable headroom over the ~600-900 node / ~1000+ edge scale here. This directly determines React over Svelte, despite Svelte's per-update performance edge in the abstract — Sigma has no official Svelte integration.

**Core technologies:**
- **Vite 8.x + React 19.x + TypeScript 5.x** — standard static SPA toolchain; TypeScript matters because game data has real shape (tier, area, category, cost, prerequisites, weight modifiers) that benefits from end-to-end typing from parser output through UI.
- **sigma.js 3.0.3 + graphology 0.26.0 + @react-sigma/core 5.0.6** — WebGL rendering purpose-built for this scale class; graphology is the required data-layer companion; stay on the 3.x stable channel, not the 4.0.0-alpha line.
- **elkjs 0.11.1** — hierarchical/layered DAG layout, computed once at build time; chosen over dagre for better handling of complex multi-parent DAGs (many techs require 2+ prerequisites across tiers), since layout quality matters more than speed for a one-shot computation.
- **jomini 0.10.0** — actively maintained, WASM-backed Clausewitz/Paradox script parser (build-time Node dependency only); explicitly recommended over any hand-rolled regex or naive recursive-descent parser.
- **fuse.js + zustand** — fuzzy search and lightweight client state (selected tech, filters, search query) respectively.
- **ImageMagick (CLI, build-time) + sharp** — two-stage icon pipeline: ImageMagick decodes Stellaris's DDS interface icons to PNG (sharp cannot read DDS directly), then sharp resizes/re-encodes to WebP for the web bundle.

### Expected Features

The core insight from feature research: Stellaris's in-game research UI has **no full tech-tree view at all** (randomized card-draw system) — this entire product category exists to answer "what leads to X" and "what does X unlock," a question the game itself cannot answer. Every feature decision should be judged against that job.

**Must have (table stakes):**
- Full tree render with prerequisite edges, laid out for readability at hundreds-of-nodes scale
- Accurate, current-patch parsed data (tier, area, category, cost, weight, prerequisites, unlocks, DLC, flags)
- Pan/zoom performant at full scale (explicit headline requirement)
- Search by tech name, with camera-focus-to-result (not just highlighting)
- Filter by area / category / tier / DLC
- Tech detail panel (cost, weight, tier, area, category, prerequisites, unlocks)
- Prerequisite ancestor-highlighting on click/hover — the single highest-leverage fix for "hard to navigate"
- Working tech-to-tech links (explicitly broken in the reference tool)
- Theming architecture in place at launch (cheap now, expensive to retrofit)

**Should have (competitive differentiators):**
- Cost-aware "beeline" path-to-target highlighting — no competitor tool has this natively; currently exists only as a separate community PowerShell script, so shipping it in-app is a genuine leapfrog
- URL-shareable state (search/filters/selected tech) — standard in adjacent genres (PoE, WoW planners), absent from every Stellaris competitor
- Dark mode (cheap if theme tokens are planned from day one)
- Rich structured weight-modifier display (conditions, not a flattened number)
- Visual flags for rare/dangerous/repeatable/starting tech (adopt islaytzash's proven color-coding pattern)

**Defer (v2+):**
- Unlocks browser (deep cross-linked buildings/components/ships) — even the ecosystem's most mature competitor has this "in progress," not finished
- Mobile/touch-optimized layout — no competitor has solved this; desktop is the primary planning use case
- Mod tech support — explicitly out of scope per PROJECT.md; unbounded parsing complexity
- Draw-weight RNG simulator and live save-file integration — both explicitly rejected as anti-features (wrong product shape / unbounded complexity for fuzzy benefit)

### Architecture Approach

The standard, correct pattern for this domain is a strict two-stage architecture: a build-time Node/TS pipeline (parser → localisation resolver → icon converter → graph builder → layout engine → schema-validated snapshot assembler) produces a single versioned JSON artifact (`data/v4.5.0/tech.json` + icon directory) that is the *only* thing the frontend ever touches. The frontend has zero knowledge of Clausewitz syntax, never runs a parser, and never computes graph layout at runtime — it fetches the snapshot, validates it against a shared Zod schema, and renders precomputed x/y positions. This decoupling is what the reference tool got wrong (implicitly or explicitly re-parsing/re-deriving data close to runtime with no automation) and is the single most important structural decision for long-term survivability.

**Major components:**
1. **Clausewitz Parser + Scripted Variable Resolver + Localisation Resolver** (pipeline) — tokenize/parse `.txt` script files into an AST, resolve `@variable` references and `.yml` localisation keys; must be a real tokenizer, never regex
2. **Icon Extractor/Converter** (pipeline) — resolve DDS icon per tech by naming convention, convert to WebP via ImageMagick + sharp
3. **Graph Builder + Layout Engine** (pipeline) — build the prerequisite DAG (validate acyclic), compute reverse "unlocked by" edges, then assign x/y/column/row positions once via a layered algorithm (tier as primary rank)
4. **Snapshot Assembler** (pipeline) — merge all enrichment passes, validate against a shared Zod schema, write the versioned artifact
5. **Data Loader + Rendering Layer + Interaction Layer + State Management** (frontend) — fetch/validate the snapshot at load, draw via sigma.js/graphology against precomputed coordinates, and treat search/filter/pan/zoom purely as state changes and visibility toggles — never as re-layout triggers

### Critical Pitfalls

1. **Naive Clausewitz parser breaks on real files** — the format supports polymorphic fields (scalar or full block for the same key), semantically-meaningful duplicate keys (multiple `modifier` blocks that must NOT collapse into one JS object), `@variable` references, and inline `@[ ]` math. Avoid by building a generic tokenizer → AST first, preserving duplicate keys as arrays, and validating against the full 33-file corpus from day one — never a hand-picked sample.
2. **DLC-gating modeled as an afterthought** — there is no single `dlc_required` field; DLC association must be inferred from file naming plus cross-checked against trigger-gated (non-file-isolated) techs. Avoid by building an explicit, hand-maintained filename→DLC lookup table as versioned config, revisited on every patch.
3. **Manual, per-version data pipeline (the actual, confirmed cause of the reference tool's staleness)** — direct inspection shows bloodstainedcrow's staleness comes from a hand-maintained folder-per-version workflow with no automation, not a one-time bug. Avoid by making the entire pipeline a single automated, idempotent command from day one, with schema/sanity validation that fails loudly on new-patch surprises.
4. **Wrong layout algorithm for a wide, multi-parent DAG** — Stellaris prerequisites are a genuine DAG (2+ prerequisites across tiers/branches), and tree-only layout libraries (like the reference tool's Treant.js) misplace nodes or produce heavy edge-crossing. Avoid with a Sugiyama-style layered layout (elkjs) driven by the game's own tier/area data, prototyped against the *full* real dataset before committing.
5. **DOM-heavy SVG + force-directed layout collapse at scale** — force simulation is non-deterministic, CPU-heavy, and fights the tree's inherent hierarchy; per-node SVG DOM elements degrade badly past ~200-400 nodes. Avoid with WebGL/canvas rendering and layout computed once at build time, with pan/zoom as pure camera transforms, never re-layout triggers.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Data Pipeline Foundation (Parser + Schema)
**Rationale:** This is the highest-risk technical unknown and everything downstream depends on it. Getting parsing wrong is silent and hard to detect — exactly the failure mode this project exists to fix relative to the reference tool. Must be solved and validated against the *full* real corpus before any rendering work begins.
**Delivers:** Working Clausewitz tokenizer/parser (jomini-based), scripted-variable resolution, localisation join, DLC-mapping config, a validated Zod schema, and a first versioned JSON snapshot covering all base+DLC tech files.
**Addresses:** Accurate, current-patch data (table stakes); DLC filter data model (table stakes)
**Avoids:** Pitfall 1 (naive parser), Pitfall 2 (DLC-gating afterthought), Pitfall 3 (weight modifiers flattened), Pitfall 4 (technology_swap corruption), Pitfall 6 (manual pipeline)

### Phase 2: Icon Pipeline + Graph/Layout Build
**Rationale:** Layout algorithm choice is a foundational architecture decision that must land before UI work — retrofitting a rendering/layout strategy change later is expensive, and this pitfall (wrong layout for multi-parent DAG) has historically only surfaced once real full-scale data was loaded. Sequencing it right after parsing (once real prerequisite data exists) lets it be validated against actual data immediately.
**Delivers:** DDS→WebP icon conversion pipeline; prerequisite DAG construction with cycle validation and reverse-edge computation; elkjs-based layered layout producing precomputed x/y/column per node, validated against the *full* real dataset (not a curated sample).
**Uses:** elkjs, graphology, ImageMagick, sharp
**Implements:** Icon Extractor/Converter, Graph Builder, Layout Engine (Pattern 1: precompute layout at build time)

### Phase 3: Frontend Shell + Core Rendering
**Rationale:** With a validated snapshot and precomputed layout in hand, the frontend's job is "load JSON, draw it" — no runtime parsing or layout computation. This phase establishes the rendering/interaction/state boundary architecture before layering features on top.
**Delivers:** Vite + React app shell; data loader (fetch + Zod validate); sigma.js/graphology rendering of the full tree at precomputed positions; pan/zoom as pure camera transforms; theming architecture (CSS tokens) in place even if only light mode ships.
**Addresses:** Full tree render (table stakes), pan/zoom performance (table stakes), theming architecture (table stakes)
**Avoids:** Pitfall 5 (DOM-heavy/force-layout performance collapse)

### Phase 4: Search, Filters, and Detail Panel
**Rationale:** These table-stakes interaction features are the direct fix for the reference tool's "hard to navigate" complaint and depend on the rendered graph existing first (ancestor-highlighting needs graph structure already built).
**Delivers:** Fuzzy search with camera-focus-to-result; multi-select filters (area/category/tier/DLC) as visibility toggles (not re-layout); tech detail panel (cost, weight, prerequisites, unlocks); prerequisite ancestor-highlighting on click/hover; working tech-to-tech links.
**Addresses:** Search, filters, detail panel, prerequisite highlighting, working links (all table stakes)
**Avoids:** Pitfall 7 (broken UI elements, poor navigation)

### Phase 5: Differentiators (Beeline Path, URL State, Dark Mode, Polish)
**Rationale:** These features build directly on top of Phase 4's graph-traversal and state machinery (cost-aware shortest path is a superset of ancestor-highlighting; URL state has nothing meaningful to encode until search/filter/selection exist and stabilize). Sequenced last because they're genuine differentiators, not launch-blockers, and the roadmap's core value (accurate data + navigable tree) should ship and be validated first.
**Delivers:** Cost-aware "beeline" path-to-target highlighting; URL-shareable state; dark mode toggle; rich structured weight-modifier display; visual flags for rare/dangerous/repeatable/starting techs.
**Addresses:** Differentiators identified in FEATURES.md that no competitor has fully solved

### Phase Ordering Rationale

- **Data correctness must land before rendering:** the project's entire value proposition is "accurate, current data" — building UI on top of unvalidated parsing risks baking wrong assumptions into the data model, which is expensive to unwind later (per Pitfall 1's warning that parser mistakes get "baked into the UI layer" if undetected).
- **Layout must be decided and validated before general UI work:** per Pitfalls 5 and 8, layout/rendering strategy is a foundational architecture decision, not a later optimization — problems only surface at full real-data scale, so this must be prototyped against the actual dataset early rather than assumed correct from a toy sample.
- **Table-stakes navigation features come before differentiators:** search, filters, and ancestor-highlighting directly resolve the reference tool's core complaints and depend on the graph already being built and laid out; path-to-target highlighting is explicitly a superset of ancestor-highlighting plus cost data, so it belongs after, not instead of, the simpler feature.
- **Theming architecture is front-loaded, not the dark-mode toggle itself:** research explicitly flags this as uniquely cheap early and expensive to retrofit — decide the CSS-token architecture during Phase 3 even though the visible dark-mode toggle ships in Phase 5.
- **Pipeline automation is validated within Phase 1, not assumed:** per Pitfall 6, the reference tool's fatal flaw was a pipeline that was "automated in theory" but had undocumented manual steps — Phase 1 should include an explicit end-to-end re-run test (simulating a version bump) before being considered done.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Data Pipeline):** Needs research/spike on jomini's actual handling of `@variable` references, inline `@[ ]` math, and multi-condition `weight_modifier` blocks against the real 4.5.0 corpus — STACK.md flags jomini as HIGH confidence generally, but PITFALLS.md notes even purpose-built parsers need verification against this specific corpus's edge cases (`technology_swap`, empty stub files).
- **Phase 2 (Graph/Layout):** Needs an explicit early spike benchmarking elkjs against the *actual* full parsed prerequisite graph (not a toy sample) before committing — PITFALLS.md explicitly calls this out as warranting deeper research since layout problems only surface at full scale and are expensive to retrofit.
- **Phase 5 (Beeline/differentiators):** The cost-aware shortest-path algorithm (BFS vs. Dijkstra-style weighted search) needs research into how "cheapest path" should be defined given Stellaris's weight-modifier system — this is genuinely novel ground since no existing visual tool has implemented it (only a separate console script exists as precedent).

Phases with standard patterns (skip research-phase):
- **Phase 3 (Frontend Shell):** Vite + React + sigma.js/@react-sigma is a well-documented, officially-supported combination with clear installation/version guidance already established in STACK.md.
- **Phase 4 (Search/Filters/Detail Panel):** Standard client-side interaction patterns (fuse.js search, zustand state, visibility-toggle filtering) with no domain-specific novelty beyond what's already documented in FEATURES.md and ARCHITECTURE.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core choices (sigma.js, graphology, @react-sigma/core, jomini, elkjs) verified directly against npm registry metadata and official docs; only icon-fidelity edge case (DDS compression variant compatibility) flagged as MEDIUM pending direct validation against actual game files |
| Features | MEDIUM-HIGH | Feature landscape corroborated across multiple competing tools and adjacent genres (PoE, Factorio, WoW planners); some live-tool UI details inferred from READMEs rather than direct interactive inspection since target sites are JS SPAs that resisted automated fetching |
| Architecture | HIGH (pattern) / MEDIUM (specific library choice) | Two-stage build-time-pipeline + static-frontend pattern is HIGH confidence, verified via direct inspection of real game files (33 tech files, localisation, icons) plus domain-general pattern-matching against comparable game-data tools; specific rendering/layout library choice is deferred to and resolved by STACK.md |
| Pitfalls | HIGH | Parsing pitfalls verified directly against live Stellaris 4.5.0 files (confirmed `@variable` references, multi-condition weight_modifier blocks, technology_swap mechanism, multi-prerequisite techs); reference-tool failure diagnosis HIGH via direct GitHub repository inspection; rendering/layout pitfalls MEDIUM-HIGH via multiple corroborating community sources |

**Overall confidence:** HIGH

### Gaps to Address

- **DDS compression variant fidelity:** ImageMagick's DDS coder is confirmed to exist and handle standard DXT1/DXT3/DXT5 and A8R8G8B8 formats, but exact compatibility with Stellaris's specific icon files hasn't been independently verified against actual extracted files in this research pass — validate early in Phase 2 and fall back to texconv if fidelity issues appear.
- **elkjs vs. dagre at actual full-corpus scale:** both STACK.md and PITFALLS.md recommend elkjs but flag that this should be validated with a real benchmark against the full ~600-900 node prerequisite graph rather than assumed from general reputation — treat as a Phase 2 spike, not a closed decision.
- **Weight-modifier trigger vocabulary size:** PITFALLS.md notes the "common trigger types" translation library approach is scoped to what's actually observed in the corpus, but the full vocabulary size/complexity hasn't been cataloged yet — this affects Phase 5 scope estimation for the rich weight-modifier display differentiator; do a corpus grep for distinct trigger keys during Phase 1 to bound this.
- **Cost-aware "beeline" path definition:** no existing tool defines "cheapest path" precisely against Stellaris's actual weight-modifier system (which affects draw probability, not a fixed traversal cost) — this needs explicit design work in Phase 5, likely using base `cost` field as the traversal weight while acknowledging this is an approximation of "likely to draw," not a literal RNG simulation (which is explicitly out of scope).

## Sources

### Primary (HIGH confidence)
- npm registry direct version/metadata verification — jomini, sigma, graphology, @react-sigma/core, elkjs, dagre/@dagrejs/dagre, vite, sharp, zustand, fuse.js
- Direct filesystem inspection of `Z:\SteamLibrary\steamapps\common\Stellaris\common\technology\`, `common\scripted_variables\`, `localisation\english\`, `gfx\interface\icons\technologies\` — confirmed file structure, `@variable` references, multi-condition weight_modifier blocks, technology_swap mechanism, DDS icon naming convention
- [jomini GitHub Issue #4](https://github.com/nickbabcock/jomini/issues/4) and [jomini npm/GitHub](https://github.com/nickbabcock/jomini) — Clausewitz format edge cases and library capabilities
- GitHub repository inspection of `bloodstainedcrow/stellaris-tech-tree` — direct diagnosis of manual per-version pipeline as root cause of staleness
- [React Flow official performance docs](https://reactflow.dev/learn/advanced-use/performance) and [xyflow GitHub discussions](https://github.com/xyflow/xyflow/discussions/4975) — confirms DOM-per-node scaling ceiling

### Secondary (MEDIUM confidence)
- [draconas1/stellaris-tech-tree](https://github.com/draconas1/stellaris-tech-tree), [islaytzash fork](https://islaytzash.github.io/stellaris-tech-tree/), [turanar](https://turanar.github.io/stellaris-tech-tree/) — competitor feature analysis, prior-art tooling verification
- [stellaris-tech-beeliner](https://github.com/serpentskirt/stellaris-tech-beeliner) — confirms path-to-target as a real, currently-unmet need
- [Stellaris wiki - Technology](https://stellaris.paradoxwikis.com/Technology), [PCGamesN Stellaris tech tree article](https://www.pcgamesn.com/stellaris/tech-tree) — data model and in-game UI limitations
- ImageMagick DDS coder source and community discussion — DDS format handling
- Community Sigma.js/Cytoscape.js/React Flow performance comparisons (PkgPulse, Memgraph blog)
- [PDX Tools Clausewitz syntax tour](https://pdx.tools/blog/a-tour-of-pds-clausewitz-syntax/), [Windea Paradox Language Support syntax reference](https://windea.icu/Paradox-Language-Support/en/ref-syntax.html), [nickb.dev Pfarah parser post](https://nickb.dev/blog/fun-with-pfarah-a-paradox-clausewitz-parser/)

### Tertiary (LOW confidence)
- General graph-visualization UX pattern sources (Cambridge Intelligence, minimap/semantic-zoom conventions) — multiple corroborating but not Stellaris-specific sources, needs validation against actual user feedback post-launch

---
*Research completed: 2026-07-07*
*Ready for roadmap: yes*
