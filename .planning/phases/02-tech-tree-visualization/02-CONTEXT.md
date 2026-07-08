# Phase 2: Tech Tree Visualization - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the client-side web app (a new `app/` Vite package) that loads Phase 1's
`data/v4.5.0/tech.json` + WebP icons and renders the complete tech tree as a
true multi-parent DAG, laid out by research area and tier, with smooth WebGL
pan/zoom at full scale (678 techs). Establishes the CSS-token theming
foundation. Covers TREE-01…TREE-04 and UIFX-01.

**In scope:** app scaffold + data loading, graph construction (graphology),
DAG layout (elkjs), WebGL rendering (sigma.js) with icon+label+tier-legible
nodes, pan/zoom, light theme on CSS tokens.

**Out of scope (later phases):** search, filters, prerequisite-chain
highlighting, detail panel, tech-to-tech link navigation (all Phase 3 —
NAV-*/DETL-*). Dark mode toggle, beeline path, URL state, minimap, flag
legend, structured weight display (all v2). Do NOT modify the Phase 1
pipeline or the frozen `tech.json` contract.

</domain>

<decisions>
## Implementation Decisions

### App structure & stack
- **D-01:** New frontend package at `app/` (sibling to `pipeline/`), separate `package.json`. Stack per PROJECT.md/STACK.md — do not re-litigate: Vite 8 + `@vitejs/plugin-react`, React 19, TypeScript 5, `sigma@3.0.3` (NOT the 4.x alpha) + `graphology@0.26.0` + `@react-sigma/core@5.0.6`, `elkjs@0.11.1`, `zustand@5.0.14`. `fuse.js` is Phase 3 (search) — do not add it here.
- **D-02:** The app is a pure static SPA — no server, no router (single view). `dist/` deploys to any static host. Verify `@react-sigma/core@5.0.6` peer-dep range against React 19 at install time (STACK.md flagged react-sigma lags React bumps); if it blocks, pin React to the highest version its peer range allows and note it — do not switch renderers.

### Data loading & contract enforcement
- **D-03:** The pipeline output is copied into the app's served assets at build time (e.g. an `app` npm script copies `pipeline/data/v{version}/` → `app/public/data/v{version}/`). The app fetches `tech.json` at startup. Icons are served as static files referenced by URL — no bundling of 803 images.
- **D-04:** The frontend reuses the Phase 1 TypeScript types (`TechSnapshot`, `Tech` from `pipeline/src/schema/tech-snapshot.ts`) rather than redeclaring them, so the frozen contract (SCHEMA.md) stays enforced end-to-end and schema drift is a compile error. Import the type (or a copied `.d.ts`); if cross-package import is awkward, a single shared types module is acceptable — the requirement is one source of truth, not two hand-synced copies.
- **D-05:** Treat every `name`, `description`, and `unlocks.grants[]` string as untrusted plain text per SCHEMA.md's Security Domain — render via React text nodes (auto-escaped), never `dangerouslySetInnerHTML`. Paradox `§color§!`/`$var$` markup ships raw in v1; stripping/rendering it is deferred (Info-level, later) — for Phase 2 it may display verbatim, but MUST NOT be injected as HTML.

### Layout (TREE-01, TREE-02)
- **D-06:** Assign each node's **layer/column from the game's own `tier` field**, and its **band from `area`** (physics / society / engineering as three stacked horizontal swim-lanes) — do NOT let ELK infer layers purely from edges. Rationale: the game's tier is authoritative and matches how players reason about progression; edge-inferred layering can misplace cross-tier prerequisites (the exact Treant.js failure that sank the reference tool). Use elkjs `layered` with tier-based partitioning/layer constraints; prerequisite flow reads left→right (tier 0 → tier 5).
- **D-07:** All prerequisite edges render as real DAG edges — a multi-prerequisite tech connects to ALL its parents (TREE-01). OR-alternative prerequisites (already flattened in `tech.json`) are drawn as ordinary edges; no AND/OR visual distinction in Phase 2.
- **D-08:** Layout is computed **once at app load** with elkjs (async, showing a brief loading state), then handed to Sigma as fixed node x/y — never recomputed on pan/zoom (per architecture research: layout is one-shot, interaction is pure camera transform). If load-time layout proves too slow at full scale, the fallback is a build-time precompute step emitting `layout.json` — but start with load-time to avoid coupling to the pipeline. Benchmark against the REAL full 678-node graph, not a sample (pitfalls research: full-scale-only bugs).

