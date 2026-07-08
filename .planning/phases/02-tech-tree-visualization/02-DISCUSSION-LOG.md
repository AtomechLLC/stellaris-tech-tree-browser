# Phase 2: Tech Tree Visualization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 2-Tech Tree Visualization
**Areas discussed:** App structure & data loading, Layout strategy, Node visual design, Theming architecture
**Mode:** `--auto` — all gray areas auto-selected; recommended option chosen for each without user prompts.

---

## App structure & data loading

| Option | Description | Selected |
|--------|-------------|----------|
| New `app/` Vite package, copy pipeline data at build, reuse Phase 1 types | Static SPA; tech.json fetched at startup; shared TechSnapshot type prevents drift | ✓ |
| Single monorepo package mixing pipeline + app | Simpler layout, but couples build-time Node deps with client bundle | |
| Redeclare types in the frontend | Faster to start, but two hand-synced copies drift | |

**Auto-selected:** New `app/` package + shared types (recommended — clean pipeline/app boundary per architecture research; the frozen SCHEMA.md contract stays compile-enforced).

---

## Layout strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Tier-from-game-field columns + area swim-lanes, elkjs layered, computed once at load | Authoritative tier data drives columns; true DAG edges; one-shot layout | ✓ |
| Pure ELK edge-inferred layering | Let the algorithm derive layers from prerequisites alone | |
| Runtime force-directed layout | Physics simulation, recomputed on interaction | |

**Auto-selected:** Tier-from-game-field + area bands, one-shot at load (recommended — directly counters the Treant.js tier-misplacement bug that broke the reference tool; force-directed + per-frame relayout is the performance trap pitfalls research flagged).

---

## Node visual design

| Option | Description | Selected |
|--------|-------------|----------|
| Sigma image-node: icon + name label, area=border color, tier=column+axis headers | Uses WebP icons; tier legible without click via layout position | ✓ |
| Rich HTML/DOM nodes (React Flow style) | Nicer per-node content but DOM-per-node ceiling at 600+ nodes | |
| Plain colored dots, no icons | Fast but loses the icon/name "at a glance" criterion | |

**Auto-selected:** Sigma image-nodes (recommended — satisfies TREE-04's icon+name+tier "at a glance" while staying on the WebGL renderer that guarantees no-lag pan/zoom; DOM-per-node was explicitly rejected in STACK.md at this scale).

---

## Theming architecture

| Option | Description | Selected |
|--------|-------------|----------|
| CSS tokens + getComputedStyle bridge into Sigma colors | One token source for DOM and WebGL canvas; dark mode = pure token swap | ✓ |
| Hardcoded colors, retrofit theming later | Faster now, expensive retrofit (features research warned against) | |
| Two palettes (CSS for DOM, JS constants for Sigma) | Works but two sources drift | |

**Auto-selected:** CSS tokens + computed-value bridge (recommended — UIFX-01 requires token-driven styling from day one; the bridge extends the single token source across the WebGL boundary so the v2 dark-mode swap covers the graph too).

---

## Claude's Discretion

- Component tree, `app/src/` folder layout, Zustand store shape
- ELK `layoutOptions` tuning values (tune against the real 678-node graph)
- Node/label sizes, exact area palette values (from tokens)
- Main-thread vs Web Worker for the one-shot layout
- Frontend test approach (smoke render / component tests)

## Deferred Ideas

- Search / filters / highlighting / detail panel / link nav — Phase 3
- Dark mode, beeline, URL state, minimap, flag legend, weight display, unlocks browser, mobile — v2
- Rendering Paradox `§color§!`/`$var$` markup — Info-level cleanup, display verbatim for now
