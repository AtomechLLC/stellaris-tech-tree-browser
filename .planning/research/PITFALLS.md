# Pitfalls Research

**Domain:** Game-data visualizer (Stellaris tech tree, Clausewitz script parsing, interactive DAG rendering)
**Researched:** 2026-07-07
**Confidence:** HIGH (parsing pitfalls verified directly against live Stellaris 4.5.0 files; rendering/layout pitfalls MEDIUM-HIGH via multiple corroborating sources; reference-tool failure diagnosis HIGH via direct inspection of bloodstainedcrow repo and its islaytzash fork)

## Critical Pitfalls

### Pitfall 1: Naive Clausewitz Parser Breaks on Real Files (not a JSON-like format)

**What goes wrong:**
Developers assume Clausewitz script ("PDX script") is basically JSON/YAML with different brackets and write a quick key-value parser. It breaks immediately on real 4.5.0 tech files because the format supports: `@variable` references (`cost = @tier2cost1`), inline math (`@[ ... ]` expressions with `+ - * / %` and `|abs|`), duplicate/repeated keys that are semantically meaningful (multiple `modifier = { }` blocks inside one `weight_modifier`, each an independent conditional multiplier — not a single object to merge), values that are sometimes a scalar and sometimes a full scripted object for the *same key* (`cost` is a bare number for most techs but a `{ factor = ... modifier = { ... } }` block for others, per the game's own documentation file), list values with unquoted or quoted strings inconsistently (`prerequisites = { "tech_x" tech_y }` — both forms are legal), and comments (`#`) that can appear mid-line after real content.

**Why it happens:**
The format looks deceptively simple ("just braces and equals signs") from a glance at one file. Developers pick 2-3 example techs, build a parser that handles those, and only discover the shape variance when parsing the full corpus (33 files, thousands of lines) — usually late, after the data model is already baked into the UI layer.

**How to avoid:**
- Treat every field as potentially polymorphic (scalar OR block) unless proven otherwise across the *entire* corpus, not a sample.
- Build the parser as a generic tokenizer → AST (list of key/value pairs preserving duplicates and order) *before* writing any Stellaris-specific interpretation layer. Do not collapse duplicate keys into a JS object (`{modifier: ...}`) at parse time — that silently drops all but the last `modifier` block. Keep them as an array of `[key, value]` pairs.
- Resolve `@variable` references in a separate pass after parsing all files (variables like `@tier2cost1` are defined once, centrally, and referenced across many tech files — order of file parsing matters).
- Write the parser against the *actual* 4.5.0 `common/technology/*.txt` corpus from day one, not hand-crafted test fixtures. Run it against all 33 files and manually diff/spot-check a sample of the output before building anything downstream.
- Consider an existing Clausewitz parsing library (e.g., community JS/Python PDX-script parsers) as a starting point rather than writing a tokenizer from scratch — but verify it handles inline math and scripted variables specifically, since many only handle the basic key-value-block case.

**Warning signs:**
- Parser "works" on a handful of manually-picked techs but the full corpus produces techs missing a `cost`, missing all but one `weight_modifier` condition, or with `@tier2cost1` literally rendered as a string in the UI.
- Any place in the code that does `obj[key] = value` while building the parsed structure (silently overwrites duplicate keys).

**Phase to address:**
Data pipeline / parser phase (Phase 1). This must be solved before any rendering work — the entire project's credibility depends on accurate data, and this is the highest-risk technical unknown.

---

### Pitfall 2: DLC-Gating and Conditional Availability Modeled as an Afterthought

**What goes wrong:**
Techs are gated behind DLC ownership not through a single explicit `dlc = "Ancient Relics"` field but implicitly — file naming (`00_ancient_relics_tech.txt`, `00_biogenesis_tech.txt`) is the only reliable per-file signal, and some techs additionally use `potential`/`is_enabled` triggers referencing flags, origins, or `has_dlc`-style checks buried in scripted trigger blocks. If DLC association is inferred only from in-tech-file conditions rather than the file/folder it came from, many DLC techs will be silently misclassified as "base game," and the "filter by DLC" requirement (explicitly called out in PROJECT.md) will be wrong or incomplete.

**Why it happens:**
There's no clean `dlc_required` field to key off; it takes cross-referencing file naming conventions against DLC names, and Paradox is not fully consistent (e.g., some base-game files also carry DLC-specific bonus techs conditionally unlocked by triggers rather than being isolated in their own file).

**How to avoid:**
- Build the DLC mapping as an explicit, hand-maintained lookup table (filename → DLC display name) as a first-class part of the data pipeline, reviewed against the official DLC list, rather than trying to derive it purely from parsing.
- Cross-check against `potential`/trigger conditions that reference DLC-gated flags/origins (e.g., machine-age- or biogenesis-specific origin checks) to catch techs whose *availability* is DLC-gated even if the tech definition lives in a base file.
- Since this mapping will need updating with every new DLC/patch, isolate it in one small, clearly-documented config file — this is exactly the kind of thing that rotted in the reference tool.

**Warning signs:**
- "Filter by DLC" in the UI shows techs in the wrong DLC bucket, or DLC techs unfiltered into "base game."
- New DLC ships and the filter dropdown doesn't include it because the mapping wasn't touched.

**Phase to address:**
Data pipeline phase (Phase 1), with the mapping table treated as versioned config that gets revisited explicitly in the "update to new game version" workflow (see Pitfall 6).

---

### Pitfall 3: Weight/AI-Weight Modifiers Treated as Simple Numbers Instead of Conditional Trees

**What goes wrong:**
`weight_modifier` blocks are lists of independent conditional multipliers (each a `modifier = { factor = X, <trigger conditions> }`), and triggers themselves nest arbitrarily (`NOT = { years_passed > 10 }`, `any_neighbor_country = { has_technology = ... }`, `has_tradition = ...`). A tool that tries to show "the weight" as a single number, or that flattens this into a summary string via string concatenation, will either crash on unexpected nesting or produce a nonsensical/misleading display. This is a real feature callout in PROJECT.md ("clear tech detail display... weight").

**Why it happens:**
Developers want a clean UI (e.g., "weight: 1000") and underestimate how deep and varied the conditional trigger language is — it is effectively a full scripting language for conditions, not a flat data structure.

**How to avoid:**
- Don't try to fully "explain" every trigger in natural language for v1. Instead, render weight modifiers as a structured, collapsible list showing factor + a best-effort human-readable summary of the raw condition (falling back to showing the raw condition key names when a friendly translation isn't available).
- Build a small library of translation rules for the *common* trigger types actually observed in the corpus (`years_passed`, `has_technology`, `has_tradition`, `any_neighbor_country`, `NOT`, `has_trait`, etc.) rather than trying to write a general-purpose script-to-English engine.
- Scope this explicitly: perfect trigger translation is not required for launch; showing raw-but-structured data beats a crash or a wrong summary.

