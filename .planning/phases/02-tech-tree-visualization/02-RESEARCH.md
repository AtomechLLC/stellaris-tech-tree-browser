# Phase 2: Tech Tree Visualization - Research

**Researched:** 2026-07-08
**Domain:** WebGL graph rendering (sigma.js v3) + DAG layout (elkjs) integration in a React 19 + Vite 8 SPA
**Confidence:** HIGH (all package versions/peer-deps verified against npm registry; API shapes verified against extracted `.d.ts` files and official storybook examples; ELK layout-option semantics MEDIUM — confirmed via official Eclipse ELK reference docs but cross-axis swim-lane behavior required inference, flagged below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**App structure & stack**
- **D-01:** New frontend package at `app/` (sibling to `pipeline/`), separate `package.json`. Stack per PROJECT.md/STACK.md — do not re-litigate: Vite 8 + `@vitejs/plugin-react`, React 19, TypeScript 5, `sigma@3.0.3` (NOT the 4.x alpha) + `graphology@0.26.0` + `@react-sigma/core@5.0.6`, `elkjs@0.11.1`, `zustand@5.0.14`. `fuse.js` is Phase 3 (search) — do not add it here.
- **D-02:** The app is a pure static SPA — no server, no router (single view). `dist/` deploys to any static host. Verify `@react-sigma/core@5.0.6` peer-dep range against React 19 at install time (STACK.md flagged react-sigma lags React bumps); if it blocks, pin React to the highest version its peer range allows and note it — do not switch renderers.

**Data loading & contract enforcement**
- **D-03:** The pipeline output is copied into the app's served assets at build time (e.g. an `app` npm script copies `pipeline/data/v{version}/` → `app/public/data/v{version}/`). The app fetches `tech.json` at startup. Icons are served as static files referenced by URL — no bundling of 803 images.
- **D-04:** The frontend reuses the Phase 1 TypeScript types (`TechSnapshot`, `Tech` from `pipeline/src/schema/tech-snapshot.ts`) rather than redeclaring them, so the frozen contract (SCHEMA.md) stays enforced end-to-end and schema drift is a compile error. Import the type (or a copied `.d.ts`); if cross-package import is awkward, a single shared types module is acceptable — the requirement is one source of truth, not two hand-synced copies.
- **D-05:** Treat every `name`, `description`, and `unlocks.grants[]` string as untrusted plain text per SCHEMA.md's Security Domain — render via React text nodes (auto-escaped), never `dangerouslySetInnerHTML`. Paradox `§color§!`/`$var$` markup ships raw in v1; stripping/rendering it is deferred (Info-level, later) — for Phase 2 it may display verbatim, but MUST NOT be injected as HTML.

**Layout (TREE-01, TREE-02)**
- **D-06:** Assign each node's **layer/column from the game's own `tier` field**, and its **band from `area`** (physics / society / engineering as three stacked horizontal swim-lanes) — do NOT let ELK infer layers purely from edges. Rationale: the game's tier is authoritative and matches how players reason about progression; edge-inferred layering can misplace cross-tier prerequisites (the exact Treant.js failure that sank the reference tool). Use elkjs `layered` with tier-based partitioning/layer constraints; prerequisite flow reads left→right (tier 0 → tier 5).
- **D-07:** All prerequisite edges render as real DAG edges — a multi-prerequisite tech connects to ALL its parents (TREE-01). OR-alternative prerequisites (already flattened in `tech.json`) are drawn as ordinary edges; no AND/OR visual distinction in Phase 2.
- **D-08:** Layout is computed **once at app load** with elkjs (async, showing a brief loading state), then handed to Sigma as fixed node x/y — never recomputed on pan/zoom (per architecture research: layout is one-shot, interaction is pure camera transform). If load-time layout proves too slow at full scale, the fallback is a build-time precompute step emitting `layout.json` — but start with load-time to avoid coupling to the pipeline. Benchmark against the REAL full 678-node graph, not a sample (pitfalls research: full-scale-only bugs).

**Node & rendering (TREE-03, TREE-04)**
- **D-09:** Nodes render via Sigma's image-node program (`@sigma/node-image` or the built-in image renderer) showing the tech's WebP **icon**, with the **localized name** as the node label. **Area** is encoded by node border/ring color; **tier** is legible from the tier-column position reinforced by persistent tier-axis headers/labels (so criterion 4's "shows tier at a glance" holds without clicking). Missing-icon techs use the shipped placeholder (already in the data).
- **D-10:** Pan/zoom uses Sigma's native WebGL camera — no re-layout, no React re-render per frame. Labels may hide below a zoom threshold (Sigma default) to keep hundreds of nodes readable; that is acceptable and expected.

**Theming (UIFX-01)**
- **D-11:** All DOM/CSS styling references CSS custom properties from a single `tokens.css` (`--color-*`, `--space-*`, `--font-*`, area colors as `--area-physics/society/engineering`). Light theme is the `:root` default. No hardcoded colors in components. Dark mode (THEME-01) is v2 — but the token layer must make it a pure token swap with zero component changes.
- **D-12:** Sigma is WebGL and cannot read CSS variables directly. Bridge them: read the computed CSS-token values (via `getComputedStyle`) into the Sigma node/edge color settings at init, so graph colors and DOM colors come from the SAME token source. This keeps the "one theme source" guarantee across the canvas boundary and makes the v2 dark-mode swap cover the graph too.

### Claude's Discretion
- Exact component tree, file/folder layout under `app/src/`, and Zustand store shape.
- Specific ELK `layoutOptions` tuning values (spacing, node placement strategy) — tune against the real graph for readability.
- Node size, label font size, exact area color palette values (must come from tokens, but the values are open).
- Loading-state visual and whether layout runs on the main thread vs a Web Worker (start simplest; Worker only if it blocks the UI too long).
- Test approach for the frontend (component tests / a smoke render); no framework is mandated.

### Deferred Ideas (OUT OF SCOPE)
- Search, filters, prerequisite-chain highlighting, detail panel, tech-to-tech link navigation — Phase 3 (NAV-*/DETL-*).
- Dark-mode toggle (THEME-01), beeline path (BEEL-01), URL state (SHARE-01), minimap (MINI-01), flag legend (FLAG-01), structured weight display (WGHT-01), deep unlocks browser (UNLK-01), mobile layout (MOBL-01) — all v2 (STATE.md Deferred Items).
- Rendering Paradox `§color§!`/`$var$` markup in grant/description text — Info-level cleanup (carried in 01-REVIEW.md IN-01/IN-12); display verbatim for now.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| TREE-01 | User can view the full tech tree with prerequisite edges rendered as a true DAG (multi-prerequisite techs placed correctly, not tree-flattened) | Directed `graphology` edges from every `prerequisites[]` entry (Code Examples — graph construction); ELK `partitioning` prevents the Treant.js-style tier misplacement (Architecture Pattern 2, Don't Hand-Roll row 3) |
| TREE-02 | Tree layout is readable at full scale — organized by tier and research area | ELK `elk.partitioning` for tier columns (native, documented) + post-layout Y-remap for area bands (Architecture Pattern 2; gap flagged in Pitfall 3 and Open Question 2) |
| TREE-03 | User can pan and zoom smoothly at full-tree scale (hundreds of nodes) without lag | Sigma's native WebGL camera (no re-layout/re-render per frame, confirmed via `settings.d.ts` — no auto-layout setting exists to disable); one-shot ELK layout kept off the render/interaction path entirely (Architecture Diagram steps 4-7 vs. step 9) |
| TREE-04 | Tech nodes display icon, localized name, and tier at a glance | Compound `@sigma/node-border` + `@sigma/node-image` program (Architecture Pattern 1) for icon+ring; Sigma's native label renderer for name; tier legible from x-column position, reinforced by a camera-synced tier-axis header (System Architecture Diagram, parallel branch) |
| UIFX-01 | UI styling is built on theme tokens (CSS custom properties) from day one — light theme ships at launch, additional themes require no rework | CSS-to-Sigma bridge function (Architecture Pattern 4) reads `getComputedStyle` once at construction and is written as a reusable/re-callable unit specifically so a future dark-mode token swap doesn't require rework (D-12 compliance) |
</phase_requirements>

## Summary

The stack is locked and requires no re-evaluation. The critical finding of this research: **there is no peer-dependency conflict** between `@react-sigma/core@5.0.6` and React 19 — the package's peer range (`react: '^18.0.0 || ^19.0.0'`) already covers it, and its `sigma: '^3.0.2'` / `graphology: '^0.26.0'` peer ranges match the locked versions exactly. D-02's fallback plan (pin React down, or drop `@react-sigma/core`) is not needed.

The second major finding: sigma.js v3 has **no built-in "ring around an image" node type**. `@sigma/node-image` renders images (with `color` as background/tint fallback only) and has no border option; a separate official package, `@sigma/node-border`, renders concentric-disc borders but no image. The two are combined via sigma's `createNodeCompoundProgram([BorderProgram, ImageProgram])` — this is a documented pattern in sigma's own storybook (`with-images.ts`) and is the correct implementation for D-09's area-ring-on-icon-node requirement.

Third: ELK's `layered` algorithm has a first-class mechanism for pinning nodes into ordered columns by an arbitrary integer (`elk.partitioning.activate` + per-node `elk.partitioning.partition: <tier>`), which is exactly D-06's tier-column requirement. It has **no equivalent first-class mechanism for cross-layer horizontal swim-lanes** (the area bands) — this axis must be handled as a post-layout Y-coordinate remap in application code, not a native ELK option. This is a real gap the planner must account for as its own task, not an assumed ELK capability.

Fourth: `elkjs`'s browser-ready `elk.bundled.js` entry point works with zero configuration (`new ELK()`, no `workerUrl`) because its bundled Node-targeting wrapper (`ELKNode`) silently falls back to an in-process "fake worker" (`elk-worker.min.js` required synchronously, not a real `postMessage` thread) when no worker factory is supplied — this is the exact mechanism that avoids the well-documented Vite+elkjs Web Worker bundling failures reported upstream. Recommendation: import `elkjs/lib/elk.bundled.js` directly and do not attempt to wire a real Web Worker for Phase 2 (matches CONTEXT.md's "start simplest" discretion note).

**Primary recommendation:** Build the app as a single `SigmaContainer` tree from `@react-sigma/core`, construct the graphology graph with fixed `x`/`y` computed once by `elkjs` (partitioned by tier, Y-remapped by area post-layout), render nodes via a compound `node-border` + `node-image` program, and bridge all colors from `getComputedStyle` into Sigma's settings object at construction time — never touch CSS variables again per-frame.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Data fetch (`tech.json` + icons) | Browser / Client | — | Static SPA, no backend; `fetch()` against `public/data/` at runtime (D-03) |
| Graph construction (nodes/edges from Tech records) | Browser / Client | — | Runs once per page load in a React effect/init routine; graphology is an in-memory client-side data structure |
| DAG layout (tier columns + area bands) | Browser / Client | — | D-08 mandates load-time (not build-time) computation; elkjs runs entirely in the browser JS runtime, no server round-trip |
| WebGL rendering (nodes/edges/camera) | Browser / Client | — | Sigma owns a `<canvas>`/WebGL context; entirely client-side, this is the whole point of the WebGL choice |
| Theming source of truth | Browser / Client (CSS) | Browser / Client (Sigma settings, bridged) | `tokens.css` is DOM/CSS; Sigma's WebGL layer cannot read CSS directly and needs a one-time JS bridge read via `getComputedStyle` (D-12) |
| Static asset hosting (tech.json, icons, JS/CSS bundle) | CDN / Static | — | `dist/` output deployed to any static host; no runtime server logic anywhere in this phase |
| Type contract enforcement (`Tech`/`TechSnapshot`) | Build tooling (TypeScript compiler) | — | Compile-time only; erased before shipping to the browser, doesn't correspond to a runtime tier |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite | 8.1.3 | Build tool / dev server | `[VERIFIED: npm registry]` Matches CLAUDE.md pin exactly. |
| @vitejs/plugin-react | 6.0.3 | Vite React plugin | `[VERIFIED: npm registry]` Latest on registry; peer dep `vite: '^8.0.0'` — compatible with the pinned Vite 8. CLAUDE.md doesn't pin an exact plugin-react version; 6.0.3 is current and peer-verified. |
| react / react-dom | 19.2.7 | UI framework | `[VERIFIED: npm registry]` Matches "React 19.x" pin. |
| typescript | 5.9.3 | Language | `[VERIFIED: npm registry]` **Not 5.x latest** (npm `latest` tag currently resolves to `6.0.3`) — Phase 1 (`pipeline/package.json`) explicitly pinned `5.9.3` to resolve a documented 5.x/6.x drift. **The app package must pin the same `5.9.3`**, not `^5.x` or `latest`, both for TS-version consistency across the two packages sharing a type contract (D-04) and to avoid re-litigating the drift Phase 1 already resolved. |
| sigma | 3.0.3 | WebGL graph renderer | `[VERIFIED: npm registry]` Confirmed latest stable on the 3.x line; `4.0.0-alpha.7` exists on the registry but is explicitly out of scope per D-01/STACK.md. |
| graphology | 0.26.0 | Graph data structure | `[VERIFIED: npm registry]` Matches pin exactly; is sigma's required data-layer dependency (`graphology-utils: ^2.5.2` is sigma's own transitive dep, not something to install directly). |
| @react-sigma/core | 5.0.6 | React bindings for Sigma | `[VERIFIED: npm registry]` Matches pin exactly. **Peer deps confirmed:** `{ graphology: '^0.26.0', react: '^18.0.0 \|\| ^19.0.0', sigma: '^3.0.2' }` — React 19 and sigma 3.0.3 both satisfy these ranges with zero conflict. D-02's fallback plan (pin React down) is **not needed** — see Pitfall 1. |
| elkjs | 0.11.1 | DAG layout engine | `[VERIFIED: npm registry]` Matches pin exactly. Use the `elkjs/lib/elk.bundled.js` entry point (see Architecture Patterns) — not the default `elkjs` main export in a browser/Vite context. |
| zustand | 5.0.14 | Client state | `[VERIFIED: npm registry]` Matches pin exactly. Phase 2 usage is minimal (loading/error state, maybe camera-focus target) — most of zustand's intended surface (filters, search query) is Phase 3 scope per CONTEXT.md. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @sigma/node-image | 3.0.0 | Image-node WebGL program | `[VERIFIED: npm registry]` Renders the tech's WebP icon inside the node circle. Peer dep `sigma: '>=3.0.0-beta.10'` — satisfied by 3.0.3. Published 2024-12-12 (part of the official `jacomyal/sigma.js` monorepo, `packages/node-image`), not a third-party package. |
| @sigma/node-border | 3.0.0 | Ring/border WebGL program | `[VERIFIED: npm registry]` Renders the area-color ring (D-09). Peer dep `sigma: '>=3.0.0-beta.17'` — satisfied by 3.0.3. Same official monorepo, `packages/node-border`, published same date as node-image. **This package is not mentioned in STACK.md/CLAUDE.md and must be added to the phase's install list** — it is the only way to achieve D-09's ring requirement (see Pitfall 2). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@sigma/node-border` + `@sigma/node-image` compound program | Hand-rolled custom `NodeProgram` drawing both image and ring in one shader | More control over z-ordering/blending, but reinvents a solved problem sigma's own team already ships as an official package; not worth it for a Phase 2 scope. Use the compound-program pattern. |
| ELK Y-remap post-process for area bands | `elk.layered.crossingMinimization.positionChoiceConstraint` (per-node desired position within layer) | Rejected: this option is explicitly documented as "not part of any of ELK Layered's default configurations, only evaluated as part of `InteractiveLayeredGraphVisitor`" — an unstable/non-default code path, not a supported public API for this use case. Post-process remap is simpler and fully within application control. |
| `elk.bundled.js` (in-process fake worker) | Real Web Worker via `elkjs/lib/elk-api.js` + explicit `workerUrl` | Rejected for Phase 2: real Worker wiring has multiple open Vite bundling issues (see Pitfall 4) for a one-shot, non-recurring computation where main-thread blocking for a few seconds is already an accepted, designed-for UX state (the Loading State spec in UI-SPEC.md). Revisit only if the load-time benchmark (D-08) shows unacceptable main-thread blocking. |

**Installation:**
```bash
npm install react@19.2.7 react-dom@19.2.7 sigma@3.0.3 graphology@0.26.0 @react-sigma/core@5.0.6 @sigma/node-image@3.0.0 @sigma/node-border@3.0.0 elkjs@0.11.1 zustand@5.0.14
npm install -D vite@8.1.3 @vitejs/plugin-react@6.0.3 typescript@5.9.3 @types/react@19 @types/react-dom@19
```

**Version verification performed:** All versions above confirmed via `npm view <pkg> version` / `npm view <pkg> peerDependencies` against the live npm registry on 2026-07-08 (see Package Legitimacy Audit for full provenance).

## Package Legitimacy Audit

All 9 runtime/dev packages this phase introduces (2 new beyond STACK.md's original list: `@sigma/node-image`, `@sigma/node-border`) were checked with `slopcheck scan --pkg npm --json <name>`, explicitly forcing the `npm` ecosystem (the tool's ecosystem auto-detection defaulted to PyPI in this Python-adjacent shell and returned false SLOP verdicts against the wrong registry on the first pass — discarded; re-run with `--pkg npm` is authoritative).

| Package | Registry | Age | Weekly Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------------|-------------|-----------|-------------|
| react | npm | 12+ yrs | 141,560,512 | github.com/facebook/react | OK | Approved |
| react-dom | npm | 12+ yrs | 133,616,855 | github.com/facebook/react | OK | Approved |
| sigma | npm | 8+ yrs (3.x line since 2024) | 226,683 | github.com/jacomyal/sigma.js | OK | Approved |
| graphology | npm | 7+ yrs | 1,201,398 | github.com/graphology/graphology | OK | Approved |
| @react-sigma/core | npm | 3+ yrs (5.x since 2026) | 89,177 | github.com/sim51/react-sigma | OK | Approved |
| @sigma/node-image | npm | published 2024-12-12 | 21,102 | github.com/jacomyal/sigma.js (packages/node-image) | OK | Approved |
| @sigma/node-border | npm | published 2024-12-12 | 27,714 | github.com/jacomyal/sigma.js (packages/node-border) | OK | Approved |
| elkjs | npm | 8+ yrs (first published 2017-07-18) | 2,583,683 | github.com/kieler/elkjs | OK | Approved |
| zustand | npm | 7+ yrs | 40,292,085 | github.com/pmndrs/zustand | OK | Approved |

No `postinstall` scripts found on any of the 9 packages (`npm view <pkg> scripts.postinstall` returned empty for all).

**Packages removed due to slopcheck [SLOP] verdict:** none (the earlier PyPI-scoped false-positive run is disregarded — not a real verdict for this project's ecosystem, documented above for transparency)
**Packages flagged as suspicious [SUS]:** none (npm-scoped scan)

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (single static page load)                                  │
│                                                                       │
│  1. App mount                                                        │
│     │                                                                │
│     ▼                                                                │
│  2. fetch('/data/v{version}/tech.json')  ──── (network) ───► public/│
│     │                                                        static  │
│     │ (parse JSON, optionally re-validate against            host   │
│     │  TechSnapshotSchema shape at runtime — D-04 type import│      │
│     │  is compile-time only, does not itself validate JSON)  │      │
│     ▼                                                                │
│  3. Build graphology DirectedGraph                                   │
│     - addNode(key, { area, tier, name, icon, ...Tech fields })       │
│     - addEdge(prereqKey, techKey) for every prerequisites[] entry    │
│     │                                                                │
│     ▼                                                                │
│  4. Build ELK input graph (id/children/edges mirroring graphology)  │
│     - per-node layoutOptions: { 'elk.partitioning.partition': tier } │
│     - root layoutOptions: algorithm=layered, direction=RIGHT,        │
│       partitioning.activate=true                                    │
│     │                                                                │
│     ▼                                                                │
│  5. await elk.layout(elkGraph)   [one-shot, async, Loading State UI] │
│     │                                                                │
│     ▼                                                                │
│  6. Post-process: remap Y by area band (physics/society/engineering │
│     stacked bands) — ELK's own Y is discarded/renormalized per-band  │
│     │                                                                │
│     ▼                                                                │
│  7. Write resulting x/y back onto graphology node attributes         │
│     (graph.setNodeAttribute(key, 'x', ...), same for 'y')            │
│     │                                                                │
│     ▼                                                                │
│  8. loadGraph(graph) via @react-sigma/core's useLoadGraph()           │
│     - SigmaContainer already constructed with nodeProgramClasses     │
│       (compound border+image program) and settings bridged from      │
│       getComputedStyle(document.documentElement) at mount            │
│     │                                                                │
│     ▼                                                                │
│  9. Sigma renders WebGL canvas; camera pan/zoom is native GPU-driven │
│     interaction — no further layout or React re-render per frame     │
│                                                                       │
│  Parallel: Tier-axis header strip re-projects tier column x-offsets  │
│  from Sigma's camera state on every pan/zoom event (D-09's "tier at  │
│  a glance" persistent header, not part of the WebGL canvas itself)   │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
app/
├── public/
│   └── data/
│       └── v{version}/          # copied from pipeline/data/v{version}/ by an npm script (D-03)
│           ├── tech.json
│           └── icons/*.webp
├── src/
│   ├── styles/
│   │   └── tokens.css           # D-11 single source of truth
│   ├── lib/
│   │   ├── graph/
│   │   │   ├── buildGraph.ts    # tech.json -> graphology DirectedGraph
│   │   │   ├── layout.ts        # graphology -> ELK input -> elk.layout() -> write x/y back
│   │   │   └── areaBands.ts     # post-layout Y remap by area
│   │   ├── sigma/
│   │   │   ├── nodeProgram.ts   # createNodeCompoundProgram([Border, Image])
│   │   │   └── theme.ts         # getComputedStyle bridge -> Sigma settings object
│   │   └── data/
│   │       └── fetchSnapshot.ts # fetch + shape-check tech.json
│   ├── components/
│   │   ├── TechTreeCanvas.tsx   # SigmaContainer + graph load effect
│   │   ├── Header.tsx
│   │   ├── TierAxis.tsx         # camera-synced tier column labels
│   │   ├── Legend.tsx
│   │   └── LoadingOverlay.tsx / ErrorOverlay.tsx
│   ├── App.tsx
│   └── main.tsx
├── scripts/
│   └── copy-data.mjs            # D-03's build-time copy step (npm run predata / prebuild hook)
├── tsconfig.json
├── vite.config.ts
└── package.json
```

### Pattern 1: Compound node program (image + colored ring)

**What:** Combine `@sigma/node-border`'s border program with `@sigma/node-image`'s image program into a single registered node type via sigma core's `createNodeCompoundProgram`.
**When to use:** Any time a node needs both a fill/image AND a stroke/border — exactly D-09's spec (icon fill + area-color ring).
**Example:**
```typescript
// Source: https://raw.githubusercontent.com/jacomyal/sigma.js/main/packages/storybook/stories/3-additional-packages/node-border/with-images.ts
// (official sigma.js storybook example, verified against extracted package .d.ts files)
import { createNodeBorderProgram } from "@sigma/node-border";
import { createNodeImageProgram } from "@sigma/node-image";
import { createNodeCompoundProgram } from "sigma/rendering";
import Sigma from "sigma";

const NodeBorderCustomProgram = createNodeBorderProgram({
  borders: [
    // ring: ~2-3px stroke in the area color (per UI-SPEC Node Visual Spec)
    { size: { value: 3, mode: "pixels" }, color: { attribute: "areaColor" } },
    // fill the remainder with the node's base color (fallback if image fails)
    { size: { fill: true }, color: { attribute: "color" } },
  ],
});

const NodeImageCustomProgram = createNodeImageProgram({
  padding: 0.05,           // small inset so the ring stays visible around the image
  objectFit: "contain",     // per UI-SPEC: never crop the pictogram
  drawingMode: "background", // color is a fallback background, not a tint (icons are full-color art)
});

const NodeCompoundProgram = createNodeCompoundProgram([NodeBorderCustomProgram, NodeImageCustomProgram]);

// at Sigma construction:
new Sigma(graph, container, {
  defaultNodeType: "techNode",
  nodeProgramClasses: { techNode: NodeCompoundProgram },
});

// per-node attributes required by this compound program:
// graph.addNode(key, {
//   x, y, size: 12,
//   color: "#F7F8FA",        // fallback background (--color-bg token)
//   areaColor: "#0072B2",    // resolved from --area-physics/etc at graph-build time
//   image: "/data/v4.5.0/icons/tech_lasers_1.webp",
//   label: "Lasers 1",
// });
```
**Known limitation (Pitfall 5):** overlapping nodes render borders on a layer independent of image z-order, causing visible artifacts at high node density (jacomyal/sigma.js#1427). At the tuned node size/spacing from ELK, overlap should be rare but must be checked visually during implementation against the full 678-node render.

### Pattern 2: ELK tier-partitioning + post-layout area-band remap

**What:** Use ELK's native `partitioning` feature for the tier axis (a supported, documented mechanism), then discard/remap ELK's Y output for the area axis (not a supported ELK mechanism — must be application code).
**When to use:** Exactly D-06's requirement — tier from the game's own field (authoritative x-axis), area as stacked horizontal bands (y-axis).
**Example:**
```typescript
// Source: Eclipse ELK reference docs (eclipse.dev/elk/reference/options/org-eclipse-elk-partitioning-*)
// + elkjs main.d.ts (verified via extracted package types)
import ELK, { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import type { Tech } from "../../types/tech-snapshot"; // see D-04 pattern below

const elk = new ELK(); // no workerUrl/workerFactory needed — see Architecture note below

function buildElkGraph(techs: Record<string, Tech>): ElkNode {
  const children: ElkNode[] = Object.values(techs).map((t) => ({
    id: t.key,
    width: 32,   // graph-space node bounding box (tune against real render)
    height: 32,
    layoutOptions: {
      "elk.partitioning.partition": String(t.tier), // pins the node to column = tier
    },
  }));

  const edges: ElkExtendedEdge[] = Object.values(techs).flatMap((t) =>
    t.prerequisites.map((prereqKey, i) => ({
      id: `${prereqKey}->${t.key}#${i}`,
      sources: [prereqKey],
      targets: [t.key],
    })),
  );

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",                 // tier 0 (left) -> tier 5 (right), per D-06
      "elk.partitioning.activate": "true",       // REQUIRED companion to per-node partition value
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.nodeNode": "40",
    },
    children,
    edges,
  };
}

