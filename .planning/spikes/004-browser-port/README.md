---
spike: 004
name: browser-port
type: standard
validates: "Given the .sav in a browser file input, when unzipped + parsed client-side, then it finishes fast + low-memory without a server"
verdict: VALIDATED
related: [001, 002, 003]
tags: [browser, performance, unzip, jomini, fflate]
---

# Spike 004: browser-port

## What This Validates

The final-target question: can the **whole** pipeline — unzip the `.sav`, parse the 72 MB
gamestate, extract empires, and classify — run **client-side with no server**? And is it fast and
light enough to be usable?

## Research

- **Unzip:** `fflate` (`unzipSync`) — tiny, zero-dep, same lib works in Node and browser.
- **Parse:** `jomini` — its ESM build **inlines the WASM as base64** (`_loadWasmModule(0, null,
  'AGFzbQ…')` + `globalThis.atob`). Verified by reading `dist/es/index.js`. This means esbuild
  bundles it into **one self-contained module** — no separate `.wasm` file to serve, no loader/CORS
  config. This was the single biggest browser risk and it evaporated.
- **Bundle:** `esbuild --bundle --format=esm --platform=browser` → `bundle.js` **258 KB** (WASM
  base64 is the bulk). Reuses the pure `gates.ts` + `classify.ts` from spikes 002/003 unchanged.

## How to Run

```
cd .planning/spikes/004-browser-port
npm install                     # fflate + jomini
# bundle:
../../../pipeline/node_modules/.bin/esbuild browser-main.ts --bundle --format=esm \
  --platform=browser --outfile=bundle.js
# serve (launch.json config "spike004" → http://localhost:5056) and open index.html
```

Open the page → **▶ Run bundled save** (or drop any `.sav`). Watch the timing breakdown and pick an
empire to classify.

## What to Expect

- Timing breakdown (unzip / decode / parse / extract), JS heap, empire count, and four bucket
  counts summing to 678 with `researched-called-never: 0`.

## Investigation Trail

1. **Bundling risk first.** Before writing UI, confirmed jomini's WASM is base64-inlined → esbuild
   produces a self-contained 258 KB bundle. No `.wasm` serving needed.
2. **Full pipeline in one function.** `extractFromSav(bytes)`: fflate unzip → `TextDecoder(
   'windows-1252')` → jomini parse (same `__root__` wrap as the pipeline) → extract empires (port of
   spike 001) → hand to the spike-003 classifier. Instrumented every stage with `performance.now()`.
3. **Measured on the real 5.8 MB → 68.8 MB save (desktop Chrome via preview):**

   | Stage | Time |
   |-------|------|
   | unzip (fflate) | **365 ms** |
   | decode (win-1252) | 39 ms |
   | **jomini parse (72 MB)** | **3954 ms** |
   | extract 123 empires | 2 ms |
   | **total (→ classify-ready)** | **4360 ms** |
   | JS heap after | **271 MB** |

4. **Fidelity check.** In-browser classification matched server-side to the number: Nocturne Drift
   140/229/291/18, Nexan Collective 65/222/341/50, every sum = 678, falseNever = 0. The ported
   evaluator is faithful.

## Results

**VALIDATED.** The full local-browser pipeline works: drop a `.sav` → unzip → parse → extract →
classify, entirely client-side, in ~4.4 s using ~271 MB JS heap. No server, no `.wasm` fetch, one
258 KB bundle.

**Signal for the build:**
- **Feasible today** on desktop. The one-time ~4 s load wants a progress indicator (the stage
  timings are already there to drive it).
- **jomini-in-browser is a non-issue** — base64-inlined WASM bundles cleanly with esbuild/Vite.
- **`fflate` is the right unzip** — 365 ms for 68.8 MB, shared Node/browser.

**Known gaps / optimization path:**
- **Parse is ~90% of the time and drives the 271 MB heap** because we parse the *entire* 72 MB tree
  and keep only `country` + `player`. The real-build optimization: **slice out just the `country={}`
  and `player={}` blocks and parse only those** (brace-depth scan on the raw text), or use jomini's
  lower-level `Query` API to avoid materializing the whole JS object tree. Expected: sub-second parse
  and a fraction of the memory. Not needed for feasibility — flagged for polish.
- **Memory on low-end / mobile** (271 MB JS + WASM linear memory) is untested; the targeted-slice
  approach above is also the mitigation there.