**Warning signs:**
- UI code that does string matching / regex on trigger blocks to build sentences — fragile and will break on the first unseen trigger shape.
- Any place that assumes `weight_modifier` has exactly one `modifier` child.

**Phase to address:**
Data pipeline phase (Phase 1) for parsing structure; Tech detail UI phase for the display/translation layer. Flag this phase for deeper research if the roadmap wants full natural-language weight explanations — the trigger vocabulary is large.

---

### Pitfall 4: Technology Swaps and Displayed-vs-Underlying Tech Confusion

**What goes wrong:**
The `technology_swap` mechanism (confirmed in the game's own tech documentation stub) lets a tech display as a *different* tech (different name/icon/effects) depending on a runtime trigger — e.g., corvette tech becomes "small brawlers" tech for bio-ship empires. A visualizer that doesn't know this exists will show only the canonical name and miss that the game can present an entirely different presentation for the same tech node. Getting this wrong isn't fatal for a static reference tool (there's no "current empire" context), but naively parsing `technology_swap` blocks as if they were normal child techs (extra nodes/edges) would corrupt the graph.

**Why it happens:**
It's a rare, easy-to-miss block type buried inside otherwise normal tech definitions; a generic recursive parser might treat its `name`/`trigger`/`area`/`category` keys as if they were properties of the outer tech.