async function layoutTree(techs: Record<string, Tech>) {
  const elkGraph = buildElkGraph(techs);
  const result = await elk.layout(elkGraph); // Promise; one-shot per D-08

  // result.children[i].x / .y are ELK's computed positions.
  // x is authoritative (tier-partitioned). y is NOT — remap into area bands:
  const AREA_BAND_HEIGHT = 2000; // graph-space units per band; tune against real render
  const AREA_ORDER = ["physics", "society", "engineering"] as const;

  const byId = new Map(result.children!.map((c) => [c.id, c]));
  for (const areaIndex_ of AREA_ORDER.entries()) {
    // group nodes in this area, keep ELK's *relative* y-order within the group
    // (preserves ELK's crossing-minimization quality), then offset into this area's band
  }
  // (full grouping/offset logic is an implementation task, not reproduced in full here —
  //  the key research finding is that this step is REQUIRED and NOT provided by ELK itself)

  return byId;
}
```
**Gotcha:** `elk.partitioning.partition` requires `elk.partitioning.activate: "true"` set at the **root** graph's `layoutOptions` — a per-node `partition` value with no root-level `activate` is silently ignored (per Eclipse ELK reference docs, `org-eclipse-elk-partitioning-activate.html`).

### Pattern 3: elkjs in a Vite/browser context — avoid the Worker entirely

**What:** Import `elkjs/lib/elk.bundled.js` (not the bare `elkjs` package specifier) and construct `new ELK()` with zero options.
**When to use:** Always, for this phase — matches D-08's "start simplest" discretion and sidesteps a class of documented Vite bundling failures.
**Why this works (verified by reading the extracted package source):** `elk.bundled.js`'s browser-facing IIFE wraps `main-node.js`'s `ELKNode` class, which — when no `workerUrl`/`workerFactory` is passed — falls back to `require('./elk-worker.min.js')` inlined synchronously in the same bundle and wraps it in a fake `Worker`-shaped object (`this.worker = new PromisedWorker(worker)`). This means `elk.layout()` still returns a Promise (so `await`-based code works unchanged) but the actual GWT-compiled layout computation runs on the **main JS thread**, not a real background thread. No `new Worker(url)` call, no separate worker file to resolve, no Vite `optimizeDeps`/asset-URL rewriting pitfalls.
```typescript
// Source: react-flow official elkjs example (reactflow.dev/examples/layout/elkjs)
// + verified directly against extracted elkjs@0.11.1 lib/elk.bundled.js source (lines 24-65, 6538-6588)
import ELK from "elkjs/lib/elk.bundled.js";
const elk = new ELK(); // works with zero config; no workerUrl needed in a Vite app
```
**Tradeoff to flag for the planner:** this blocks the main thread during the one-shot layout computation (matches D-08's explicit "benchmark against the real 678-node graph" instruction and UI-SPEC's Loading State, which is designed around exactly this wait). If the benchmark shows unacceptable blocking (multi-second UI freeze with no paint), the fallback is a real Web Worker via `elkjs/lib/elk-api.js` + explicit `workerUrl` pointing at `elkjs/lib/elk-worker.min.js` copied into `public/` — but this reintroduces the Vite worker-bundling pitfall class (see Pitfall 4) and should only be attempted if the simple path proves too slow.

### Pattern 4: CSS token → Sigma settings bridge (D-12)

**What:** Read resolved CSS custom property values once at Sigma construction time; pass them into Sigma's settings object and into per-node/per-edge color attributes at graph-build time.
**When to use:** Any color Sigma needs to render (node fallback color, edge color, label color) — never hardcode a hex value in the TS/TSX that constructs the Sigma graph or settings.
**Example:**
```typescript
// Source: sigma@3.0.3 settings.d.ts (verified via extracted package type declarations)
function readThemeTokens() {
  const style = getComputedStyle(document.documentElement);
  return {
    bg: style.getPropertyValue("--color-bg").trim(),
    edge: style.getPropertyValue("--color-edge").trim(),
    text: style.getPropertyValue("--color-text").trim(),      // add per UI-SPEC Theming Bridge section
    areaPhysics: style.getPropertyValue("--area-physics").trim(),
    areaSociety: style.getPropertyValue("--area-society").trim(),
    areaEngineering: style.getPropertyValue("--area-engineering").trim(),
  };
}

