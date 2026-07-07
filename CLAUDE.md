<!-- GSD:project-start source:PROJECT.md -->
## Project

**Stellaris Tech Tree Visualizer**

A modern, interactive visual tech tree for Stellaris, built from the current game data (v4.5.0 "Cygnus"). It replaces the outdated community tool at bloodstainedcrow.github.io/stellaris-tech-tree (stuck on Cetus 4.3.7) whose data is stale, whose UI elements are broken, and which is very hard to navigate. This tool presents accurate, up-to-date technology data in a fast, responsive interface that players can actually explore.

**Core Value:** Players can quickly find any technology and understand how to reach it — accurate 4.5.0 data, presented clearly, navigable without friction.

### Constraints

- **Data accuracy**: Must reflect Stellaris v4.5.0 — the entire reason this project exists; the pipeline should make future version updates cheap
- **Performance**: Fast and responsive navigation is a headline requirement — the tree has hundreds of techs; rendering and interaction must not lag
- **Data source**: Local game install at `Z:\SteamLibrary\steamapps\common\Stellaris` — parse real game files, don't hand-transcribe
- **Assets**: Game icons/art are Paradox IP — fine for personal use; public hosting follows the same community-tool conventions as the reference site
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Vite** | 8.1.3 | Build tool / dev server | Standard for static SPAs in 2026. Fast HMR, trivial static build output, first-class TypeScript support, and both React and the Node-based data pipeline can share the same toolchain (Vite plugins run in Node). No SSR/routing overhead needed since this is a single-view app with client-side interaction only. |
| **React** | 19.x (latest stable) | UI framework | Not chosen for "React is better than Svelte" reasons in the abstract — chosen because the graph rendering library ecosystem is decisively stronger on React. `@react-sigma` is an official, actively maintained wrapper (sigma core has ~192K weekly downloads); Sigma's Svelte integration is unofficial/community-only with no official wrapper. Since the graph library is the highest-risk dependency in this project, pick the framework that de-risks it. |
| **TypeScript** | 5.x | Language | Game data has a real shape (tech id, tier, area, category, cost, prerequisites, weight modifiers, DLC flags) that benefits from static typing end-to-end — from the parser output JSON schema through to the React components consuming it. Catches schema drift when Paradox changes file structure between patches. |
| **sigma.js** | 3.0.3 (stable) | Graph rendering (WebGL) | WebGL-based renderer built for exactly this scale class — rated for 100K+ nodes/edges, vs. Canvas-based libraries which start to strain in the low thousands. At ~600+ tech nodes with potentially 1000+ prerequisite edges, this is comfortably within Sigma's sweet spot with headroom for future DLC growth. The project's headline requirement is fast pan/zoom/search — this is precisely Sigma's design target. Do not use the 4.0.0-alpha line; stay on the 3.x stable channel. |
| **graphology** | 0.26.0 | Graph data structure | Required companion to sigma.js — Sigma doesn't manage graph data itself, it renders a graphology graph. Provides the data layer (add/update nodes and edges) plus the standard library of layout/metric algorithms used via `graphology-layout*` packages. |
| **@react-sigma/core** | 5.0.6 | React bindings for Sigma | Official React wrapper maintained by the Sigma.js team (`sim51/react-sigma`, formerly community-maintained, now folded into the jacomyal/sigma.js org). Handles container lifecycle, hooks for events (click/hover), and camera control — avoids hand-rolling imperative Sigma lifecycle management inside React's render cycle. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **elkjs** | 0.11.1 | Hierarchical/layered DAG layout | Use this, not dagre, for the initial tech tree layout. ELK's layered algorithm is purpose-built for node-link diagrams with inherent direction (exactly: tier → tier prerequisite flow) and handles complex DAGs (techs with 2+ prerequisites, cross-tier links) more gracefully than dagre. Layout is computed once at build time or on load, not per-frame, so ELK's higher computational cost vs. dagre is irrelevant here — layout quality matters more than layout speed for a one-shot computation. |
| **fuse.js** | 7.4.2 | Fuzzy search | Powers the "search for any tech" requirement. Lightweight, zero-dependency, handles typo-tolerant matching against tech names/descriptions — appropriate for a client-side dataset of ~600 records (no need for a real search index/server). |
| **zustand** | 5.0.14 | Client state management | Manages UI state that's orthogonal to the graph itself: selected node, active filters (research area/category/tier/DLC), search query, camera focus target. Minimal boilerplate compared to Redux/Context-based approaches; pairs well with Sigma's imperative camera API (can trigger camera moves from state changes without re-render cascades). |
| **jomini** | 0.10.0 | Clausewitz/Paradox script parser (build-time, Node) | The core data-pipeline dependency. Actively maintained (published within the last 3 months as of this research), zero runtime dependencies, WASM-backed for 200MB/s+ parse speed, purpose-built for exactly this file format across all Clausewitz-engine PDS titles including Stellaris. This is a build-time Node dependency only — never shipped to the client. |
| **sharp** | 0.35.3 | Image resizing/format conversion (PNG/WebP output) | Use for the *second* stage of icon processing — once DDS files are converted to PNG (see Build-Time Asset Pipeline below), use sharp to resize/optimize and emit WebP for the web bundle. Sharp does NOT read DDS directly — do not expect it to replace the DDS decode step. |
| **vite-plugin-static-copy** or custom Vite plugin | latest | Wires generated JSON/image assets into the Vite build | Use a custom Node script (not a generic asset-copy plugin) to run the parse pipeline (jomini → JSON) and image pipeline (ImageMagick → PNG/WebP) as a pre-build step, writing output into a `src/data/generated/` or `public/data/` directory that Vite then picks up as normal static assets. Keep this as a standalone script invoked via `npm run generate-data`, run manually or in CI when the game patches — not on every dev-server file save. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **ImageMagick** (7.x, CLI, invoked via Node `child_process`) | DDS → PNG conversion (build-time only) | ImageMagick's `dds.c` coder has native read/write support for DDS (including DXT1/DXT3/DXT5 compressed and uncompressed A8R8G8B8, which is the format Stellaris interface icons use). This is a system dependency (must be installed on the machine running the build), not an npm package — invoke via `magick convert input.dds output.png` from the data pipeline script. More reliable than the sparse/unproven pure-JS DDS decoders on npm (see What NOT to Use). |
| **Vitest** | Unit testing | For testing the parser pipeline specifically — Clausewitz format has real edge cases (see Pitfalls below) that deserve test coverage independent of the UI. |
| **ESLint + Prettier** | Lint/format | Standard, no domain-specific configuration needed. |
## Installation
# Core app
# Layout
# Search & state
# Build-time data pipeline (devDependencies — never shipped to client)
# Tooling
# System dependency (not npm) — install separately on the build machine:
#   ImageMagick 7.x — https://imagemagick.org/script/download.php
#   Verify DDS coder is present: `magick -list format | findstr -i dds` (Windows)
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| React + Vite | SvelteKit | If the graph-rendering library choice were Canvas/D3-based rather than Sigma, Svelte's smaller bundle and faster runtime updates would be a legitimate edge (Svelte is genuinely lighter for high-frequency DOM updates). But Sigma.js — the right choice for 600+ node WebGL performance — only has an official wrapper for React. Choosing Svelte here would mean hand-rolling Sigma lifecycle bindings with no official support, which is not worth the tradeoff for a project of this size. |
| sigma.js (WebGL) | Cytoscape.js (Canvas) | Cytoscape has a stronger built-in graph-analysis toolkit (centrality, path-finding, more built-in layouts) and easier learning curve. Reasonable choice if the project later needs heavier in-browser graph algorithms (e.g., "shortest path to unlock X"), since ELK/graphology can feel lower-level for that. For pure rendering performance at this node count, Sigma's WebGL renderer is the safer bet against the "no lag" requirement — Cytoscape's Canvas renderer is rated only "moderate" performance at large-graph scale by community benchmarks. |
| sigma.js (WebGL) | React Flow (`@xyflow/react` 12.11.2) | React Flow has a much nicer out-of-box DX for adding UI controls into nodes (React components as node bodies) and is extremely popular for flowchart-like DAGs. However, React Flow's own docs/community explicitly note it isn't designed to comfortably render thousands of nodes because it uses HTML/DOM per node rather than WebGL — 600+ nodes is right at the edge where teams start needing custom virtualization/optimization work. If the visual design leans heavily on rich per-node HTML content (not just icon + label), React Flow becomes more attractive despite the performance ceiling; otherwise Sigma is the safer default for the stated "fast, responsive, no lag" requirement. |
| elkjs | @dagrejs/dagre (3.0.0 — actively maintained fork, unlike original abandoned `dagre` package) | Use dagre if build-time layout computation speed becomes a real bottleneck (unlikely at 600 nodes) or if the simpler layered algorithm produces acceptable results without ELK's tuning knobs. Dagre is "drop-in simple"; ELK is more configurable but has a steeper API. Given layout is computed once (not live), ELK's better output quality for complex multi-parent DAGs (many techs have 2+ prerequisites) outweighs its complexity cost. |
| jomini (JS/WASM) | Hand-rolled parser in Python/Node | Not recommended. Clausewitz's format has genuine ambiguities (each game object can define its own quirks) that jomini has already solved through community-collected edge cases across multiple PDS titles. Writing a parser from scratch would mean rediscovering these edge cases (variables, HSV colors, quoted-vs-unquoted string coercion) one broken tech entry at a time. |
| ImageMagick CLI | `texconv` (Microsoft DirectXTex) | texconv is more authoritative for DDS/DXT decoding (it's Microsoft's own tool) and may have better fidelity for mipmap/compression edge cases, but it's Windows-only and less scriptable in a cross-platform Node pipeline. Since this pipeline explicitly runs on a Windows machine against a local Steam install, texconv is a legitimate alternative — but ImageMagick is recommended as the default because it's cross-platform (in case tooling ever runs in CI/Linux) and its DDS coder already handles Stellaris's icon formats. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Hand-rolled Clausewitz parser (regex-based) | Clausewitz/Jomini format is deceptively irregular: unquoted strings, `@variable` references, `color = hsv { 0.0 0.5 1.0 }` syntax, duplicate keys treated as arrays, and per-file quirks. A regex or naive recursive-descent parser will silently mis-parse edge cases rather than fail loudly — this produces wrong data that's hard to detect (the exact failure mode the project is trying to fix vs. the reference site). | `jomini` (0.10.0) — purpose-built, actively maintained, battle-tested across multiple Clausewitz-engine titles' worth of real-world files. |
| `dagre` (original, unscoped npm package, last published 2022, version 0.8.5) | Abandoned — no updates since 2022, doesn't track modern JS tooling. | `@dagrejs/dagre` (3.0.0, actively maintained fork, published within the last few months) if dagre-style layout is wanted instead of ELK. |
| `dds-js` / speculative pure-JS DDS decoders on npm | Unpublished/deprecated (`dds-js` was pulled from the registry) or brand-new/unproven with near-zero adoption (e.g., `@marcuth/dds-to-png`, published within weeks of this research with no track record). Betting a build pipeline on an unmaintained or unproven single-purpose package is a fragile choice for what should be a boring, solved problem. | `ImageMagick` CLI (native DDS coder, decades of production use) invoked from a Node build script via `child_process`. |
| `sharp` for reading DDS directly | Sharp (built on libvips) has no DDS decoder — it's scoped to web-native formats (JPEG/PNG/WebP/AVIF/TIFF). Attempting to feed it a `.dds` file will simply fail. | ImageMagick for the DDS→PNG decode step, then `sharp` for the subsequent resize/WebP-encode step where it excels. |
| Cytoscape.js or vis-network for the *primary* renderer at this scale | Both are Canvas-based (not WebGL) and rated only "moderate"/"low" performance by community benchmarks at large graph sizes; the project's headline requirement is explicitly "no lag." | `sigma.js` (WebGL) for rendering; keep Cytoscape.js in mind only if in-browser graph algorithms (pathfinding, centrality) become a later requirement. |
| Server-rendered/full-stack framework (Next.js, SvelteKit with a real backend, Remix) | There is no server-side concern here — data is static, generated at build time, and the delivery model is explicitly a static page (mirroring the reference site's GitHub Pages hosting). A full-stack framework adds deployment complexity (server runtime, API routes) for zero benefit. | Vite + React as a pure static SPA; deploy the `dist/` output to GitHub Pages or any static host. |
## Stack Patterns by Variant
- Fall back to `texconv` (DirectXTex) instead of ImageMagick for the DDS decode step
- Because texconv is Microsoft's reference implementation for DXT/BCn formats and may handle edge-case compression modes ImageMagick's coder doesn't, at the cost of being Windows-only (acceptable here since the pipeline already runs on a Windows machine against a local Steam install)
- Add `graphology-shortest-path` (part of the graphology ecosystem) rather than switching renderers
- Because graphology is the data layer under Sigma either way — this stays fully compatible with the WebGL rendering choice
- The jomini-based parser pipeline generalizes reasonably well since mods use the same Clausewitz format, but expect the "one file, one syntax" assumption to break down further — budget real time for a merge/override resolution layer (mod file overrides base-game file) that this stack doesn't currently address
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `sigma@3.0.3` | `graphology@0.26.0`, `@react-sigma/core@5.0.6` | This is the current stable combination as of research date. Do NOT mix `sigma@4.0.0-alpha.x` with the stable `@react-sigma` releases — the 4.x line is pre-release and the React bindings' compatibility with it is unverified. |
| `react@19.x` | `@react-sigma/core@5.0.6` | React Sigma's 5.x line targets modern React; verify peer dependency range at install time since react-sigma has historically been slower to bump peer deps than React itself. |
| `vite@8.x` | `@vitejs/plugin-react` (matching major) | Standard Vite/React pairing, no special notes. |
| `jomini@0.10.0` | Node 12+ (per project docs), but recommend Node 20+ LTS for the build pipeline | No hard upper bound, but jomini ships WASM inlined as base64, so any modern Node runtime works fine. |
## Sources
- npm registry (`npm view`) — direct version/publish-date verification for: jomini (0.10.0, published 3 months ago), sigma (3.0.3 stable / 4.0.0-alpha.7 pre-release), graphology (0.26.0), @react-sigma/core (5.0.6), elkjs (0.11.1), dagre (0.8.5, stale since 2022) vs @dagrejs/dagre (3.0.0, actively maintained), reactflow/@xyflow/react (12.11.2), vite (8.1.3), svelte (5.56.4), sharp (0.35.3), zustand (5.0.14), fuse.js (7.4.2) — HIGH confidence, verified directly against registry metadata.
- [jomini GitHub — Not all Stellaris files parse successfully (Issue #4)](https://github.com/nickbabcock/jomini/issues/4) — HIGH confidence, direct evidence of Clausewitz format edge cases (`@variable` references, `hsv{}` color syntax) that require preprocessing; documented workaround from the library's own issue tracker.
- [jomini npm package](https://www.npmjs.com/package/jomini) / [jomini GitHub](https://github.com/nickbabcock/jomini) — HIGH confidence, official source, confirms zero runtime deps, 200MB/s+ parse speed, <100KB gzipped, multi-Clausewitz-title support including Stellaris.
- [draconas1/stellaris-tech-tree](https://github.com/draconas1/stellaris-tech-tree) — MEDIUM confidence, prior-art verification; confirms prior tech-tree tools used older/non-JS parsers (CWTools/C#) and Canvas-based vis.js, reinforcing that jomini+Sigma is a modern upgrade path not previously available to these projects.
- ImageMagick DDS coder source (`coders/dds.c`) and community discussion threads on `dds:compression` defines — MEDIUM confidence (official source code confirms the coder exists and its options; exact Stellaris-specific compression variant compatibility not independently verified against actual game files in this research pass).
- Direct filesystem inspection of `Z:\SteamLibrary\steamapps\common\Stellaris\gfx\interface\icons\technologies\` — HIGH confidence, confirms icon directory structure exists as expected with DDS files.
- Community sources on Sigma.js vs Cytoscape.js vs React Flow performance characteristics at scale (PkgPulse guides, Memgraph blog, xyflow GitHub discussions/issues) — MEDIUM confidence, cross-referenced across multiple independent sources that agree on the general performance hierarchy (WebGL > Canvas for large graphs; React Flow's DOM-per-node approach has known scaling limits acknowledged by maintainers themselves).
- [React Flow official performance docs](https://reactflow.dev/learn/advanced-use/performance) and [xyflow GitHub discussions on large graphs](https://github.com/xyflow/xyflow/discussions/4975) — HIGH confidence (official docs + maintainer discussion) confirming HTML/DOM-based rendering approach and its scaling ceiling.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