**How to avoid:**
- Explicitly special-case `technology_swap` in the parser: recognize the key, and for a v1 static reference tool, treat it as tooltip/footnote metadata ("this tech is renamed to X for bio-ship empires") rather than a separate graph node.
- Do not let it silently pollute the outer tech's fields (e.g., overwriting `area`/`category`) during a naive recursive merge.

**Warning signs:**
- Tech count in the parsed dataset is higher than the actual number of `tech_*` top-level keys (indicates swap blocks leaking in as separate entries).
- A tech's displayed category/area doesn't match what's shown in-game for the "default" (non-swapped) case.

**Phase to address:**
Data pipeline phase (Phase 1) — parser correctness. Low priority for UI treatment; can be a stretch-goal footnote.

---

### Pitfall 5: DOM-Heavy SVG Rendering and Naive Force Layout Collapse at Full Tree Scale

**What goes wrong:**
Stellaris 4.5.0 has hundreds of techs across 3 areas and 5+ tiers. Rendering every tech as a full SVG `<g>` with nested `<rect>`, `<text>`, `<image>` (icon), and per-edge `<path>` elements — then re-running a `d3-force` physics simulation on every interaction (pan, zoom, click, filter) — creates thousands of DOM nodes and forces the browser to re-layout/re-paint continuously. Force-directed layouts are also fundamentally the wrong tool for a DAG with a natural partial order (tiers/prerequisites): they produce a "hairball" that doesn't respect tier progression and re-settles into a different (jarring) configuration every time a node is added/removed/filtered, destroying the user's mental map.

**Why it happens:**
Force-directed graphs are the default "cool graph visualization" demo everyone reaches for (d3-force is the most common tutorial), and it's easy to prototype quickly. The performance and readability cliff only appears once real data (hundreds of nodes, not a 20-node demo) is loaded.

**How to avoid:**
- Do not use physics-based force simulation for the primary layout. Use a deterministic layered/hierarchical DAG layout (see Pitfall 7) computed once (or once per filter state), not re-run continuously.
- Prefer Canvas (or WebGL) rendering over one-DOM-node-per-tech SVG once node count is in the hundreds; if SVG is kept for crispness/accessibility, minimize DOM depth per node (flatten to as few elements as possible, use `<use>` for repeated icons) and virtualize/cull off-screen nodes and edges rather than keeping all in the DOM.
- Only recompute layout on data/filter changes, not on pan/zoom/click — pan and zoom should be pure CSS/canvas transforms against a pre-computed layout, not a re-layout trigger.
- Debounce/throttle any interaction-driven re-renders; if using a simulation for minor jitter/collision-avoidance, cap iterations and freeze positions once settled (do not run the simulation indefinitely).

**Warning signs:**
- Frame rate drops or input lag appears only after loading the *full* tree (works fine with a 30-node test fixture, degrades badly at 300+).
- Pan/zoom feels sluggish or nodes visibly "jiggle"/re-settle during normal interaction.
- Browser dev tools show a large, deep DOM tree (thousands of nodes) or long "recalculate style/layout" entries in the performance profile.

**Phase to address:**
Rendering/graph engine phase — this is a foundational architecture decision, not a later optimization. Must be decided (canvas vs SVG, layout algorithm) before building out node/edge visuals, since retrofitting a rendering strategy change later is expensive. Flag for deeper research: benchmark canvas vs SVG vs WebGL graph libraries specifically at ~500-800 node / ~1000+ edge scale before committing.

---

### Pitfall 6: Manual, Per-Version Data Pipeline (The Actual Cause of the Reference Tool's Staleness)

**What goes wrong:**
Direct inspection of the bloodstainedcrow tool's repository shows the root cause of its staleness: it stores a **separate hand-maintained folder per game version** (e.g. `leguin-2.2.0`, `wells-2.7.1`, `phoenix-4.0.10`, `cetus-4.3.7`), with data extraction handled by a companion script/repo and no visible CI/CD automation regenerating a new version folder on each patch. Updating to a new Stellaris version is therefore a manual, multi-repo, multi-step chore (run extractor, convert DDS icons to PNG via a separate Python script, hand-copy into a new dated folder, update navigation) that a volunteer maintainer eventually stops doing. This is precisely why it's stuck 3+ major patches behind (4.3.7 vs the current 4.5.0) — it's not a one-time bug, it's a structural pipeline problem.