// at SigmaContainer construction (settings prop, per @react-sigma/core SigmaContainerProps):
const tokens = readThemeTokens();
const sigmaSettings: Partial<Settings> = {
  defaultEdgeColor: tokens.edge,
  labelColor: { color: tokens.text },
  nodeProgramClasses: { techNode: NodeCompoundProgram },
};

// at graph-build time, per node (area -> areaColor attribute consumed by Pattern 1's border program):
const AREA_COLOR: Record<Tech["area"], string> = {
  physics: tokens.areaPhysics,
  society: tokens.areaSociety,
  engineering: tokens.areaEngineering,
};
graph.setNodeAttribute(key, "areaColor", AREA_COLOR[tech.area]);
```
**Gotcha:** Sigma reads these values once, at the time `color`/`areaColor`/settings are assigned — it does not observe CSS variable changes. A future dark-mode toggle (v2, THEME-01, explicitly out of scope) would need to re-run this bridge function and call `sigma.setSetting(...)` + re-assign node attributes + `sigma.refresh()`. Not needed for Phase 2, but the token-bridge function should be written as a reusable, re-callable unit (not inlined one-off code) so v2 doesn't require a rewrite — this satisfies D-12's "must not require rework" clause cheaply.

### Anti-Patterns to Avoid

- **Letting graphology-layout or any force-directed algorithm touch node positions:** Sigma/graphology have no built-in auto-layout that runs automatically — but if `graphology-layout` (e.g., `forceAtlas2`) is imported and its `.assign()` function is called even once, it will overwrite the ELK-computed x/y. D-08 requires layout computed once via ELK only; do not add `graphology-layout` as a dependency for Phase 2 at all (STACK.md's original installation list included it for "future runtime graph algorithms" — that's explicitly not this phase's scope).
- **Re-deriving tier/layer purely from edge topology:** ELK's default layered algorithm, with no partitioning, infers layer assignment from the DAG's edge structure alone — this is the exact failure mode D-06 calls out as the reference tool's fatal bug (Treant.js misplacing multi-parent nodes). Always set `elk.partitioning.activate` + per-node `partition` from the game's own `tier` field; never omit this and rely on ELK's default layering heuristic.
- **Hardcoding hex colors anywhere in a `.tsx`/`.ts` file:** every color must originate from `tokens.css`, read via the bridge function (Pattern 4) or via a CSS class for pure-DOM chrome. This includes the Sigma node `color` fallback and `areaColor` attribute — a common mistake is to hardcode the Okabe-Ito palette values directly in graph-construction code instead of reading them from the CSS custom properties.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Node image + colored border rendering | A custom WebGL shader program combining texture sampling and a stroke | `createNodeCompoundProgram([@sigma/node-border, @sigma/node-image])` | Both are official `jacomyal/sigma.js` monorepo packages, purpose-built and battle-tested for exactly this compound-rendering case; a hand-rolled shader risks subtle WebGL bugs (texture atlas management, picking-buffer coordination) that these packages already solve. |
| DAG layered layout | A custom Sugiyama-style layered layout algorithm | `elkjs` (`layered` algorithm) | ELK's layered algorithm is a mature, decades-refined implementation (ported from the Java/Eclipse ELK project) handling crossing minimization, in-layer ordering, and edge routing — reimplementing this is a multi-week research project on its own, and Phase 2's whole point is to avoid the reference tool's layout bugs, not reproduce new ones. |
| Tier-column pinning | Manual post-layout node repositioning by tier after a generic force/tree layout | ELK's native `elk.partitioning` option | This is a first-class, documented ELK feature purpose-built for exactly this ordering constraint — using it correctly (root `activate` + per-node `partition`) is simpler and more robust than fighting a generic layout's output afterward. |

**Key insight:** The two things that ARE genuinely custom in this phase (the compound node program's exact ring/padding tuning, and the area-band Y-remap after ELK layout) are custom precisely because no library owns that specific combination — everything upstream of those two points (image rendering, border rendering, layered DAG layout, column partitioning) has a purpose-built library and must not be reimplemented.

## Common Pitfalls

### Pitfall 1: Assuming a peer-dep conflict exists between @react-sigma/core and React 19 (it doesn't)

**What goes wrong:** CONTEXT.md's D-02 anticipates a possible conflict and prescribes a fallback (pin React down, or drop the wrapper). A planner or implementer might pre-emptively apply that fallback without checking, adding unnecessary complexity (an older React, or hand-rolled Sigma lifecycle code).
**Why it happens:** STACK.md flagged this as a real risk based on "react-sigma has historically been slower to bump peer deps" — a reasonable caution at research time, but the actual registry state (checked 2026-07-08) already shows `@react-sigma/core@5.0.6`'s peer range explicitly includes `^19.0.0`.
**How to avoid:** Install exactly as specified in this document's Installation section; do not add React version overrides or resolutions. Confirm with `npm ls react @react-sigma/core` after install shows no `UNMET PEER DEPENDENCY` warnings.
**Warning signs:** `npm install` printing `ERESOLVE` errors — if this happens, versions have drifted since this research date and must be re-verified against the live registry, not assumed to require D-02's fallback.

### Pitfall 2: Assuming `@sigma/node-image`'s `color` attribute produces a border/ring

**What goes wrong:** `@sigma/node-image`'s options include a `color`/`colorAttribute` setting, which reads as "surely this can make a colored ring" — but per its type declarations, `color` is used only as a background fill fallback (`drawingMode: "background"`) or as a pixel-tint color (`drawingMode: "color"`, for monochrome pictograms) — neither draws a stroke/border around the image.
**Why it happens:** The option name and the D-09 requirement ("area ring color") sound like the same concept but are architecturally different (fill vs. stroke).
**How to avoid:** Use the two-package compound-program pattern (`@sigma/node-border` + `@sigma/node-image` via `createNodeCompoundProgram`, see Architecture Pattern 1) from the start — do not attempt to achieve the ring with `@sigma/node-image` alone, and do not discover this gap mid-implementation.
**Warning signs:** Implementing with only `@sigma/node-image` and finding no visible ring regardless of `color`/`colorAttribute` values tried.

### Pitfall 3: Assuming ELK has a native swim-lane/band mechanism for the area axis

**What goes wrong:** `elk.partitioning` handles the tier (x) axis perfectly, which can lead to assuming a mirrored/orthogonal option handles the area (y) axis equally natively. It does not. The closest real ELK option (`positionChoiceConstraint`) is explicitly documented as not part of any default configuration and only evaluated by an internal `InteractiveLayeredGraphVisitor` — not a supported, stable public API for this use case.
**Why it happens:** Partitioning's "left-to-right column ordering by integer" is such a clean fit for tiers that it's natural to look for the equivalent on the perpendicular axis.
**How to avoid:** Plan for a dedicated post-layout step: after `elk.layout()` resolves, group `result.children` by `tech.area`, sort each group by ELK's own computed `y` (preserving its crossing-minimization quality within the group), then reassign `y` values by offsetting each area's group into a fixed vertical band (e.g., physics: y ∈ [0, 2000), society: [2000, 4000), engineering: [4000, 6000)). This is application code, not an ELK config flag — plan it as an explicit implementation task.
**Warning signs:** Area colors from D-09's ring end up visually scattered vertically instead of forming clean horizontal bands, because raw ELK y-output (which optimizes purely for edge-crossing minimization, unaware of `area`) was used directly.

### Pitfall 4: Wiring a real Web Worker for elkjs in Vite (unnecessary complexity + known bugs)

**What goes wrong:** elkjs's README documents a Worker-based setup (`workerUrl` pointing at `elk-worker.min.js`) as if it's the primary/recommended path. Following that literally in a Vite app runs into multiple open upstream issues: `_Worker is not a constructor` errors, dev-vs-production worker path resolution mismatches, and Vite's dependency pre-bundling rewriting `new URL(...)` worker paths incorrectly.
**Why it happens:** elkjs's docs were written with generic bundler-agnostic guidance in mind, predating some of Vite's specific pre-bundling behavior around `new Worker(new URL(...))` patterns (see `vitejs/vite#20859`).
**How to avoid:** Use `elkjs/lib/elk.bundled.js`'s zero-config `new ELK()` path (Architecture Pattern 3) for Phase 2. This is not a compromise — it's the same code path react-flow's own official elkjs example uses, and it avoids the entire bug class since no real `Worker` is ever constructed.
**Warning signs:** Any error mentioning `_Worker is not a constructor`, `Cannot resolve 'web-worker'`, or worker script 404s in production build but not dev — all are symptoms of trying the explicit-worker path instead of the bundled zero-config path.

