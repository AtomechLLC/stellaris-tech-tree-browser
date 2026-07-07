# Architecture Research

**Domain:** Game-data visualizer (build-time ETL pipeline + static client-side graph visualization app)
**Researched:** 2026-07-07
**Confidence:** HIGH (component structure, data flow, build order) / MEDIUM (specific layout library choice — see STACK.md)

## Standard Architecture

Tools in this category — Stellaris tech tree viewers, Factorio/Satisfactory calculators, Path of Exile passive tree viewers, EU4/CK3 wikis-as-apps — converge on the same two-stage shape because the underlying problem is the same: **proprietary structured game data that changes only on patch releases** feeding **an interactive graph UI that changes only on feature releases**. Coupling them at runtime (parsing game files in the browser) is what makes the reference tool (bloodstainedcrow) brittle and stale. Decoupling them via a build-time pipeline that emits a versioned static artifact is the standard, correct pattern.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     STAGE 1: DATA PIPELINE (Node/build-time)         │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │
│  │ Clausewitz │  │ Localisation│ │ Icon        │  │ Graph       │     │
│  │ Parser     │→ │ Resolver    │→│ Extractor/  │→ │ Builder     │     │
│  │ (.txt→AST) │  │ (.yml→map)  │ │ Converter   │  │ (prereqs→   │     │
│  │            │  │             │ │ (.dds→.png/ │  │  DAG+layers)│     │
│  │            │  │             │ │  .webp)     │  │             │     │
│  └─────┬──────┘  └──────┬──────┘ └──────┬──────┘  └──────┬──────┘     │
│        └────────────────┴───────────────┴────────────────┘            │
│                              ▼                                        │
│                   ┌─────────────────────┐                             │
│                   │  Snapshot Assembler  │  (merge, validate, dedupe) │
│                   └──────────┬──────────┘                             │
└──────────────────────────────┼────────────────────────────────────────┘
                                ▼
                  ┌─────────────────────────────┐
                  │  Versioned Snapshot Artifact  │
                  │  data/v4.5.0/tech.json        │
                  │  data/v4.5.0/icons/*.webp     │
                  └──────────────┬───────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     STAGE 2: FRONTEND (static SPA)                    │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │
│  │ Data Loader│→ │ Layout     │→ │ Rendering   │  │ Interaction │      │
│  │ (fetch +   │  │ Engine     │  │ Layer       │←→│ Layer       │      │
│  │  validate) │  │ (positions)│  │ (canvas/svg)│  │ (search,    │      │
│  │            │  │            │  │             │  │  filter,    │      │
│  │            │  │            │  │             │  │  detail)    │      │
│  └─────┬──────┘  └─────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│        └───────────────┴────────────────┴────────────────┘            │
│                              ▼                                        │
│                   ┌─────────────────────┐                             │
│                   │   State Management   │  (selected tech, filters,  │
│                   │   (URL + in-memory)  │   viewport, search query)  │
│                   └─────────────────────┘                             │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Clausewitz Parser | Tokenize/parse `key = { ... }` script blocks into an AST/plain object per file, across all 33 tech files + category + tier | Hand-rolled recursive-descent parser (PEG-style) in Node/TS; existing libs like `paradox-parser`/`jomini` (Rust) exist but a small custom parser is safer for full control over Stellaris-specific quirks (`@variables`, `technology_swap`, mixed quoted/bare tokens) |
| Scripted Variable Resolver | Resolve `@tier0cost1`-style references used in `cost =` and `weight =` fields | Separate parse pass over `common/scripted_variables/*.txt`, producing a `Map<string, number>` consumed by the tech parser before/during evaluation |
| Localisation Resolver | Map `tech_x:0 "Display Name"` and `tech_x_desc:0 "..."` keys (and category/tier names) to parsed tech IDs | Line-based `.yml` parser (not full YAML — Paradox localisation is a custom line format with `key:N "value"` and `$VAR$`/`£icon£` inline placeholders); build `Map<locKey, string>` |
| Icon Extractor/Converter | Resolve icon for each tech (convention: `tech_<id>.dds` in `gfx/interface/icons/technologies/`, with explicit `icon=` override at category level; `technology_swap` may alias icons) and convert `.dds` → web format | DDS decoder (e.g. `dds-parser`/`upng`-adjacent tooling, or shell out to a CLI like `magick`/`texconv`) → re-encode as `.webp`/`.png`; run through `sharp` for resizing |
| Prerequisite Graph Builder | Turn `prerequisites = { ... }` lists into a DAG; compute derived data (tiers, "unlocked by" reverse edges, category membership, dangling/missing prereq detection) | Plain graph construction in the same Node script; adjacency list keyed by tech ID; validate DAG (no cycles) as a build-time assertion |
| Snapshot Assembler | Merge parser + localisation + icon + graph outputs into one JSON document per game version, validate against a schema, write to versioned output dir | Zod/JSON-schema validation; single `assemble.ts` orchestrator script |
| Data Loader (frontend) | Fetch the versioned JSON snapshot (and icon manifest) at app load, validate shape, expose typed data to the rest of the app | `fetch()` + Zod parse (reuse the same schema as the pipeline) on app bootstrap; cache in memory |
| Layout Engine | Compute x/y (or tier-column/row) positions for every tech node before or during first render | **Precomputed at build time** is the correct choice here (see Pattern 1 below) — pipeline emits `x`/`y`/`column` per node so frontend never runs a layout algorithm at runtime |
| Rendering Layer | Draw nodes + edges, handle pan/zoom, re-render on filter/search state change | Canvas2D (via a library like PixiJS or plain canvas) for hundreds-of-nodes performance; SVG is workable at this node count too but canvas is the safer performance default |
| Interaction Layer | Search box, category/tier/DLC filters, click-to-select detail panel, hover highlighting of prereq/unlock chains | Thin layer on top of rendering + state; filters mutate visible-node-set, not the underlying data |
| State Management | Track selected tech, active filters, search query, camera/viewport position; keep shareable via URL | Lightweight store (Zustand/Nano Stores) or even React state + URL search params — this app's state is simple (no server round-trips, no complex async) |

## Recommended Project Structure

```
tech/
├── pipeline/                        # Stage 1: build-time data pipeline (Node/TS)
│   ├── src/
│   │   ├── parser/
│   │   │   ├── clausewitz.ts        # tokenizer + recursive-descent parser → AST
│   │   │   ├── scripted-variables.ts# @var resolution pass
│   │   │   └── tech-extractor.ts    # AST → structured Tech[] (cost, prereqs, area, etc.)
│   │   ├── localisation/
│   │   │   └── yml-parser.ts        # Paradox .yml → Map<key,string>, handles $VAR$/£icon£
│   │   ├── icons/
│   │   │   ├── resolve.ts           # naming-convention + technology_swap icon resolution
│   │   │   └── convert.ts           # .dds → .webp/.png via sharp/dds-decoder
│   │   ├── graph/
│   │   │   └── build-dag.ts         # prerequisites[] → adjacency list, cycle check, reverse edges
│   │   ├── layout/
│   │   │   └── compute-positions.ts # tier/area-based layout algorithm → x/y per node
│   │   ├── schema/
│   │   │   └── tech-snapshot.ts     # Zod schema shared by pipeline output + frontend loader
│   │   └── assemble.ts              # orchestrator: run all stages, validate, write snapshot
│   ├── data/
│   │   └── v4.5.0/                  # versioned output (one dir per game version)
│   │       ├── tech.json
│   │       └── icons/*.webp
│   └── package.json
│
├── app/                              # Stage 2: static frontend (Vite + React/Svelte, TBD in STACK.md)
│   ├── src/
│   │   ├── data/
│   │   │   └── loadSnapshot.ts       # fetch + Zod-validate versioned JSON at startup
│   │   ├── graph/
│   │   │   ├── GraphCanvas.tsx       # rendering layer (canvas/PixiJS)
│   │   │   └── viewport.ts           # pan/zoom camera math
│   │   ├── interaction/
│   │   │   ├── SearchBar.tsx
│   │   │   ├── FilterPanel.tsx       # category/tier/DLC filters
│   │   │   └── TechDetailPanel.tsx   # cost, weight, prereqs, unlocks
│   │   ├── state/
│   │   │   └── store.ts              # selected tech, filters, search query, URL sync
│   │   └── App.tsx
│   ├── public/
│   │   └── data/ → symlink or copy of pipeline/data/v4.5.0/
│   └── package.json
│
└── .planning/                        # GSD planning artifacts (this research, roadmap, etc.)
```

### Structure Rationale

- **`pipeline/` and `app/` as siblings, not nested:** They have different runtimes (Node build tool vs. browser SPA), different dependency trees, and different release cadences (pipeline reruns per game patch; app reruns per feature). Keeping them as separate packages (even in a single repo/monorepo-lite, no need for full Nx/Turborepo at this scale) keeps that boundary honest.
- **`pipeline/src/schema/` shared conceptually with `app/src/data/`:** The Zod schema should be the single source of truth for the JSON shape. Simplest approach at this scale: publish it as a small local package or just duplicate the schema file into both — do not over-engineer a shared-package setup for a two-package repo; a copied/symlinked schema file is fine.
- **`pipeline/data/v4.5.0/`:** Versioned by game version, not by pipeline-run timestamp. This directory *is* the artifact contract between stages — see "How the Two Connect" below.
- **`app/src/graph/` vs `app/src/interaction/`:** Rendering (draw pixels) and interaction (respond to user input, mutate state) are separated so the rendering layer can stay a "dumb" function of (data, layout, viewport, filters) → pixels, independently testable/swappable from the interaction logic.

## Architectural Patterns

### Pattern 1: Precompute Layout at Build Time, Not Runtime

**What:** The pipeline (not the browser) computes final x/y coordinates for every tech node, using a deterministic layered/hierarchical layout algorithm based on `tier` and `area`/`category`. The frontend receives ready-to-draw coordinates and never runs a force-directed or Sugiyama-style layout pass in the browser.

**When to use:** Always, for this project. The graph is static (changes only when the pipeline reruns on a new game version), the node count is in the hundreds (not thousands), and "fast, responsive navigation" is a headline requirement — running a layout solver client-side on every load (or worse, on every filter change) is wasted CPU and a real risk of jank, especially on lower-end devices. Precomputing removes an entire class of runtime performance problems and makes the frontend's job purely "load JSON, draw it."

**Trade-offs:**
- Pro: Instant first render, zero layout-jank risk, layout is debuggable/reviewable as static data, trivial to unit-test the layout algorithm against known tech data
- Pro: Filtering (hide/show nodes) becomes a pure visibility toggle, not a re-layout — dramatically simpler and faster
- Con: Layout algorithm must be designed to gracefully handle hidden/filtered nodes without recomputing positions (solved by never moving nodes on filter — just fade/hide them, keep column/row space reserved)
- Con: Any future "let the user drag nodes around" feature needs an explicit "user override" layer on top of computed positions — not a blocker, just a note for later scope

**Example:**
```typescript
// pipeline/src/layout/compute-positions.ts
interface TechNode {
  id: string;
  tier: number;
  area: "physics" | "society" | "engineering";
  category: string[];
}

interface PositionedTech extends TechNode {
  x: number; // column: derived from tier (primary) + area (secondary grouping)
  y: number; // row: derived from category or topological order within tier
}

function computeLayout(techs: TechNode[], dag: Graph): PositionedTech[] {
  // Column = tier (0-5, matches common/technology/tier/00_tier.txt)
  // Row = stable ordering within (tier, area) bucket, tie-broken by
  // topological depth so a tech never renders left of its prerequisite.
  // This is closer to a Sugiyama layered-graph layout than force-directed —
  // deterministic and reviewable, unlike force simulation.
}
```

### Pattern 2: Versioned Snapshot as the Sole Contract Between Pipeline and Frontend

**What:** The pipeline's only output that the frontend depends on is a single JSON file (plus an icon directory) under a version-stamped path (e.g. `data/v4.5.0/tech.json`). The frontend never reads game files, never runs a parser, and has zero knowledge of Clausewitz syntax. This is the same pattern used by static-site generators (Gatsby/Astro content layers) and by game-data sites like the Path of Exile / PoEDB data dumps: parse once, freeze into a portable format, consume many times.

**When to use:** Always, for this project — it's the core architectural decision already implied by PROJECT.md ("parse-at-build-time → static/client-side web app").

**Trade-offs:**
- Pro: Frontend has no server dependency, deploys as static files (GitHub Pages, Netlify, Cloudflare Pages all trivially work), and is fully cacheable/CDN-friendly
- Pro: Re-running the pipeline against a new game patch produces a new versioned snapshot without touching frontend code at all (unless the schema changed)
- Pro: Multiple game versions can coexist (`data/v4.3.7/`, `data/v4.5.0/`) if a "compare patches" feature is ever wanted — directly solves the reference tool's staleness failure mode by making versioning a first-class concept instead of an afterthought
- Con: Schema changes require coordinated updates to both the pipeline's Zod schema and the frontend's loader/types — mitigate by sharing one schema file/module between the two packages
- Con: Large icon sets increase snapshot size — mitigate with `.webp` (smaller than `.png`) and only shipping icons actually referenced by in-scope techs (skip mod/unused DLC icons)

### Pattern 3: Parse-Don't-Regex the Clausewitz Format

**What:** Build a real tokenizer + recursive-descent parser for the `key = { ... }` script format rather than trying to regex-extract fields line by line. The format has nested blocks, quoted and unquoted string literals, list values (`prerequisites = { "a" "b" }`), scoped/conditional sub-blocks (`technology_swap`, `weight_modifier` with nested `modifier`/`OR`/`NOR` triggers), and `@variable` references — all of which break naive regex approaches the moment a file has an edge case (and with ~30k total lines across 33 files, edge cases are guaranteed, confirmed by direct inspection: `tech_basic_science_lab_3` alone has three stacked `technology_swap` blocks with nested triggers).

**When to use:** Always for this domain. This is exactly the mistake that produces brittle, break-on-every-patch parsers (a likely contributor to the reference tool's staleness — patch-to-patch syntax variations silently break regex assumptions).

**Trade-offs:**
- Pro: Robust to new fields/blocks appearing in future game patches — an unrecognized key just becomes an extra AST property, not a parse failure
- Pro: One parser handles category, tier, and technology files uniformly (they're all the same underlying script grammar)
- Con: More upfront implementation cost than "just regex the cost value out" — but this cost is fixed and one-time, while regex fragility is a recurring maintenance cost across every future patch

## Data Flow

### Pipeline Build Flow

```
Stellaris install (Z:\...\Stellaris)
    ↓
[common/technology/*.txt, category/*.txt, tier/*.txt]  ──┐
[common/scripted_variables/*.txt]                         │
    ↓                                                     │
Clausewitz Parser → raw AST per file                      │
    ↓                                                      │
Tech Extractor → Tech[] (id, tier, area, category,        │
                 cost, prerequisites, weight, flags,       │
                 technology_swap variants, is_rare, ...)   │
    ↓                                                      │
[localisation/english/*.yml] → Localisation Resolver      │
    ↓                                                      │
    join on tech_<id> / tech_<id>_desc  ──────────────────┘
    ↓
Tech[] with name + description attached
    ↓
[gfx/interface/icons/technologies/*.dds] → Icon Extractor
    ↓ (resolve by convention tech_<id>.dds, override via technology_swap.inherit_icon)
    ↓ (.dds → sharp/decoder → .webp, written to pipeline/data/v{version}/icons/)
    ↓
Tech[] with iconPath attached
    ↓
Graph Builder → DAG (nodes + edges from prerequisites), validate acyclic,
                compute reverse edges ("unlocked by this tech")
    ↓
Layout Engine → assign x/y/column/row per node (Pattern 1)
    ↓
Snapshot Assembler → validate against Zod schema → tech.json
    ↓
pipeline/data/v4.5.0/{tech.json, icons/*.webp}   ← VERSIONED ARTIFACT
```

### Frontend Runtime Flow

```
App load
    ↓
Data Loader: fetch('/data/v4.5.0/tech.json') → Zod.parse() → typed TechSnapshot
    ↓
Layout is already computed (embedded in snapshot) — no runtime layout pass
    ↓
Rendering Layer: draw all nodes at their precomputed (x,y), draw edges between
                 prerequisite pairs, initial viewport = fit-to-bounds
    ↓
User interacts (search / filter / pan / zoom / click node)
    ↓
Interaction Layer → State Management (update selectedTech, activeFilters,
                     searchQuery, viewport — sync shareable parts to URL)
    ↓
State change → Rendering Layer re-renders:
    - filters/search → toggle node/edge visibility (opacity/hide), positions unchanged
    - selection → highlight node + its prereq/unlock chain, open TechDetailPanel
    - pan/zoom → transform camera only, no data recomputation
```

### Key Data Flows

1. **Version-gated snapshot swap:** The frontend's only coupling to "which game version" is the URL path it fetches (`/data/v4.5.0/tech.json`). Bumping game versions means: rerun pipeline → new versioned dir → update one fetch path (or add a version selector UI later). No frontend logic changes.
2. **Search/filter as pure visibility function:** `visibleNodes = allNodes.filter(matchesSearch && matchesActiveFilters)`. This function is recomputed on every keystroke/filter toggle but is O(n) over a few hundred nodes — trivially fast, no debouncing strictly required though it's cheap insurance for search-as-you-type.
3. **Detail panel as a pure lookup:** Clicking a node sets `selectedTechId` in state; the detail panel and the prereq/unlock highlight overlay both derive from `snapshot.techs[selectedTechId]` plus the precomputed reverse-edge map — no additional graph traversal needed at click time because the graph builder already computed "what does this tech unlock" during the pipeline run.

## Scaling Considerations

This project's "scale" axis is different from a typical web app — it's not concurrent users, it's node/edge count and snapshot size. Concurrent users is irrelevant for a static site (CDN serves flat files).

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (~600-900 base+DLC techs, confirmed 33 files up to ~7,160 lines each) | Single JSON snapshot (likely a few hundred KB), single icon sprite-sheet or individual webp files, canvas rendering with naive full-redraw-on-change — all fine at this size, no special optimization needed |
| If mod support added later (out of scope per PROJECT.md, but noting the boundary) | Node count could grow substantially and unboundedly; would need spatial culling (only render nodes in/near viewport) and possibly virtualized rendering — explicitly deferred, matches PROJECT.md's out-of-scope call |
| If multi-version comparison UI added | Snapshot size scales linearly with number of versions kept; mitigate by lazy-loading only the selected version's JSON, not bundling all versions into the initial app load |

### Scaling Priorities

1. **First (and likely only) bottleneck at current scope:** Icon asset weight (hundreds of small images). Mitigate with `.webp`, appropriate sizing (icons are natively 52x52 — no need to ship larger), and either an icon spritesheet or HTTP/2+ multiplexed individual requests (either works fine at this file count).
2. **Second, only if it becomes relevant:** Canvas redraw cost if the interaction layer ever does something expensive on every frame (e.g. animated transitions). Mitigate by keeping redraws event-driven (redraw on state change only, not on an animation loop) unless a specific animated-transition feature is added.

## Anti-Patterns

### Anti-Pattern 1: Parsing Clausewitz Files in the Browser at Runtime

**What people do:** Ship the raw `.txt`/`.yml` game files to the client and parse them client-side on page load (or worse, on every visit), sometimes because it feels simpler to skip a "build step."

**Why it's wrong:** It couples the frontend bundle to Paradox's proprietary script format, means every user's browser repeats the same deterministic parsing work, bloats the shipped payload with parser code and unprocessed data, and makes the app slower to first-render exactly where "fast, responsive" is a stated requirement. It also means game-file-format quirks (like the `technology_swap` triggers this research found) leak into client-side code paths instead of being resolved once, centrally, at build time.

**Do this instead:** Parse once in the pipeline, ship only the distilled JSON snapshot. This is the whole reason a two-stage architecture exists for this domain.

### Anti-Pattern 2: Runtime Force-Directed Graph Layout for a DAG That Has a Natural Hierarchy

**What people do:** Reach for a generic graph visualization library (e.g. d3-force, or a physics-based layout) and let it settle node positions live in the browser, because it's the first result when searching "how to draw a graph in JS."

**Why it's wrong:** Force-directed layouts are non-deterministic (positions vary slightly run to run), require iterative simulation (CPU cost, visible "settling" jank), and actively fight against the fact that Stellaris tech has an inherent hierarchy (`tier` 0-5, `area`, `prerequisites` forming a DAG) that a layered/hierarchical layout expresses far more legibly than a physics blob. The reference tool's "very hard to navigate" complaint is very plausibly a layout-legibility problem, not just a data-staleness problem.
**Do this instead:** Use a deterministic layered/hierarchical layout (Sugiyama-style: tier as primary axis, topological/category ordering as secondary axis), computed once at build time (Pattern 1).

### Anti-Pattern 3: Regex-Based "Good Enough" Clausewitz Parsing

**What people do:** Write a quick regex or line-splitter to grab `cost = (\d+)` and `prerequisites = \{([^}]+)\}` because the "example" entries look simple at first glance.

**Why it's wrong:** Confirmed directly in the game files during this research: `cost` can be a bare number, an `@scripted_variable` reference, or a full `{ factor = ... modifier = { ... } }` block; `technology_swap` blocks can appear multiple times per tech with nested `trigger`/`OR`/`NOR` conditions; `prerequisites` lists mix quoted and unquoted identifiers. A regex approach will silently mis-parse or skip these cases, and will break again on the next patch when Paradox adds a new field shape.
**Do this instead:** Real tokenizer + recursive-descent parser (Pattern 3), producing a generic AST that's then interpreted by domain-specific extraction code that can ignore fields it doesn't need (e.g., `ai_weight` is irrelevant to a visualizer and can simply be parsed-and-discarded rather than special-cased away).

## Integration Points

### External Services

This is a static, offline-data project — there are no external runtime services. The only "external" dependency is the local Stellaris game install as a *build-time* input, which is not a service but a filesystem read.

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Stellaris game install (local filesystem) | Pipeline reads directly from `Z:\SteamLibrary\steamapps\common\Stellaris\...` at build time | Not a runtime dependency — the pipeline is run manually/on-demand when a new game version needs to be captured; the *output* (versioned JSON snapshot) is what ships, not the game files themselves |
| Static hosting (GitHub Pages, per reference tool convention) | Frontend build output + `data/v{version}/` directory deployed as static files | No server-side component at all; confirms the "static/client-side web app" decision in PROJECT.md |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Pipeline ↔ Frontend | Versioned JSON file on disk (`data/v4.5.0/tech.json`) + icon directory, fetched over HTTP at app load | This is the *only* coupling point. Enforce it strictly: the frontend package should have zero imports from the pipeline package and vice versa — only the shared schema/types file (or a duplicated copy of it) crosses the boundary |
| Parser ↔ Localisation Resolver ↔ Icon Extractor (within pipeline) | Sequential passes over the same in-memory `Tech[]` array, each pass enriching it (join by tech ID) | Keep these as pure functions (`Tech[] → Tech[]`) so each stage is independently testable against fixture data without needing the full game install present (important for CI/tests, since the game install is a local-only dependency not available in a clean environment) |
| Layout Engine ↔ Graph Builder | Layout consumes the DAG (nodes + edges) the graph builder produces; strictly one-directional | Layout should never need to re-derive graph structure — keep DAG construction as a distinct, earlier step so layout code stays focused purely on positioning |
| Rendering Layer ↔ Interaction Layer ↔ State Management (frontend) | State is the single source of truth; interaction layer dispatches state changes; rendering layer subscribes to state and redraws | Avoid direct rendering-layer-to-interaction-layer calls that bypass state — keeps the render function pure and testable as `render(snapshot, state) → pixels` |

## Sources

- Direct inspection of `Z:\SteamLibrary\steamapps\common\Stellaris\common\technology\` (33 files, `000_documentation.txt` example schema, `category/00_category.txt`, `tier/00_tier.txt`) — HIGH confidence, primary source
- Direct inspection of `Z:\SteamLibrary\steamapps\common\Stellaris\common\scripted_variables\00_scripted_variables.txt` (confirms `@variable` cross-file references used in `cost`/`weight` fields) — HIGH confidence, primary source
- Direct inspection of `Z:\SteamLibrary\steamapps\common\Stellaris\localisation\english\technology_l_english.yml` (confirms `l_english:` header, `key:N "value"` line format, `_desc` suffix convention) — HIGH confidence, primary source
- Direct inspection of `Z:\SteamLibrary\steamapps\common\Stellaris\gfx\interface\icons\technologies\` (confirms `tech_<id>.dds` naming convention, 52x52 32-bit ARGB DDS format via `file` utility, explicit `icon =` field only present at category level) — HIGH confidence, primary source
- Domain-general pattern recognition from build-time-ETL-plus-static-frontend architectures common to game-data reference sites (Path of Exile tree viewers, EU4/CK3/HOI4 community wikis-as-apps) — MEDIUM confidence, pattern-matched from general knowledge rather than a single verified external source; recommend the roadmap treat the specific layout-library and rendering-library choice as still open (deferred to STACK.md/phase-specific research) even though the build-time-precompute *pattern* itself is HIGH confidence

---
*Architecture research for: Game-data visualizer (Stellaris tech tree)*
*Researched: 2026-07-07*