**Why it happens:**
"Ship the current version" feels done after the first release; nobody budgets for the ongoing maintenance cost of a game that patches every few months. Each new version requires re-running extraction, re-validating parser assumptions against new tech types (repeatable techs, new DLC blocks, new trigger keywords), and redeploying — and if that pipeline isn't a single automated command, it silently becomes "later" and then "never."

**How to avoid:**
- Design the data pipeline as a single automated command from day one: point it at a local Stellaris install path, and it regenerates the entire static data snapshot (JSON + icon assets) in one pass, with no manual per-version folder bookkeeping.
- Make the pipeline idempotent and version-tagged automatically (read the version from the game's own files/changelog rather than hand-typing a folder name), so "update to new patch" is: point at new install → run pipeline → deploy. Minutes, not hours.
- Add automated validation (schema checks, tech-count sanity checks, "did every prerequisite resolve to a known tech" checks) that runs as part of the pipeline and fails loudly if the new version's data doesn't parse cleanly — this catches new Clausewitz constructs introduced by a patch (new trigger types, new fields) immediately rather than silently producing bad data.
- Since this is a personal/community project (not funded, single maintainer), the pipeline's ease-of-rerun *is* the feature that determines whether this tool survives past 4.5.0. Treat "time to update to a new patch" as a first-class success metric, not an implementation detail.

**Warning signs:**
- Any step in the update process that isn't scriptable (manual copy-paste, hand-editing a version string, manually re-exporting icons).
- No automated check that flags "this tech's prerequisite references a tech ID that doesn't exist in this dataset" — silent data corruption on a new patch.

**Phase to address:**
Data pipeline phase (Phase 1) — the pipeline's automation level is the single highest-leverage decision for this project's long-term survival, and should be validated by literally re-running it end-to-end at least once during development (e.g., simulate a version bump) before considering the phase done.

---

### Pitfall 7: Broken/Unusable UI Elements and Poor Navigation (The Reference Tool's Other Fatal Flaw)

**What goes wrong:**
Inspection of the reference tool (and its more actively-maintained islaytzash fork) shows: no search functionality, no zoom, no pan, and a layout engine (Treant.js, a generic tree-layout library never designed for DAGs with cross-tier prerequisites) that visibly places tier-2/3 techs into tier-4 columns because it can't correctly handle a graph where a node can have multiple parents across different tiers. Interaction is limited to "click a tech to collapse its children" — there is no way to jump directly to a specific tech, no visual "where am I in this huge tree" orientation, and, per PROJECT.md, elements are reported as literally broken (non-functional links, dead UI). For a tree with hundreds of nodes across 3 areas and 5 tiers, the lack of search-to-node-focus and pan/zoom makes the tool nearly unusable for its core purpose (find a tech, see how to reach it).

**Why it happens:**
Generic tree/org-chart layout libraries (Treant.js and similar) assume single-parent hierarchies; Stellaris tech prerequisites are a DAG (a tech can require two prior techs from different branches), so any layout tool built for strict trees will misplace nodes or draw crossing/backtracking edges. Search and zoom are often deprioritized as "nice to have" polish and cut under time pressure, but for a data set this large they are load-bearing, not optional.

**How to avoid:**
- Use a layout algorithm designed for DAGs, not trees (see Pitfall 8) — this is a prerequisite for the layout even being readable, separate from the interaction layer.
- Treat search-to-node-with-camera-focus as a core requirement, not a stretch feature — explicitly called out as needed given the reference tool's failure and PROJECT.md's "search without lag" requirement. Search should: fuzzy-match tech names, jump/pan the viewport to center the result, and highlight it and its prerequisite chain.
- Implement zoom levels with semantic detail reduction (show only tier/area structure when zoomed out, full icons/labels when zoomed in) rather than a single fixed scale — this directly addresses "getting lost" in a wide/deep graph.
- Add a persistent way to reorient (breadcrumb of current area/tier, or a minimap) so users can tell where they are after panning deep into the tree.
- Test all interactive elements (search, filter, links between techs, click-to-navigate) against the full real dataset before considering any UI feature "done" — the reference tool's "broken UI elements" complaint suggests untested edge cases (e.g., a tech with no prerequisites, a tech that is a prerequisite for 10+ other techs, repeatable techs with no fixed position in the tree).

**Warning signs:**
- No way to answer "how do I get to tech X" without manually scanning the whole tree.
- Edges that visually cross many other nodes/tiers (a symptom of wrong layout algorithm, not just a cosmetic nit).
- Any interactive element (search box, filter dropdown, tech link) that was only tested against 5-10 example techs rather than the full corpus including repeatables and DLC techs.

**Phase to address:**
UX/navigation phase, but the layout algorithm choice (prerequisite in Pitfall 8) must land first since search-and-focus depends on having a stable, correct node position to pan/zoom to.

---

### Pitfall 8: Wrong Layout Algorithm for a Wide, Multi-Parent DAG

**What goes wrong:**
Stellaris tech prerequisites are not a strict tree — a tech can list 2+ prerequisites from different branches/tiers (confirmed directly in the 4.5.0 files, e.g. techs requiring both a physics-track tech and an engineering-track tech). A naive top-down tree layout (or a generic library built for org-charts) either picks one parent arbitrarily and draws the other prerequisite edge as a long, crossing line, or — as seen in the reference tool via Treant.js — misplaces nodes into the wrong tier column entirely because the library assumes single ancestry. Additionally, with hundreds of nodes across only 3 areas (physics/society/engineering) and ~5-6 tiers, a straightforward tiered layout produces a graph that is very *wide* (hundreds of nodes per tier-and-area slice) — readability collapses without deliberate handling of node ordering within a rank to minimize edge crossings.

**Why it happens:**
Off-the-shelf tree components (common in charting/org-chart libraries) are the fastest path to "something renders," and the multi-parent case only shows up once real prerequisite data is loaded (a hand-built demo with 10-20 techs rarely hits it).

**How to avoid:**
- Use a proper layered-graph-drawing algorithm designed for DAGs (Sugiyama-style layered layout — e.g., dagre or ELK/elkjs), which explicitly handles multiple parents per node, assigns ranks (here: tier is already a natural rank), and minimizes edge crossings via node ordering within each rank — rather than a tree-only library.
- Treat "tier" and "area" as the natural rank/lane structure already provided by the game data (don't invent a new automatic layout from scratch — Stellaris already tells you the tier of each tech and its area, so the primary layout axis should be driven by that data, with the layout algorithm only responsible for ordering nodes *within* a tier/area and routing edges cleanly).
- For the "very wide" problem specifically: consider per-area lanes (3 vertical or horizontal bands, one per physics/society/engineering) so a user is never scanning across hundreds of unrelated nodes to find a related tech, and allow independent horizontal scroll/zoom per area or a combined view — evaluate both against real data early.
- Benchmark elkjs (more sophisticated crossing-minimization, better suited to hundreds of nodes) against dagre (faster, simpler, "good enough" for smaller graphs) specifically on the full 4.5.0 corpus rather than assuming one is right — this is a case where the project's actual scale (hundreds of nodes with real multi-parent edges) should drive the choice, not general reputation.

**Warning signs:**
- Prototype layout looks fine with a hand-picked subset of ~20 techs but produces visibly wrong tier placement or heavy edge crossing once the full corpus (hundreds of techs, real prerequisite graph) is loaded — this is exactly how the reference tool's Treant.js bug was only reported after real use, not caught in development.
- Any layout code that assumes `prerequisites` has at most one entry.

**Phase to address:**
Rendering/graph engine phase, same phase as Pitfall 5 (they're the same architectural decision: how the graph is computed and drawn). Flag for deeper research: this warrants an explicit early spike/prototype against the *actual* full parsed 4.5.0 dataset (not a toy sample) before committing to a rendering approach for the rest of the roadmap.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hand-transcribe a subset of techs instead of parsing real files | Faster initial prototype | Exactly the failure mode this project exists to fix (stale/wrong data); defeats the project's purpose | Never for anything beyond a throwaway layout spike |
| Collapse duplicate keys into a JS object during parsing | Simpler intermediate data structure | Silently drops repeated `modifier` blocks inside `weight_modifier`, corrupting weight display | Never |
| Hardcode DLC-to-file mapping with no update path documented | Ships faster | Breaks silently on next DLC release; becomes exactly the "stale data" problem being fixed | Acceptable only if the mapping lives in one clearly-labeled config reviewed every version bump |
| Force-directed layout for first prototype/demo | Fast to stand up, visually impressive in isolation | Unreadable and slow at full scale (hundreds of nodes); requires full rendering rewrite later | Acceptable only for a throwaway internal demo never shown to users, discarded before Phase with real data |
| Skip automated pipeline validation (schema/sanity checks) | Faster to first working version | Next game patch silently breaks the dataset with no error, reintroducing the "stale/wrong data" failure this project is meant to solve | Never past MVP — this is the core differentiator |
| Defer search-to-node and zoom to "polish later" | Faster to a visually complete-looking demo | Recreates the reference tool's "incredibly hard navigation" complaint exactly; hard to retrofit once layout/rendering is locked in | Never — treat as core requirement, not polish |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| Local Stellaris game install as data source | Assuming a single fixed install path or OS-specific path works for all users/environments | Make the pipeline's source path configurable; document how to locate the Steam library on Windows/Mac/Linux; do not hardcode `Z:\...` style paths into the shipped tool |
| DDS icon assets | Treating DDS files as directly usable in a browser | Convert to PNG/WebP at build/pipeline time (the reference tool already does this via a Python script) — never ship raw DDS or attempt client-side DDS decoding |
| Localisation files (tech names/descriptions) | Assuming one flat key-value locale file with no encoding quirks | Confirm YAML-like localisation file encoding (Paradox locale files are YAML-ish with a language header and can include escaped characters/color codes like `§Y...§!`) and strip/translate Paradox color-code markup before display |
| Game version detection | Hardcoding "4.5.0" as a string embedded across the codebase | Read version from the game's own metadata/launcher files where possible, or from a single pipeline-config constant, so version bumps touch one place |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One SVG DOM element (or nested group) per tech node, no virtualization | Smooth with test data, laggy pan/zoom with full dataset | Canvas/WebGL rendering or aggressive DOM virtualization (only render nodes in/near viewport) | Becomes noticeable around 200-400 nodes; Stellaris 4.5.0 has enough techs across 3 areas that full-tree rendering will exceed this |
| Re-running force simulation (or any layout recompute) on every pan/tick/click | Visible jitter, dropped frames, nodes "drifting" during normal use | Compute layout once per data/filter state change; pan/zoom as pure transform, not re-simulation | Immediately visible even at moderate node counts (100+) since simulations are O(n^2) per tick without spatial partitioning |
| Re-parsing/re-rendering entire tree on every filter toggle | UI freezes briefly on each filter click | Precompute filtered subsets or use incremental show/hide (opacity/display) on the existing pre-laid-out graph rather than recomputing layout | Noticeable once full corpus (hundreds of nodes) is loaded, not with small samples |
| Loading all tech icon assets eagerly on page load | Slow initial load, large network payload | Lazy-load icons as nodes enter viewport; sprite-sheet or icon-atlas common icons | Hundreds of unique tech icons at full resolution add up quickly on initial load |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rendering localisation/tech text as raw HTML | Paradox locale strings can contain markup-like sequences (color codes, icon references); treating them as trusted HTML risks injection if any user-influenced content is ever mixed in later (e.g., a future "notes" feature) | Always render as text/sanitized markup, never `innerHTML` raw locale strings; strip Paradox-specific markup tokens explicitly rather than passing through |
| Exposing the local filesystem path used by the pipeline in shipped client code/config | Minor info leak (reveals dev's local paths) | Strip local absolute paths from any generated build artifacts; keep pipeline config out of the deployed static bundle |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|------------------|
| No search-to-node focus (must manually scan) | Users get lost in a tree with hundreds of nodes across 3 areas — the exact reference-tool complaint | Fuzzy search bar that pans/zooms camera to the matched node and highlights its prerequisite chain |
| Fixed/absent zoom | Either everything is tiny and unreadable, or you can only see a few nodes at a time | Smooth zoom with semantic level-of-detail (icons+full labels near, tier/area silhouette far) |
| Tree-layout algorithm misplacing multi-parent nodes | Confusing, visually wrong prerequisite paths (a tech looks reachable from the wrong tier) | DAG-aware layered layout (dagre/elkjs) driven by the game's own tier/area data |
| No persistent orientation (breadcrumb/minimap) after deep pan | Users lose track of where they are in a wide/deep graph | Minimap or area/tier breadcrumb always visible |
| Dead/broken links between related techs (reference tool's exact complaint) | Erodes trust immediately; users bounce | Every tech-to-tech reference (prerequisite, unlocks) should be a tested, clickable navigation action validated against the full dataset, not just a visual line |
| Weight/trigger details dumped as raw script text | Overwhelming, unreadable for non-modders | Structured, collapsible display with best-effort human translation for common trigger types, raw fallback for rare ones |

## "Looks Done But Isn't" Checklist

- [ ] **Parser:** Often missing handling for `@variable` references and inline `@[ ]` math — verify by grepping the full corpus for `@` and confirming every occurrence resolves to a value, not a literal string, in the parsed output
- [ ] **Parser:** Often missing correct handling of repeated keys (multiple `modifier` blocks) — verify by checking a multi-condition `weight_modifier` tech (e.g. `tech_destroyers`) round-trips with all conditions intact, not just the last one
- [ ] **DLC filter:** Often missing techs whose DLC-gating comes from a `potential`/trigger condition rather than file location — verify by cross-checking a sample of triggers against known DLC-specific flags/origins
- [ ] **Graph layout:** Often "looks right" with a small hand-picked sample but breaks on full data — verify by rendering the *entire* real 4.5.0 dataset (all areas, all tiers, all DLC techs, repeatables) before calling layout done, not a curated subset
- [ ] **Search:** Often present as a text filter but missing camera-focus/pan-to-result — verify that selecting a search result actually moves the viewport to the node, not just highlights it if already visible
- [ ] **Update pipeline:** Often "automated" in theory but has an undocumented manual step (icon conversion, version string, folder rename) — verify by actually re-running the full pipeline end-to-end from a clean checkout against the current install, not just reading the script
- [ ] **Repeatable techs:** Often an afterthought (`00_eng_tech_repeatable.txt` etc. are separate files from the main tier'd tech) — verify these are parsed and represented distinctly (they don't fit a normal single-position-in-tree model since they're infinitely repeatable)
- [ ] **Empty/stub files:** Often trigger false parser errors — verify the pipeline doesn't crash or warn on legitimately empty/near-empty files like `00_repeatable.txt` (confirmed 0 lines in 4.5.0) or comment-only documentation stubs like `000_documentation.txt`

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|-----------------|
| Parser silently drops duplicate `modifier` keys | MEDIUM | Switch parser's intermediate representation from object to key-preserving array/multimap; re-run against full corpus; add a regression test asserting known multi-modifier techs retain all conditions |
| Chose force-directed layout, discovered unreadable at scale | HIGH | Requires swapping the layout engine (and likely rendering approach) — budget this as a rewrite, not a tweak; mitigate by prototyping against full data early (Pitfall 8) so this is caught before the rest of the UI is built on top of it |
| DLC mapping goes stale after a new DLC release | LOW | Since it's an isolated config file (per Pitfall 2's prevention), update is a single-file diff; low cost if isolated properly, high cost if DLC logic got scattered through the codebase |
| Manual per-version pipeline becomes unmaintainable (reference tool's fate) | HIGH | Requires retrofitting automation into an ad hoc process — significantly cheaper to build automated from the start (Pitfall 6) than to retrofit after multiple manual updates have already happened |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|--------------|
| Naive parser breaks on real Clausewitz edge cases | Phase 1 (Data pipeline) | Run parser against all 33 files in `common/technology/`; assert zero unresolved `@variables`, all multi-modifier techs retain full condition lists |
| DLC-gating misclassified | Phase 1 (Data pipeline) | Cross-check parsed DLC tag against a manually verified list of DLC tech files; spot-check trigger-gated (non-file-isolated) DLC techs |
| Weight modifiers flattened/misrepresented | Phase 1 (parsing) / Tech detail UI phase (display) | Render `tech_destroyers` or similar multi-condition tech and confirm every condition from source file appears |
| `technology_swap` corrupts graph structure | Phase 1 (Data pipeline) | Assert parsed tech count matches count of top-level `tech_*` keys in source files, not inflated by swap sub-blocks |
| DOM-heavy/force-layout performance collapse | Rendering/graph engine phase (early, foundational) | Load full real dataset (hundreds of nodes) in dev and profile frame rate during pan/zoom/filter; must stay smooth, not just "acceptable with test data" |
| Wrong layout algorithm for multi-parent DAG | Rendering/graph engine phase (same as above) | Render full real prerequisite graph (not a curated subset) and manually verify tier/area placement matches game data with no crossing-heavy hairball |
| Manual per-version data pipeline (staleness) | Phase 1 (Data pipeline), revisited at every version-update workflow | Actually re-run the full pipeline end-to-end against a simulated "new version" and time/step-count it; should be a single command |
| Broken/missing UI elements, poor navigation | UX/navigation phase | Test search, filters, and all tech-to-tech links against the full real dataset (not a demo subset) before considering the phase complete |

## Sources

- Direct inspection of Stellaris 4.5.0 game files at `Z:\SteamLibrary\steamapps\common\Stellaris\common\technology\` (33 tech definition files, `000_documentation.txt` in-engine documentation stub, confirmed `@variable` references, multi-condition `weight_modifier` blocks, `technology_swap` mechanism, multi-prerequisite techs, empty stub files) — HIGH confidence, primary source
- [A Tour of PDS Clausewitz Syntax | PDX Tools](https://pdx.tools/blog/a-tour-of-pds-clausewitz-syntax/) — Clausewitz format quirks, scripted variables, inline math syntax
- [Appendix: Syntax Reference | Paradox Language Support](https://windea.icu/Paradox-Language-Support/en/ref-syntax.html) — variable/inline-math reference
- [Fun with Pfarah: a Paradox Clausewitz Parser | nickb.dev](https://nickb.dev/blog/fun-with-pfarah-a-paradox-clausewitz-parser/) — parser implementation gotchas
- GitHub repository inspection: `bloodstainedcrow/stellaris-tech-tree` — confirmed manual per-version-folder data pipeline (leguin-2.2.0 through cetus-4.3.7), separate Python DDS-to-PNG conversion step, no visible CI/CD automation — direct diagnosis of the reference tool's staleness failure mode
- [Stellaris Tech Tree Viewer (islaytzash fork)](https://islaytzash.github.io/stellaris-tech-tree/) — confirmed absence of search/zoom/pan, confirmed Treant.js tier-placement bug for multi-parent techs, click-to-collapse-only interaction model
- [d3-force | D3 by Observable](https://d3js.org/d3-force) and related search results — force-simulation performance characteristics, SVG vs Canvas at 1000+ element scale
- [Overview - React Flow / Svelte Flow layouting docs](https://reactflow.dev/learn/layouting/layouting) and [dagre vs elkjs discussion, xyflow/xyflow #1786](https://github.com/xyflow/xyflow/discussions/1786) — dagre vs elkjs tradeoffs for DAG layout at scale
- General graph-UX pattern sources (minimap, semantic zoom, search-to-focus) — MEDIUM confidence, multiple corroborating but not Stellaris-specific sources

---
*Pitfalls research for: Stellaris tech tree visualizer (Clausewitz parsing + interactive DAG rendering)*
*Researched: 2026-07-07*