### Pitfall 5: Border/image z-order artifacts at high node density

**What goes wrong:** The compound border+image program renders borders on a separate draw layer from images (per `jacomyal/sigma.js#1427`), so when two nodes visually overlap, one node's border can render on top of another node's image regardless of intended stacking, producing a messy/cluttered look.
**Why it happens:** This is an acknowledged upstream limitation of how sigma's compound programs currently composite multiple WebGL draw calls — not a bug in this project's usage, a real constraint of the library combination.
**How to avoid:** Tune ELK's `nodeNode`/`nodeNodeBetweenLayers` spacing generously enough that nodes within the same tier column and adjacent columns don't visually overlap at the default (non-zoomed-in) camera position — this is exactly the tuning CONTEXT.md already flags as Claude's Discretion ("Specific ELK layoutOptions tuning values"). Benchmark this visually against the real 678-node graph, not a small sample (per D-08's mandate).
**Warning signs:** Visible "halo" or fragmented ring artifacts around densely packed nodes in the same tier/area at default zoom.

## Code Examples

### Fetching tech.json and building the graphology graph

```typescript
// Source: graphology@0.26.0 dist/graphology.d.ts (verified via extracted package types)
// + SCHEMA.md (pipeline/SCHEMA.md) — the authoritative tech.json shape
import { DirectedGraph } from "graphology";
import type { TechSnapshot } from "../types/tech-snapshot"; // see D-04 pattern below

async function fetchSnapshot(version: string): Promise<TechSnapshot> {
  const res = await fetch(`/data/v${version}/tech.json`);
  if (!res.ok) throw new Error(`Failed to fetch tech.json: ${res.status}`);
  return res.json(); // NOTE: this is a structural cast, not runtime validation —
                       // consider re-parsing with the Zod TechSnapshotSchema at runtime
                       // if the app package can cheaply depend on `zod` (already a pipeline dep)
}

function buildGraph(snapshot: TechSnapshot): DirectedGraph {
  const graph = new DirectedGraph(); // directed: prerequisite -> dependent (D-07)

  for (const tech of Object.values(snapshot.techs)) {
    graph.addNode(tech.key, {
      label: tech.name,
      tier: tech.tier,
      area: tech.area,
      icon: tech.icon,
      size: 12, // graph-space radius per UI-SPEC Node Visual Spec
    });
  }

  for (const tech of Object.values(snapshot.techs)) {
    for (const prereqKey of tech.prerequisites) {
      // D-07: every prerequisite is a real DAG edge, including OR-alternatives
      // (already flattened upstream by the pipeline per SCHEMA.md)
      if (graph.hasNode(prereqKey)) {
        graph.addEdge(prereqKey, tech.key);
      }
      // else: dangling reference — SCHEMA.md's D-16 strict-fail policy means
      // this should never occur in valid tech.json; if it does, surface it
      // loudly (console.error) rather than silently skipping, since it signals
      // a contract violation between pipeline and frontend.
    }
  }

  return graph;
}
```

