---
spike: 005
name: empire-coloring
type: standard
validates: "Given the browser save-pipeline + classifier, when wired into the real app as a 'Saved Empire' tab, then dropping a .sav recolors every tech card by bucket on the real 678-node tree"
verdict: VALIDATED
related: [001, 002, 003, 004]
tags: [app, ui, integration, coloring]
---

# Spike 005: empire-coloring (in the real app)

## What This Validates

Does the whole thing land in the **real app** (`app/`)? A new **Saved Empire** tab where the user
drops a `.sav`, picks an empire, and every one of the 678 tech cards recolors by bucket — proving
the integration risk, not just the algorithm.

## Approach (spike shortcuts, called out)

- **Side-loaded gates.** Rather than touch the frozen `TechSchema`/`assemble.ts` during a spike, I
  copied spike 002's `tech-gates.json` to `app/public/data/v4.5.0/` and merge gates by key at
  runtime (`classifyEmpire.ts::fetchGates`). The real build folds a `gate` field into `tech.json`
  and this fetch disappears.
- **Reused logic verbatim.** `gates.ts` + `classify.ts` copied from spikes 002/003 into
  `app/src/lib/empire/` unchanged (they're framework-free). `savLoad.ts` is spike 004's pipeline.
- **`fflate` + `jomini` added to the app** and imported directly — Vite pre-bundles jomini's
  base64-inlined WASM fine. (Real build should lazy-load this so the tree app isn't paying for the
  parser until the tab opens.)
- **Sample-save affordance.** A "Load sample save" button fetches a gitignored local copy for quick
  testing; the real entry point is the drop-zone / file picker.

## What was built

| File | Role |
|------|------|
| `app/src/lib/empire/{gates,classify}.ts` | Copied pure logic (002/003) |
| `app/src/lib/empire/savLoad.ts` | Client-side `.sav` → empires (004 pipeline) |
| `app/src/lib/empire/classifyEmpire.ts` | Glue: fetch gates, build tech list, classify |
| `app/src/components/EmpirePanel.tsx` | Left panel: drop-zone, picker, legend/counts |
| `app/src/components/TechCard.tsx` | +`bucket` prop → `data-bucket` attribute |
| `app/src/components/TechTree.tsx` | +`empireOn`/`bucketMap` state, 3rd toggle tab, panel swap, card coloring |
| `app/src/styles/app.css` | `.tech-card[data-bucket=…]` treatments + panel styles |

## Coloring (user-chosen treatments)

| Bucket | Treatment | CSS |
|--------|-----------|-----|
| researched | thick border | `border-width:3px` + green |
| available now | lit up | gold `outline` + `brightness/saturate` |
| reachable later | faded | `opacity:.42` |
| never | greyscale | `grayscale(1) brightness(.72)` + `opacity:.5` |

Coloring is a per-card `data-bucket` attribute mirroring the existing `data-area`/`data-selected`
pattern, so it layers on the existing layout with no changes to ELK/edges.

## Investigation Trail

1. **Wired the tab.** Extended the `viewMode` toggle to `[Map | Explore | Saved Empire]`; selecting
   the tab swaps `CategoryNav` → `EmpirePanel` and turns on `empireOn`, which passes
   `bucket={bucketMap.get(key)}` to each card. `React.memo` on `TechCard` means only cards whose
   bucket changed re-render on empire-switch.
2. **Verified end-to-end in the real app.** Loaded the sample save via the tab: parsed in-browser,
   auto-selected Nocturne Drift, and the DOM showed **140 researched / 229 available / 291 reachable
   / 18 never** cards — matching spike 003's server numbers exactly, `integrity ok` (falseNever=0).
3. **LOD bug found + fixed.** The "available" glow used `box-shadow`, but the default zoomed-out view
   is in `.lod-simple` mode where `.tree-canvas.lod-simple .tech-card { box-shadow: none }`
   (specificity 0,3,0) suppresses it. Switched the glow to `outline` (LOD rules don't touch it) so
   "lit up" reads at any zoom. Confirmed all four treatments compute at zoomed-out scale.
4. **Visual confirmation.** Screenshot shows the four states clearly distinguishable on the real
   678-node tree; the legend doubles as the color key.

## Results

**VALIDATED.** The Saved Empire tab works in the real app: drop a `.sav` → pick empire → all 678
cards recolor by bucket, correct counts, integrity ok. The integration is clean — coloring is one
data-attribute, the classifier/parse are reused unchanged, and switching empires is cheap.

**Signal for the build:**
- **Fold gates into the pipeline** (`gate` field in `TechSchema`, `normalizePotential` in
  `assemble.ts`) so `tech.json` ships gates and `fetchGates`/the side-loaded file go away.
- **Lazy-load `savLoad`/jomini** (dynamic import) so the parser isn't in the main bundle.
- **Coloring also works in Explore** for free (same per-card attribute) — currently the tab pins the
  Map layout; letting it overlay Explore is a one-line change if wanted.
- **Card border under LOD:** prefer `outline`/`opacity`/`filter` for status treatments — they survive
  the LOD simplification; `box-shadow` does not.

## Note on working tree

The `app/` changes are left **uncommitted** in the working tree (they sit on top of pre-existing WIP
in `TechCard.tsx`/`TechTree.tsx`/`app.css`). Only this spike's planning docs are committed. Review
and fold the app changes into the real feature branch as desired.
