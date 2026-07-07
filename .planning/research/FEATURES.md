# Feature Research

**Domain:** Game tech-tree / skill-tree visualizer (Stellaris tech tree, specifically)
**Researched:** 2026-07-07
**Confidence:** MEDIUM-HIGH (feature landscape corroborated across multiple tools/genres; some live-tool UI details inferred from READMEs/docs rather than direct interactive inspection, since target sites are JS SPAs that resist automated fetching — flagged inline)

## Context: Why External Tools Exist At All

Confirmed from the Stellaris wiki and community sources (MEDIUM-HIGH confidence, multiple sources agree): **the in-game research screen has no full tech-tree view.** Stellaris uses a randomized "card draw" system (3 alternatives per research slot, weighted by draw-weight modifiers) rather than a visible tree. Some techs show a small icon hinting at what they unlock, but there is no in-game way to see the whole graph or plan a path to a distant tech. This is the entire reason community tools exist — the product category is "the tree view Paradox didn't build," not a convenience layer on top of one. This context should anchor every feature decision: the tool's core job is answering "what leads to X" and "what does X unlock," a question the game itself cannot answer.

Also confirmed: Stellaris technologies carry a nontrivial data model that competing tools already extract — tier (T0-T5), area (Physics/Society/Engineering), category (13 subcategories), cost, base draw weight, weight *modifiers* (conditional add/factor adjustments, e.g. "+withEthic ×1.5"), prerequisites, DLC gating, and flags (rare, dangerous, repeatable, starting tech). Weight modifiers are structured logic (conditions → adjustment), not a single number — tools that flatten this to "weight: 5" lose information players actively want (confirmed via draconas1 tool description and Paradox wiki/forum discussion of weight mechanics).

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete, or is exactly the complaint driving this project (bloodstainedcrow: stale data, broken UI, hard to navigate).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Full tree render with prerequisite edges | This is the entire value proposition — the in-game UI doesn't provide it. Every competing tool (bloodstainedcrow, turanar, draconas1, islaytzash, sit.milaq.net) leads with this. | MEDIUM | Layout is the hard part — see Architecture research for layout algorithm choice. Column-by-tier layout is the norm (islaytzash explicitly uses tier columns, occasionally breaking for cross-tier prerequisites). |
| Correct, current-patch data | The stated reason this project exists — bloodstainedcrow is stuck on Cetus 4.3.7 vs current 4.5.0. Every fork/competitor (turanar, draconas1, islaytzash, kubarium) exists because prior tools go stale when maintainers stop updating. | LOW-MEDIUM (given local game install as source) | Build-time parse-from-game-files pipeline (per PROJECT.md) directly addresses this; make regeneration cheap so this table-stakes item doesn't rot again. |
| Search by tech name | Every comparable tool has this — PoE's tree search ("type a word, matching nodes glow"), and it's assumed baseline for any tree with 200+ nodes. | LOW | Should match on tech key/id and localized name; substring match, not just exact. |
| Tech detail panel/tooltip: cost, tier, area, category, prerequisites, unlocks | Confirmed as the core data every existing tool surfaces (draconas1 README explicitly lists this set; islaytzash shows description + weight on hover). Users can't evaluate a tech without this. | LOW-MEDIUM | "Unlocks" (buildings/components/ships gated by the tech) is called out as a differentiator-in-progress by draconas1 (listed as "in progress" in their README) — meaning even mature competitors don't fully nail this. Doing it well is a real opportunity, not just table stakes checkbox. |
| Prerequisite highlighting on click/hover | DaveMcW's Factorio tool (click tech → highlights that subtree; click item → highlights techs needed) and PoE's tree (hover distant node → draws path) both treat this as baseline, not a bonus. Static trees without this are "hard to navigate" — literally the user's complaint about bloodstainedcrow. | MEDIUM | This is the single highest-leverage fix for "incredibly hard to navigate." Even a simple ancestors-highlight (walk prerequisite graph backward from selected node) resolves most navigation complaints. |
| Pan and zoom | Any tree with hundreds of nodes (Stellaris has ~200-300+ techs across 3 areas) cannot fit on one screen at readable text size. Universal in every graph-viz tool researched (D3, vis.js, react-d3-graph all treat pan/zoom as core, not optional). | LOW-MEDIUM | Well-trodden with off-the-shelf libraries (d3-zoom, or framework-level pan/zoom in whatever rendering approach is chosen). Must not lag — stated as headline requirement in PROJECT.md. |
| Filter by research area (Physics/Society/Engineering) | Fundamental to how Stellaris organizes tech; every tool splits by area at minimum (bloodstainedcrow's own data files are literally named `physics.json`, `society.json`, `engineering.json`, `anomalies.json`). | LOW | Natural top-level filter/tab; likely also the natural layout grouping (columns or swim-lanes per area). |
| Filter by category (subcategory within area) | 13 subcategories are a core organizing concept players reason in ("I want weapons techs," "I want habitability techs"). PROJECT.md explicitly calls this out as required. | LOW-MEDIUM | Needs a clean multi-select or accordion UI — with 13 categories across 3 areas, a flat checkbox list gets unwieldy; group by area. |
| Filter by tier | PROJECT.md explicit requirement; tiers gate what's researchable at a given game stage, so "show me only T1-T2" is a natural question. | LOW | Simple range or multi-select. |
| Filter by DLC | Stellaris tech set depends on owned DLC (Ancient Relics, Biogenesis, etc. add tech files, confirmed from local install: `00_ancient_relics_tech.txt`, `00_biogenesis_tech.txt`). Players without a DLC need to exclude its tech, or want to see what a DLC adds. | LOW-MEDIUM | Also serves as a soft "what does DLC X add" browsing feature — dual purpose for relatively low extra cost. |
| Working links/navigation between techs | Named directly in PROJECT.md as a defect in the reference tool ("UI elements that actually work... links between techs"). Clicking a prerequisite/unlock reference should jump/scroll/select that tech, not silently fail. | LOW-MEDIUM | This is a QA bar, not really a "feature" — but it's explicitly called out because the competitor fails at it, so it must be verified working, not just present. |
| Responsive performance at full tree scale | PROJECT.md states this as a headline requirement ("fast and responsive... must not lag") given hundreds of nodes. Every complaint about the existing tool cites navigation difficulty, which is partly a performance/UX problem, not just a features problem. | MEDIUM-HIGH | Depends heavily on rendering approach (SVG vs canvas vs WebGL) chosen in architecture research; naive SVG with hundreds of DOM nodes + edges can get janky on pan/zoom. |

### Differentiators (Competitive Advantage)

Features that set the product apart from bloodstainedcrow/turanar/draconas1/islaytzash. Not required for a minimally working tree, but this is where "actually pleasant to use" is won.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Full path-to-target highlighting ("beeline" view) | Confirmed as a real, named community need — a separate PowerShell tool (`stellaris-tech-beeliner`) exists solely to compute cheapest research paths to a target tech by identifying which prerequisites to "skip"/deprioritize. PoE's official tree does this natively (hover a distant node → draws the cheapest path + node count). No existing Stellaris *visual* tool does this well — it's currently a separate console script. Doing this in-app would leapfrog every competitor. | MEDIUM-HIGH | Requires: (1) full prerequisite graph already built for rendering, so mostly a graph-traversal/shortest-path algorithm (BFS/Dijkstra weighted by cost) reused on top of existing data, (2) a way to select a "target" tech and visually trace the path (highlight color + optionally show accumulated cost). This directly answers "how do I reach tech X" — the single most common reason players reach for these tools per PCGamesN's framing of Turanar's tool. |
| Rich weight-modifier display (structured, not flattened) | draconas1's tool shows raw weight-modifier rules on hover; the Paradox wiki confirms weight is a base value adjusted by many conditional factors (ethics, traits, ascension perks, "already in hand" penalty). Most casual tools just show a flat number. Presenting modifiers as readable structured conditions ("×1.5 if Xenophile", "×0.5 if already offered") is something even mature competitors treat as a stretch feature. | MEDIUM | Requires parsing the weight-modifier blocks from the Clausewitz format (already need this for weight display) and rendering as human-readable condition→multiplier rows rather than pretty-printed script. |
| URL-shareable state (filters, selected tech, search) | Both PoE's official tree and PoEPlanner treat shareable build/state URLs as fundamental — "share your build with a link" is a defining feature of that entire product category. No researched Stellaris tool does this. Lets players share "here's the path to Habitats" in a Discord/Reddit post instead of a screenshot. | MEDIUM | Requires state (selected tech, active filters, zoom/pan position optionally) to be serializable into query params or a compact hash. Pairs naturally with search/filter/target-tech-highlight — implement after those exist. |
| Dark mode | Not present in any researched Stellaris tech tool description found; broadly expected in modern dev-adjacent/gaming-reference tools as a baseline "polish" signal, and cheap to add correctly if theming is planned from the start. | LOW (if planned early) / MEDIUM (if retrofitted) | Low effort, meaningful "this tool is modern and cared-for" signal — directly counters the "outdated" impression left by the reference tool. Cheapest to build in with CSS custom properties/theme tokens from day one. |
| Mobile/touch support (pinch-zoom, tap for detail) | None of the researched competitor tools mention mobile support; general graph-viz UX guidance (Cambridge Intelligence) explicitly calls out supporting standard touch gestures (pinch-to-zoom, drag-to-pan) as an established convention, not a nice-to-have, once you commit to a pan/zoom canvas. Players do check builds/plans on phones (common pattern in PoE/WoW planner communities). | MEDIUM-HIGH | Genuinely harder than desktop-only: touch target sizing for dense graphs, gesture conflicts (pinch vs. browser zoom), panel layout for small screens. Reasonable to treat as v1.x rather than launch-blocking, given desktop is the primary use case for tech-tree planning, but note in scope for phase sequencing. |
| Unlocks browser (buildings/components/ships gated by tech) | Explicitly called "in progress"/incomplete even in the most feature-rich competitor (draconas1). Doing this well — not just "unlocks: X" text but a properly linked, browsable view of what a tech grants — is a clear gap in the entire ecosystem, not just the reference tool. | MEDIUM-HIGH | Requires cross-referencing tech unlock keys against building/component/ship-section definitions elsewhere in game files — nontrivial parsing scope beyond the tech files themselves; likely a v1.x feature rather than launch. |
| Visual flags for rare/dangerous/repeatable/starting tech | islaytzash's tool already does this (purple = rare, red = dangerous, yellow = DLC-gated) — proven useful pattern, worth adopting/improving rather than reinventing, but still differentiates from tools that don't (bloodstainedcrow reportedly lacks polish here per its "broken UI" reputation). | LOW | Cheap once tech flags are parsed; primarily a color/icon/legend design task. |
| Minimap / overview-of-tree while zoomed in | Established pattern in graph-viz UX (D3 minimap pattern is a well-documented convention) for exactly this navigation-when-zoomed problem; no competitor tool confirmed to have one. Helps directly with "hard to navigate" at full-tree scale. | MEDIUM | Worth prototyping once main pan/zoom canvas exists; can be deferred past v1 if search + path-highlighting already solve most "where am I" navigation pain. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems disproportionate to their value, given this project's scope (base game + official DLC, static/reference tool, no live game integration — per PROJECT.md Out of Scope).

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Mod tech support | Draconas1's and ShadowTrolll's tools both support arbitrary mod tech trees, and it's a natural "why not just support everything" ask. PROJECT.md already excludes this. | Mods add unbounded parsing complexity (arbitrary new tech files, non-standard prerequisite structures, mod load-order interactions) and unbounded scope for a first release; also directly conflicts with "accurate, current data" goal since mod combinations are infinite and can't all be validated. | Base game + official DLC only for v1; if demand emerges, revisit as an opt-in "paste your mod files" feature later, scoped separately. |
| Live save-file integration / in-game overlay | Tools like the "Tech Tree Exposed" mod and various in-game overlay requests show demand for "just show me this in the game." | This is a fundamentally different product (a game mod / overlay, not a web app) with different distribution (Steam Workshop, not a static site), different technical constraints (game API access), and directly conflicts with PROJECT.md's "reference/planning tool" scope. | Keep as a pure reference/planning web tool. If in-game integration is ever wanted, it's a separate project (a Stellaris mod), not a feature of this app. |
| Full research-order simulator / RNG-aware planner (simulating actual card draws with weights) | Given how central draw-weight and randomness are to Stellaris research, players might ask for a tool that simulates "what will I actually get offered." | This requires accurately replicating the game's full weighting/RNG/hand-refresh logic (order of operations, ethic/trait/perk stacking, "already offered" penalties, per-tier gating) — a simulation engine, not a visualizer. High complexity for a benefit (probabilistic prediction) that's inherently fuzzy and easy to get subtly wrong, undermining the "accurate data" value prop if the simulation is wrong. | Show weight and weight-modifiers clearly (a differentiator above) so players can reason about likelihood themselves, but stop short of simulating actual draws. |
| Real-time collaborative/multiplayer planning (shared cursors, live-edited plans) | Broad "modern web app" expectation creep — collaborative features are trendy in planning tools generally. | Massive infrastructure complexity (websockets/backend/persistence) for a tool whose stated delivery model is static/client-side with no server (per PROJECT.md: "no server needed; easy hosting"). Directly conflicts with the chosen architecture. | URL-shareable state (a differentiator above) gets most of the collaborative value — "here's my plan" via link — without needing real-time sync infrastructure. |
| Account system / saved user profiles across devices | Feels natural once you have a "planner" concept (save my plan, log in on another device). | Requires backend, auth, persistence, privacy/security handling — all absent from and contrary to the static-site delivery model. Also unnecessary: URL-encoded state already gives cross-device continuity by just sending yourself the link. | URL-shareable state; optionally browser localStorage for "remember my last view" on the same device, with zero server involvement. |
| Exhaustive settings/customization (custom themes, layout algorithm picker, reorderable panels) | Power users of any visualization tool eventually ask for maximal configurability. | Configuration surface grows faster than value; every option is a maintenance and testing burden, and most users want sensible defaults, not a settings maze — especially for a tool whose whole pitch is "clear and easy," not "infinitely tunable." | Ship one well-chosen default layout/theme (plus dark mode as the one binary toggle); take configuration requests only after real usage reveals genuine friction. |

## Feature Dependencies

```
Full tree render with prerequisite edges (table stakes)
    └──requires──> Parsed tech data (tier, area, category, cost, weight, prereqs, unlocks, DLC, flags)

Search by tech name
    └──requires──> Parsed tech data (localized names + keys indexed)
    └──enhances──> Prerequisite highlighting (search result → jump to node → show its chain)

Prerequisite highlighting on click/hover
    └──requires──> Full tree render with prerequisite edges (needs the graph structure already built)

Full path-to-target highlighting ("beeline" view)
    └──requires──> Prerequisite highlighting (superset: adds shortest-path computation over the same graph)
    └──requires──> Parsed cost/weight data (to define "cheapest" path, not just "any" path)

Filter by area / category / tier / DLC
    └──requires──> Parsed tech data (area, category, tier, DLC fields)
    └──enhances──> Full tree render (filters typically dim/hide nodes on top of the existing render, not a separate view)

URL-shareable state
    └──requires──> Search, Filters, and target-tech-selection all functioning first (nothing meaningful to encode otherwise)

Rich weight-modifier display
    └──requires──> Tech detail panel (weight modifiers are shown inside/alongside the detail panel, not standalone)
    └──requires──> Parsed weight-modifier condition structures (deeper parse than a flat weight number)

Unlocks browser (buildings/components/ships)
    └──requires──> Tech detail panel (unlocks list already shown there in basic form)
    └──requires──> Additional parsing beyond technology/ files (buildings, components, ship sections)

Minimap
    └──enhances──> Pan and zoom (minimap is a navigation aid layered on the same canvas)

Dark mode
    └──conflicts (mildly)──> nothing; purely additive if theme tokens are used from the start; retrofitting later costs more (touches every component's styling)

Mobile/touch support
    └──enhances──> Pan and zoom (adds touch gesture handling to the existing interaction layer)
    └──conflicts (resource-wise)──> Minimap and dense detail panels (small-screen layout needs separate design pass for these)
```

### Dependency Notes

- **Prerequisite highlighting requires the full tree render:** you cannot highlight ancestor/descendant nodes in a graph that hasn't been constructed and laid out yet — this is why "render the tree" must land in an earlier phase than "highlight paths."
- **Path-to-target highlighting requires prerequisite highlighting's graph machinery, plus cost/weight data:** it's the same underlying graph-traversal capability extended with a cost function and a "compute shortest path, not just direct ancestors" algorithm (BFS is enough for "any path"; a cost-weighted search is needed for "cheapest path," matching the beeliner tool's actual purpose). Sequence: basic ancestor-highlight first (cheap, high navigation value), then upgrade to cost-aware shortest-path once the underlying data (parsed cost fields) is confirmed reliable.
- **URL-shareable state depends on search/filter/target features existing first:** there's no state worth serializing before those features exist; building shareable URLs before the underlying feature set stabilizes means redesigning the URL schema repeatedly. Sequence this late.
- **Rich weight-modifier display depends on the basic tech detail panel:** ship a simple flat-weight number in the panel first (table stakes), then layer in the structured conditional-modifier view as a differentiator once the parser already handles the underlying Clausewitz weight-modifier blocks (needed anyway for correctness, since flattening weight incorrectly would misrepresent game data — a real accuracy risk given "accurate data" is this project's core reason to exist).
- **Dark mode should NOT be sequenced late:** unlike most differentiators, this one gets meaningfully more expensive the later it's added (retrofitting theme tokens across an already-built component set vs. building with CSS variables from day one). Recommend treating "theming architecture" as a decision made during initial UI build, even if the dark-mode toggle itself ships slightly later.
- **Mobile support conflicts (in effort terms) with information-dense features:** minimap and rich detail panels both assume screen real estate that doesn't exist on mobile; if mobile is pursued, it likely needs its own simplified layout mode rather than a responsive squeeze of the desktop UI — which is part of why this project reasonably treats mobile as v1.x rather than launch-blocking.

## MVP Definition

### Launch With (v1)

Minimum viable product — resolves the three named complaints (stale data, broken UI, hard to navigate) and matches table-stakes expectations from the whole genre.

- [ ] Parsed, accurate v4.5.0 tech data (tier, area, category, cost, weight, prerequisites, unlocks, DLC, flags) — this *is* the reason the project exists
- [ ] Full tree render with prerequisite edges, laid out for readability at hundreds-of-nodes scale — the core deliverable every competitor centers on
- [ ] Pan and zoom, performant at full scale — explicitly a headline requirement in PROJECT.md
- [ ] Search by tech name — universal baseline, cheap, immediately reduces "hard to navigate"
- [ ] Filter by area, category, tier, DLC — explicit PROJECT.md requirement, moderate effort, high clarity payoff
- [ ] Tech detail panel: cost, weight (flat value acceptable at launch), tier, area, category, prerequisites, unlocks (as a list, even if not yet a rich cross-linked "unlocks browser") — baseline data every tool provides
- [ ] Prerequisite ancestor-highlighting on click/hover — directly resolves "hard to navigate"; cheap relative to full path-to-target, high impact
- [ ] Working links between techs (click a prerequisite/unlock reference → jump to that tech) — directly named as broken in the reference tool; must simply work
- [ ] Theming architecture in place (even if only light mode ships at launch) — cheap now, expensive later

### Add After Validation (v1.x)

Features to add once core is working and validated against real usage.

- [ ] Full cost-aware path-to-target ("beeline") highlighting — upgrade from simple ancestor-highlight once the graph/cost data is proven reliable in production
- [ ] URL-shareable state (search term, active filters, selected/target tech) — add once the feature set it needs to encode has stabilized
- [ ] Dark mode toggle — trigger: whenever the theming architecture (built at launch) is ready to expose a second theme; low cost to flip on
- [ ] Rich structured weight-modifier display (conditions, not flat numbers) — trigger: once parser reliably extracts modifier conditions and there's user signal that players want to reason about draw probability, not just see a number
- [ ] Minimap — trigger: if user feedback specifically cites getting lost while zoomed in, despite search/highlighting already shipped

### Future Consideration (v2+)

Features to defer until the core tool has product-market fit within the Stellaris community.

- [ ] Unlocks browser (buildings/components/ships properly cross-linked, not just named) — defer: requires parsing well beyond the technology/ files, meaningfully larger scope than launch parser
- [ ] Mobile/touch-optimized layout — defer: primary use case (planning a research route) is a desktop/wide-screen activity; revisit if analytics show meaningful mobile traffic
- [ ] Mod tech support — defer indefinitely per PROJECT.md's explicit out-of-scope call; revisit only if there's clear demand and it can be scoped as an isolated opt-in feature, not a core-parser complication

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Accurate parsed v4.5.0 data | HIGH | MEDIUM | P1 |
| Full tree render with prerequisites | HIGH | MEDIUM | P1 |
| Pan/zoom, performant | HIGH | MEDIUM | P1 |
| Search by name | HIGH | LOW | P1 |
| Filter by area/category/tier/DLC | HIGH | LOW-MEDIUM | P1 |
| Tech detail panel (cost/weight/prereqs/unlocks) | HIGH | LOW-MEDIUM | P1 |
| Prerequisite ancestor-highlighting | HIGH | MEDIUM | P1 |
| Working tech-to-tech links | HIGH | LOW | P1 |
| Theming architecture (tokens, not colors ship day 1) | MEDIUM | LOW | P1 |
| Cost-aware path-to-target ("beeline") highlighting | HIGH | MEDIUM-HIGH | P2 |
| URL-shareable state | MEDIUM | MEDIUM | P2 |
| Dark mode toggle | MEDIUM | LOW (if tokens exist) | P2 |
| Rich structured weight-modifier display | MEDIUM | MEDIUM | P2 |
| Visual flags (rare/dangerous/repeatable/starting) | MEDIUM | LOW | P2 |
| Minimap | LOW-MEDIUM | MEDIUM | P3 |
| Unlocks browser (deep cross-linking) | MEDIUM | HIGH | P3 |
| Mobile/touch-optimized layout | LOW-MEDIUM | MEDIUM-HIGH | P3 |
| Mod tech support | LOW (out of scope) | HIGH | Excluded |
| Live game/save integration | LOW (out of scope) | HIGH | Excluded |
| Draw-weight RNG simulator | LOW | HIGH | Excluded |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | bloodstainedcrow (reference/anti-example) | draconas1 | islaytzash | turanar | Our Approach |
|---------|---------|-----------|------------|---------|---------------|
| Data currency | Stuck on Cetus 4.3.7 (stale — the core complaint) | Version tied to maintainer effort (4.3.5 per repo) | Unclear cadence | Actively maintained per PCGamesN mention | Build-time parse from local game install; make version bumps a repeatable pipeline step, not a rewrite |
| Search | Present but reported "hard to navigate" overall | Confirmed present | Not confirmed | Not confirmed | Present, indexed on name + key, fast substring match |
| Filter by area/category | Data split into physics/society/engineering/anomalies JSON files, but UI filter quality unclear/reportedly poor | Category highlight/select/filter confirmed | Tier-column layout implies area grouping | Not confirmed in detail | Explicit multi-select filters for area, category, tier, DLC — grouped sensibly, not a flat unwieldy list |
| Prerequisite highlighting | Reported broken/hard to navigate — the core complaint | "Dependency highlight" confirmed present | Click collapses children (a related but different interaction) | Praised by PCGamesN for showing "paths across disciplines" | Click/hover ancestor-highlight at launch; upgrade to cost-aware shortest path in v1.x |
| Path-to-target ("beeline") | Absent | Absent | Absent | Absent (a separate PowerShell tool, `stellaris-tech-beeliner`, exists purely to fill this gap) | Build this natively as a v1.x differentiator — closes a gap the entire ecosystem has left to a console script |
| Weight modifier detail | Unclear/likely flattened or absent | Shown on hover via a dedicated icon (best-in-class among researched tools) | Not confirmed | Not confirmed | Match/exceed draconas1: structured condition→multiplier display, not just a number |
| Rare/dangerous/DLC visual flags | Reported lacking polish | Confirmed ("Rare/Starter/Dangerous/Acquisition tech highlight") | Confirmed (purple/red/yellow color coding) | Not confirmed | Adopt the islaytzash color-coding pattern; add a visible legend (neither tool's docs confirm a legend exists) |
| URL-shareable state | Absent | Absent | Absent | Absent | Build in v1.x — no competitor offers this; matches expectations from PoE/WoWhead-style planners in adjacent genres |
| Dark mode | Absent | Absent | Absent | Absent | Ship with theming tokens at launch, toggle in v1.x — costs little, no competitor has it |
| Mobile support | Unconfirmed/unlikely (no tool in this category documents it) | Unconfirmed | Unconfirmed | Unconfirmed | Explicitly defer to v2+; not a competitive gap since no one else has solved it either |
| Unlocks display | Unclear | Explicitly "in progress"/incomplete even in the most mature competitor | Basic (description includes unlocked items) | Not confirmed | Ship basic list at launch; treat the deep cross-linked "unlocks browser" as a genuine v2 differentiator since even the ecosystem leader hasn't finished it |

## Sources

- PROJECT.md (`.planning/PROJECT.md`) — project scope, explicit requirements, and out-of-scope decisions
- https://bloodstainedcrow.github.io/stellaris-tech-tree/ and https://github.com/BloodStainedCrow/stellaris-tech-tree — reference/anti-example tool (data-file structure inspected directly; live UI is a JS SPA that resisted automated content extraction, so specific broken-UI details are taken from PROJECT.md's framing rather than direct re-verification)
- https://github.com/draconas1/stellaris-tech-tree — README-documented feature set: area/category filtering, search, dependency highlighting, weight-modifier hover display, rare/starter/dangerous/acquisition flags, "unlocks" as an acknowledged in-progress gap; uses CWTools + vis.js
- https://islaytzash.github.io/stellaris-tech-tree/ — tier-column layout via Treant.js, purple/red/yellow flag color-coding, dual hover icons for description vs. weight-modifier detail
- https://turanar.github.io/stellaris-tech-tree/ — referenced and praised by PCGamesN for showing cross-discipline paths and per-tech unlock benefits (direct UI inspection was blocked by JS-rendering; description taken from secondary source)
- https://github.com/serpentskirt/stellaris-tech-beeliner — standalone PowerShell tool that exists solely to compute cheapest research paths to a target tech, confirming "beelining"/path-to-target is a real, currently-unmet need in the visual-tool ecosystem
- https://www.pcgamesn.com/stellaris/tech-tree — confirms in-game UI lacks full-tree view, frames external tools (Turanar's) as filling that exact gap, and documents weight-modifier mechanics
- https://stellaris.paradoxwikis.com/Technology — technology data model: tiers, areas, categories, cost, weight and weight-modifier mechanics (ethics/traits/perks/hand-refresh penalties), rare/repeatable/psionic flags
- https://forum.paradoxplaza.com/forum/threads/more-informative-tech-trees-with-nested-tooltips.1598392/ and community discussion confirming in-game tooltips exist per-element but no full tree view
- https://www.pathofexile.com/passive-skill-tree and PoE community guides (poewiki.net, exitlag.com) — confirms search-highlights-matching-nodes, hover-shows-cheapest-path-to-distant-node, and URL-based build sharing as established conventions in the broader skill-tree genre
- https://davemcw.com/factorio/tech-tree/ — click-tech-to-highlight-subtree / click-item-to-highlight-required-techs pattern, product/ingredient/raw-materials side panels
- Wowhead Talent Calculator (wowhead.com/talent-calc and related guides) — point-budget tracking, color-coded locked/unlocked/broken states, save-and-share builds, prerequisite/tier enforcement
- https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/ — general graph-visualization UX conventions: standard touch gestures, progressive disclosure via zoom/filter, avoiding hairball/snowstorm/starburst layouts, colorblind-safe and keyboard-accessible design
- Stellaris local install verification (`Z:\SteamLibrary\steamapps\common\Stellaris`, per PROJECT.md) — confirms DLC-specific tech files exist (`00_ancient_relics_tech.txt`, `00_biogenesis_tech.txt`), grounding the DLC-filter requirement in real data structure

---
*Feature research for: Stellaris tech tree visualizer (game tech-tree/skill-tree visualizer domain)*
*Researched: 2026-07-07*
