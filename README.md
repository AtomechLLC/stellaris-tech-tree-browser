# Xelnath's Stellaris Tech Finder

A fast, modern, interactive tech tree for **Stellaris v4.5.0 "Cygnus"** — built
straight from the current game files. It replaces the outdated community tool (stuck
on an old patch, with stale data and a clunky UI) with accurate, up-to-date technology
data in an interface you can actually explore.

**Core value:** find any technology and understand how to reach it — accurate 4.5.0
data, presented clearly, navigable without friction across all **678 technologies**.

![Tech tree — Map view](docs/screenshots/1-map.png)

---

## Features

- **Three views** — a banded **Map** of the whole tree, a collapsible **Explore**
  dependency tree, and a **Saved Empire** overlay that colors the tree from your
  actual `.sav`.
- **Fast** — DOM cards on an imperative pan/zoom canvas with level-of-detail tiles;
  the full 678-node tree stays smooth to drag and zoom.
- **Rich detail on hover** — cost, research-weight modifiers, description,
  prerequisites, unlocks, and what each tech leads to.
- **Fuzzy find** (`F`) — jump to any tech by name, even one that's filtered out, and
  it reveals the path to reach it.
- **Filter by area / category** with live counts, isolate a branch, and re-pack the
  layout to close gaps.
- **Shareable links** — the current view (mode, selection, filters, expansion) is
  encoded in the URL.
- **Accurate data pipeline** — parses the real game files with `jomini`, so a new
  patch is a re-run, not a re-transcribe.

---

## The three modes

### 🗺️ Map

The default view: a banded swimlane layout where each category is a horizontal band
and tiers flow left → right, so the whole tree is visible at a glance.

![Map close-up](docs/screenshots/4-map-closeup.png)

### 🔍 Explore

Double-click any tech to focus its **dependency neighborhood** — its entire recursive
prerequisite chain to the left, the techs that depend on it to the right, with the
path highlighted in gold.

![Explore close-up](docs/screenshots/6-explore-closeup.png)

### 🚀 Saved Empire

Drop in a Stellaris `.sav` (parsed **entirely in your browser** — nothing is
uploaded), pick an empire, and every tech is recolored: **Researched** (green),
**Available now** (lit), **Reachable later** (faded), or **Never** (greyed out for
that empire).

![Saved Empire close-up](docs/screenshots/7-empire-closeup.png)

> 📖 Full walkthrough of every mode and shortcut: **[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)**

---

## Keyboard & mouse

| Input | Action |
|-------|--------|
| **Drag** / **Wheel** | Pan / zoom toward cursor |
| **Hover** | Tech detail tooltip |
| **Click** / **Double-click** | Select / focus dependency tree |
| **F** | Find a technology |
| **C** / **Shift+C** | Open / collapse child techs |
| **Backspace** / **Esc** | Back / deselect |

---

## Getting started

**Prerequisites:** Node 20+, a local Stellaris install, and ImageMagick 7.x (for the
one-time icon decode in the data pipeline).

### 1. Generate the data (once per game patch)

The pipeline reads your local game files and emits `tech.json` + web-ready icons.

```bash
cd pipeline
npm install
npm run build:data
```

It locates the game via (in order): a `--game-root` flag, the
`STELLARIS_INSTALL_PATH` env var, a config file, or the default
`Z:\SteamLibrary\steamapps\common\Stellaris`. Output lands in `pipeline/data/v4.5.0/`.

### 2. Run the app

```bash
cd app
npm install
npm run dev
```

`predev` copies the pipeline output into the app automatically, then Vite serves it at
`http://localhost:5173`.

### Build & test

```bash
cd app && npm run build     # type-check + static build → app/dist/
cd app && npm run test      # Vitest (app)
cd pipeline && npm run test  # Vitest (pipeline)
```

The `dist/` output is a static SPA — deploy it to any static host (GitHub Pages, etc.).

---

## Tech stack

| Area | Choice |
|------|--------|
| Build / dev | **Vite 8** + **React 19** + **TypeScript 5** |
| Layout | **elkjs** (banded Map layout, computed once) |
| Data pipeline | **jomini** (Clausewitz parser, build-time) + **ImageMagick** (DDS→PNG) + **sharp** (WebP) |
| Save parsing | **fflate** (unzip) + **jomini**, all client-side |
| State / search | **zustand** + fuzzy find |

Rendering is a custom DOM-card canvas rather than a graph library, tuned so pan/zoom
never triggers a React re-render.

---

## Data accuracy & assets

- Technology data reflects **Stellaris v4.5.0** — being current is the whole point of
  this project. Re-running the pipeline is how it tracks future patches.
- Game icons and art are **Paradox Interactive IP**, used here under the same
  personal-use / community-tool conventions as the reference site they replace.

*Screenshots in [`docs/screenshots/`](docs/screenshots/) are captured from the running
dev server.*