### Reusing Phase 1 types without a runtime import (D-04)

Two viable options, both compile-time-only (zero runtime cost, zero bundler wiring):

**Option A — relative `import type` (recommended, simplest given no existing workspace setup):**
```typescript
// app/src/types/tech-snapshot.ts (a one-line re-export file for a clean import path)
export type { Tech, TechSnapshot } from "../../../pipeline/src/schema/tech-snapshot";
```
Requires widening `app/tsconfig.json`'s `include` to reach outside `app/src` (TS6059 "not under rootDir" otherwise — verified via TypeScript's own rootDir-inference behavior). Simplest fix: **omit `rootDir` entirely** from `app/tsconfig.json` (TypeScript infers it from the set of included files when absent) rather than setting `outDir`+`rootDir` explicitly the way `pipeline/tsconfig.json` does — since `app/`'s build tool is Vite/esbuild (which ignores `tsconfig.json`'s `outDir` for its own output), not `tsc` emit.
```json
// app/tsconfig.json — relevant excerpt
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "noEmit": true
    // no rootDir — let TS infer it from included files
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "../pipeline/src/schema/tech-snapshot.ts"]
}
```

**Option B — TypeScript project references (more correct for a real monorepo, more setup cost):**
Add `composite: true` to `pipeline/tsconfig.json`, add a `references: [{ "path": "../pipeline" }]` array to `app/tsconfig.json`. More robust long-term (proper incremental builds, enforced dependency direction) but changes the already-shipped Phase 1 `pipeline/tsconfig.json` — a cross-phase edit CONTEXT.md doesn't explicitly authorize ("do NOT modify the Phase 1 pipeline"). **Recommendation: use Option A** for Phase 2 to respect the "don't touch Phase 1" boundary; revisit Option B only if cross-package type friction becomes a recurring problem.

