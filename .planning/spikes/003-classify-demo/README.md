---
spike: 003
name: classify-demo
type: standard
validates: "Given empire identity (001) + gate-annotated tech data (002), when classified, then every tech lands in researched / available-now / reachable-later / never, shown in a pick-an-empire demo"
verdict: VALIDATED
related: [001, 002]
tags: [classification, ui, demo]
---

# Spike 003: classify-demo

## What This Validates

The payoff join: empire researched set (001) + gate verdicts (002) + prerequisite reachability →
the four buckets **researched / available-now / reachable-later / never**, in an interactive
pick-an-empire demo where classification runs **entirely in the browser**.

## How to Run

```
pipeline/node_modules/.bin/tsx .planning/spikes/003-classify-demo/build-demo.ts   # validate + emit demo-data.json
# then serve the folder and open index.html (launch.json config "spike003" → http://localhost:5055)
```

## What to Expect

- `build-demo.ts` prints a per-empire bucket table and the line
  `total researched-but-classified-never = 0`.
- The page: empire dropdown (players first), identity chips, four count cards summing to 678, and
  four scrollable columns. Hovering a "never" tech shows the gate reason.

## Classification rules

```
never          = gate unsatisfiable (002)  OR  prereq chain roots in a never tech
researched     = in the empire's tech_status
available-now  = not researched, gate admits now, ALL direct prerequisites researched
reachable-later= not researched, not blocked, prereqs not all met yet
```

Reachability is a memoized DFS fixpoint over `prerequisites` (the DAG is acyclic per the pipeline's
own validation).

## Investigation Trail

1. **Built-in correctness invariant.** Rather than eyeballing, I asserted a hard invariant: *no
   researched tech may be classified "never"* — that would be a gate false positive. Ran it across
   all 10 players: **total falseNever = 0.** Buckets also sum to 678 for every empire.
2. **"Never" grows past the gate-only number.** Regular empires went 16→18, CUBE 24→32, Nexan
   45→50 once prereq-chain-rooted-in-never techs are folded in (downstream of a gestalt/hive-only
   root). Correct and expected.
3. **In-browser port.** The evaluator (sat/kleene/classify) is ~120 lines of plain JS embedded in
   `index.html`, faithful to `gates.ts`. `demo-data.json` is only **0.38 MB** (pre-normalized gates
   + 123 empires), so the browser does the full classification with no server compute — a direct
   de-risk for spike 004.
4. **Verified via preview.** Loaded the page; switched empires live. Nocturne Drift (regular):
   140/229/291/18. Nexan Collective (machine intelligence): 65/222/341/50, and the "never" column
   correctly explains each gate — `Holo-Entertainment :: is_gestalt=false`,
   `Medical Care :: AND(is_regular_empire, is_individual_machine=false)`,
   `Artificial Workforce :: NOR(gestalt, individual_machine)`, `Fruit Gardens :: has_origin=origin_fruitful`.
   Zero console errors.

## Results

**VALIDATED.** The four-bucket classification is correct (falseNever = 0, buckets sum to total),
runs client-side on 0.38 MB of pre-processed data, and the gate-reason tooltips make "never"
explainable rather than a black box.

**Per-empire sample:**

| Empire | Class | researched | available | reachable | never |
|--------|-------|-----------:|----------:|----------:|------:|
| Nocturne Drift | regular | 140 | 229 | 291 | 18 |
| CUBE-CUBE-CUBE-CUBE | individual-machine | 107 | 202 | 337 | 32 |
| Nexan Collective | machine intelligence | 65 | 222 | 341 | 50 |

**Surprises / notes:**
- The gate-reason tooltip fell out of the normalized tree almost for free and is the feature that
  makes the tool trustworthy — users can see *why* a tech is unreachable.
- `preview_screenshot` times out on this page (heavy gradient + ~700 nodes) though `preview_snapshot`
  / `preview_eval` work fine — a preview-tool quirk, not a page bug. Real build should still smoke-test
  visually.
- AI/FE names still show `NAME_*` tokens (001's deferred name-resolution gap); players resolve.