### Node & rendering (TREE-03, TREE-04)
- **D-09:** Nodes render via Sigma's image-node program (`@sigma/node-image` or the built-in image renderer) showing the tech's WebP **icon**, with the **localized name** as the node label. **Area** is encoded by node border/ring color; **tier** is legible from the tier-column position reinforced by persistent tier-axis headers/labels (so criterion 4's "shows tier at a glance" holds without clicking). Missing-icon techs use the shipped placeholder (already in the data).
- **D-10:** Pan/zoom uses Sigma's native WebGL camera — no re-layout, no React re-render per frame. Labels may hide below a zoom threshold (Sigma default) to keep hundreds of nodes readable; that is acceptable and expected.

### Theming (UIFX-01)
- **D-11:** All DOM/CSS styling references CSS custom properties from a single `tokens.css` (`--color-*`, `--space-*`, `--font-*`, area colors as `--area-physics/society/engineering`). Light theme is the `:root` default. No hardcoded colors in components. Dark mode (THEME-01) is v2 — but the token layer must make it a pure token swap with zero component changes.
- **D-12:** Sigma is WebGL and cannot read CSS variables directly. Bridge them: read the computed CSS-token values (via `getComputedStyle`) into the Sigma node/edge color settings at init, so graph colors and DOM colors come from the SAME token source. This keeps the "one theme source" guarantee across the canvas boundary and makes the v2 dark-mode swap cover the graph too.

### Claude's Discretion
- Exact component tree, file/folder layout under `app/src/`, and Zustand store shape.
- Specific ELK `layoutOptions` tuning values (spacing, node placement strategy) — tune against the real graph for readability.
- Node size, label font size, exact area color palette values (must come from tokens, but the values are open).
- Loading-state visual and whether layout runs on the main thread vs a Web Worker (start simplest; Worker only if it blocks the UI too long).
- Test approach for the frontend (component tests / a smoke render); no framework is mandated.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The Phase 1 → Phase 2 contract (MUST read first)
- `pipeline/SCHEMA.md` — the full `tech.json` contract this phase consumes: `meta` + `techs` shape, `Tech` fields, the two-component `unlocks`, the plain-text/no-HTML security contract, determinism. THE authoritative input spec.
- `pipeline/src/schema/tech-snapshot.ts` — the Zod schema / TS types (`TechSnapshot`, `Tech`) to reuse (D-04).
- `pipeline/data/v4.5.0/tech.json` — the real generated snapshot (678 techs) to develop and benchmark against. Icons at `pipeline/data/v4.5.0/icons/`.

### Stack & architecture (project-level)
- `.planning/research/STACK.md` — prescriptive frontend stack, exact versions, the sigma 3.x-not-4.x-alpha constraint, the react-sigma peer-dep caveat, what NOT to use (React Flow/Cytoscape at this scale).
- `.planning/research/ARCHITECTURE.md` — two-stage design; the "layout precomputed once, not per-frame" pattern (D-08).
- `.planning/research/PITFALLS.md` — the Treant.js tier-misplacement failure (D-06) and the "benchmark against the full real graph, not a sample" mandate (D-08).
- `CLAUDE.md` — pinned stack versions and rationale.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pipeline/src/schema/tech-snapshot.ts` — the `Tech`/`TechSnapshot` types to import rather than redeclare (D-04).
- `pipeline/data/v4.5.0/` — the real snapshot + 803 icons; the app's only data dependency.

### Established Patterns
- Phase 1 established: TypeScript strict, Vitest for tests, deterministic/typed data. The `app/` package should mirror that discipline (TS strict, typed data loading, a smoke test).

### Integration Points
- Input boundary: `app/` consumes `pipeline/data/v{version}/tech.json` + icons via a build-time copy (D-03). No other coupling — the app never imports pipeline runtime code, only its published types (D-04) and its data output.

</code_context>

<specifics>
## Specific Ideas

- The reference tool's fatal navigation bug was a tree-only layout (Treant.js) misplacing multi-parent nodes into wrong tier columns. D-06 (tier from the game's own field + true DAG edges) is the direct countermeasure and is the phase's most important correctness property after "it renders at all."
- "No lag" (headline requirement) is specifically about pan/zoom interaction — Sigma's WebGL camera delivers that (D-10). One-shot layout cost at load is a separate, acceptable concern (D-08).

</specifics>

<deferred>
## Deferred Ideas

- Search, filters, prerequisite-chain highlighting, detail panel, tech-to-tech link navigation — Phase 3 (NAV-*/DETL-*).
- Dark-mode toggle (THEME-01), beeline path (BEEL-01), URL state (SHARE-01), minimap (MINI-01), flag legend (FLAG-01), structured weight display (WGHT-01), deep unlocks browser (UNLK-01), mobile layout (MOBL-01) — all v2 (STATE.md Deferred Items).
- Rendering Paradox `§color§!`/`$var$` markup in grant/description text — Info-level cleanup (carried in 01-REVIEW.md IN-01/IN-12); display verbatim for now.

</deferred>

---

*Phase: 2-Tech Tree Visualization*
*Context gathered: 2026-07-08*