D-04 explicitly permits a third option ("a single shared types module... one source of truth, not two hand-synced copies") if either of the above proves awkward in practice — but both should work without issue for a type-only import, so start with Option A.

### Wiring SigmaContainer with @react-sigma/core

```tsx
// Source: @react-sigma/core@5.0.6 dist type declarations (SigmaContainer.d.ts, useLoadGraph.d.ts)
import { SigmaContainer, useLoadGraph } from "@react-sigma/core";
import { useEffect } from "react";
import type { Settings } from "sigma/settings";

function GraphLoader({ graph }: { graph: DirectedGraph }) {
  const loadGraph = useLoadGraph();
  useEffect(() => {
    loadGraph(graph); // per useLoadGraph.d.ts: (graph, clear = true) => void
  }, [graph, loadGraph]);
  return null;
}

function TechTreeCanvas({ graph, sigmaSettings }: { graph: DirectedGraph; sigmaSettings: Partial<Settings> }) {
  return (
    <SigmaContainer
      settings={sigmaSettings}
      style={{ width: "100%", height: "100%" }}
    >
      <GraphLoader graph={graph} />
    </SigmaContainer>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `react-sigma` community wrapper (unofficial, various maintainers) | `@react-sigma/core` folded into the official `jacomyal/sigma.js` GitHub org, now at 5.x | Ongoing (per STACK.md, "formerly community-maintained") | Reduces the risk STACK.md originally flagged (react-sigma lagging React version bumps) — the 5.0.6 peer range already supports React 19, so that historical lag has already been closed as of this research date. |
| Community-hacked node border+image combos (custom shaders) | Official `@sigma/node-border` + `@sigma/node-image` packages, designed to compose via `createNodeCompoundProgram` | Both packages published 2024-12-12, part of sigma's official package split (sigma 3.x modularized rendering extras into separate `@sigma/*` packages rather than bundling everything in core) | Removes the need to hand-roll compound rendering that used to require reading sigma's internals directly; still has the known z-order limitation (Pitfall 5) as an open upstream issue, not yet resolved as of this research date. |

**Deprecated/outdated:**
- Sigma 1.x/2.x's monolithic core (all node/edge program types bundled in the main package): superseded by 3.x's modular `@sigma/*` extras split, which is why `@sigma/node-image`/`@sigma/node-border` are separate installs rather than bundled with `sigma` itself.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `fetch('/data/...').json()` alone is sufficient without re-validating against `TechSnapshotSchema` (Zod) at runtime | Code Examples — Fetching tech.json | Low-medium: D-04's type import is compile-time only and provides zero runtime protection against a malformed/corrupted `tech.json` on disk; if the copy step (D-03) or a future pipeline regression ships bad JSON, the app would fail with an unclear runtime TypeError deep in graph-construction code rather than a clean "Couldn't load the tech tree" error state the UI-SPEC already designs for. Recommend the planner consider importing `TechSnapshotSchema` (already a Zod schema, `zod` already a proven pipeline dependency) and calling `.parse()` once at fetch time, surfacing a parse failure as the existing Error State UI. |
| A2 | The exact numeric tuning for `AREA_BAND_HEIGHT`, node `size`/`width`/`height`, and ELK spacing options shown in Code Examples | Architecture Pattern 2, Pitfall 5 | Low: CONTEXT.md explicitly marks these as Claude's Discretion, to be tuned against the real 678-node render — the values shown are illustrative starting points, not verified-correct final numbers. |
| A3 | `@vitejs/plugin-react@6.0.3` (rather than an older 5.x/4.x line) is the correct plugin-react version to pair with Vite 8 | Standard Stack table | Low: peer dep (`vite: '^8.0.0'`) confirms compatibility directly from the registry; CLAUDE.md/STACK.md don't pin an exact plugin-react version, so this is filling a real gap rather than contradicting a locked decision, but it wasn't explicitly reviewed by the user in CONTEXT.md. |

## Open Questions

1. **Does the app package need a runtime JSON schema validator (Zod) or is a structural TypeScript cast sufficient?**
   - What we know: `pipeline/` already depends on `zod@4.4.3` and exports `TechSnapshotSchema`; SCHEMA.md documents strict-fail pipeline-side guarantees (D-16) that make a malformed `tech.json` reaching the frontend unlikely in practice.
   - What's unclear: whether CONTEXT.md's D-04 "reuse types" intent extends to reusing the *Zod schema itself* (which would be a very cheap add — `zod` is already a proven, tested dependency in this codebase) versus staying purely at the type-only level as literally requested.
   - Recommendation: default to type-only reuse (Option A above) to respect D-04's literal scope; flag to the planner as a one-line addition (`TechSnapshotSchema.parse(json)`) worth considering during task-writing, not a blocking research gap.

2. **Exact area-band boundary values and whether ELK's within-band relative Y order should be preserved or a fresh sort should be applied**
   - What we know: ELK's layered algorithm optimizes Y-position purely for edge-crossing minimization, without any awareness of the `area` field: its output Y values are only meaningful relative to other nodes in the same layer, not globally comparable across areas.
   - What's unclear: whether preserving ELK's relative ordering within each area group (sort-stable remap) produces a visually better result than a fresh secondary sort (e.g., by tier then by tech key) once nodes are already split by area — this is a visual-quality judgment call that needs the real 678-node render to evaluate, not something resolvable from documentation alone.
   - Recommendation: implement the sort-stable remap first (simplest, preserves ELK's crossing-minimization work), visually inspect against the real corpus, and only add a custom secondary sort if the stable remap looks poor.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install / Vite dev server / build | Yes | 24.15.0 (confirmed via `node -e` invocation during this research session) | — |
| npm registry access | Package installation | Yes | — confirmed live registry queries succeeded throughout this research session | — |
| `pipeline/data/v4.5.0/tech.json` + icons | D-03's data copy step, all of Phase 2's rendering | Yes | Present on disk per CONTEXT.md's canonical refs (`pipeline/data/v4.5.0/`) | — |

No blocking or fallback-requiring dependencies identified — this phase has no external service/database/CLI-tool dependencies beyond the Node/npm toolchain already in use for Phase 1.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | Static SPA, no auth surface in this phase |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No access-controlled resources |
| V5 Input Validation | Yes | React's default text-node rendering (auto-escaping) for all `name`/`description`/`unlocks.grants[]` strings per D-05; never `dangerouslySetInnerHTML`. This is the primary attack surface this phase touches — untrusted-shaped strings (raw Paradox localisation text, per SCHEMA.md's explicit "treat as untrusted plain text" contract) rendered into the DOM. |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Stored/reflected XSS via tech name/description/grant text containing Paradox markup (`§color§!`, `$variable$` tokens) or accidental HTML-like substrings | Tampering / Elevation of Privilege | React's JSX text-node interpolation (`{tech.description}`) auto-escapes by default — this is sufficient as long as `dangerouslySetInnerHTML` is never used anywhere these fields flow (D-05's explicit requirement). No sanitization library (DOMPurify etc.) is needed for Phase 2 since the display is plain-text verbatim, not HTML rendering of the markup. |
| Malicious/malformed `tech.json` served from a compromised or misconfigured static host | Tampering | Low risk for this phase's threat model (same-origin static asset, build-time-controlled content, no user-supplied data ever reaches `public/data/`) — the Open Question 1 runtime-validation discussion is about data-integrity robustness, not a security boundary. |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view <pkg> version` / `peerDependencies` / `versions` / `time` / `scripts.postinstall`) — direct live queries on 2026-07-08 for: vite (8.1.3), @vitejs/plugin-react (6.0.3, peer `vite: ^8.0.0`), react/react-dom (19.2.7), typescript (5.9.3 confirmed available, `latest` tag is 6.0.3), sigma (3.0.3 stable / 4.0.0-alpha.7 confirmed pre-release), graphology (0.26.0), @react-sigma/core (5.0.6, peer `{graphology: ^0.26.0, react: ^18.0.0 || ^19.0.0, sigma: ^3.0.2}`), elkjs (0.11.1, first published 2017-07-18), zustand (5.0.14), @sigma/node-image (3.0.0, peer `sigma: >=3.0.0-beta.10`), @sigma/node-border (3.0.0, peer `sigma: >=3.0.0-beta.17`).
- Extracted npm tarball contents (`.d.ts` files read directly from downloaded package tarballs) for: `sigma@3.0.3` (`settings.d.ts`, `rendering/index.d.ts`, `rendering/program.d.ts`, `rendering/node-labels.d.ts`, `rendering/programs/edge-line/index.d.ts`), `@sigma/node-image@3.0.0` (`factory.d.ts`, `index.d.ts`), `@sigma/node-border@3.0.0` (`factory.d.ts`, `index.d.ts`, `utils.d.ts`, `README.md`), `elkjs@0.11.1` (`lib/main.d.ts`, `lib/elk-api.d.ts`, `lib/elk.bundled.js` source inspected directly for worker-fallback behavior), `graphology@0.26.0` (`dist/graphology.d.ts`), `@react-sigma/core@5.0.6` (`SigmaContainer.d.ts`, `useLoadGraph.d.ts`, `types.d.ts`) — HIGH confidence, this is the actual shipped API surface, not documentation that could be stale.
- [sigma.js official storybook — `with-images.ts`](https://raw.githubusercontent.com/jacomyal/sigma.js/main/packages/storybook/stories/3-additional-packages/node-border/with-images.ts) — HIGH confidence, official example from the library's own repository demonstrating the exact compound border+image pattern this phase needs.
- [Eclipse ELK reference docs — partitioning.activate](https://eclipse.dev/elk/reference/options/org-eclipse-elk-partitioning-activate.html), [partitioning.partition](https://eclipse.dev/elk/reference/options/org-eclipse-elk-partitioning-partition.html), [direction](https://eclipse.dev/elk/reference/options/org-eclipse-elk-direction.html), [positionChoiceConstraint](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-positionChoiceConstraint.html) — HIGH confidence, official ELK project documentation (elkjs is a JS port of this exact Java project's option set).
- Direct source inspection of `elkjs@0.11.1`'s `lib/elk.bundled.js` (lines 1-65, 6538-6588) — HIGH confidence, confirms the in-process fake-worker fallback mechanism by reading the actual shipped code, not relying on README claims.
- slopcheck (installed via `pip install slopcheck`, run as `python -m slopcheck scan --pkg npm --json <name>` for all 9 packages) — HIGH confidence for the npm-scoped re-run; the initial `install` subcommand run defaulted to the wrong ecosystem (PyPI) and is explicitly disregarded/documented as a discarded false-positive in the Package Legitimacy Audit section.
- npm downloads API (`api.npmjs.org/downloads/point/last-week/<pkg>`) — HIGH confidence, direct registry-adjacent API query for download-count provenance in the audit table.

### Secondary (MEDIUM confidence)
- [GitHub issue jacomyal/sigma.js#1427](https://github.com/jacomyal/sigma.js/issues/1427) (fetched via WebFetch summary) — MEDIUM confidence, community-reported bug against sigma 3.0.0-beta.18; confirmed the border/image z-order limitation exists but the exact behavior at 3.0.3 stable (vs. the beta reported against) wasn't independently re-verified in this research pass.
- [react-flow official elkjs example](https://reactflow.dev/examples/layout/elkjs) (fetched via WebFetch summary) — MEDIUM-HIGH confidence, official docs from a well-established library, cross-verified against elkjs's own bundled-file source code inspection (both agree on `import ELK from 'elkjs/lib/elk.bundled.js'` + zero-config construction).
- WebSearch results on Vite+elkjs worker bundling issues (`vitejs/vite#20859`, `kieler/elkjs#141`, `#142`, `#143`, `#272`) — MEDIUM confidence, multiple independent GitHub issue reports agreeing on the general problem class (worker path resolution breaks under Vite's pre-bundling); not independently reproduced in this research session, but consistent across 4+ separate issue threads.

### Tertiary (LOW confidence)
- None — all findings in this document were either verified directly against extracted package source/types, official documentation, or cross-referenced across multiple independent sources.

## Metadata

**Confidence breakdown:**
- Standard stack (versions/peer-deps): HIGH — every version and peer-dependency range verified directly against the live npm registry on the research date.
- Node rendering architecture (compound program pattern): HIGH — verified against extracted `.d.ts` files from the actual downloaded packages plus an official storybook example demonstrating the exact use case.
- ELK layout architecture (partitioning for tiers): HIGH for the tier axis (directly documented, official Eclipse ELK reference), MEDIUM for the area-band axis (no native ELK mechanism exists — this is an inferred application-level solution, not a documented ELK feature, flagged explicitly as Open Question 2).
- elkjs/Vite bundling: HIGH — confirmed by direct source-code inspection of the shipped `elk.bundled.js`, not just documentation claims, cross-verified against the react-flow official example using the identical import path.
- Pitfalls: HIGH — each pitfall traced to either a specific GitHub issue, a specific type-declaration gap discovered during extraction, or a directly-observed research-session event (the slopcheck ecosystem mis-detection).

**Research date:** 2026-07-08
**Valid until:** 30 days (2026-08-07) — npm-ecosystem package versions and peer-dep ranges can shift; re-verify `npm view` output for all 9 packages if planning/implementation is delayed past this window. ELK/sigma architectural findings (compound programs, partitioning semantics) are stable library-design facts unlikely to change even if versions bump.

---
*Phase: 2-Tech Tree Visualization*
*Research completed: 2026-07-08*
