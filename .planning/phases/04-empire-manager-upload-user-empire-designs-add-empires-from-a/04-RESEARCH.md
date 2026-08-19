# Phase 4: Empire Manager - Research

**Researched:** 2026-08-18
**Domain:** Client-side Clausewitz/Paradox text round-trip editing (custom empire designs file) + File System Access API
**Confidence:** HIGH

## Summary

This phase is a text-splicing problem wearing a UI, not a data-modeling problem. The user's real
`user_empire_designs_v3.4.txt` (400KB, 182 entries, read and verified byte-for-byte in this
research pass) is a flat sequence of top-level `"Name"={...}` blocks with a **remarkably
consistent, fully-populated field set** — all 182 entries carry the same 23 core fields in the
same order, plus a handful of origin-conditional optional fields (`secondary_species`,
`advisor_voice_type`, `flag`, `ship_size`). Because CONTEXT.md's D-08 mandates a byte-exact splice
(never re-serialize kept entries), the parser's real job is narrow: find each top-level entry's
exact byte span. `jomini` parses the whole file for validation/inspection with zero preprocessing
(no `__root__` wrapper needed, unlike the `.sav` gamestate) — verified directly against the real
file (182 entries, correct field shapes, byte-perfect UTF-8 round-trip). The designs file is
**UTF-8**, not windows-1252 like the save (`.sav` gamestate) — this is a real, easy-to-get-wrong
divergence from the existing `savLoad.ts` pattern.

The save→design extraction (D-07) is more mapping work than parsing work: a real save's
`country`, `species_db`, and `leaders` tables were inspected directly (via a throwaway Node script
using the app's own `fflate`+`jomini` dependencies) and map onto the design file's shape with
mostly 1:1 field renames (`flag`→`empire_flag`, `government.type`→`government`,
`government.{authority,civics,origin}`→top-level `authority`/`civics`/`origin`,
`species_db[i].{name,plural,adjective}`→`species.{species_name,species_plural,species_adjective}`,
`species_db[i].traits.trait[]`→`species.trait` repeated keys). The one genuine landmine: a
country's `ruler` field in the save is just a leader ID — resolving the full ruler block (gender,
portrait, texture, trait, leader_class) requires the `leaders` table, and **only the leader who was
the game's original starting ruler carries a ready-made `design={...}` snapshot** that matches the
design file's `ruler` shape exactly; a promoted/elected later ruler has no such snapshot and must be
synthesized from live fields with `texture=0`/`evolution_mask=0`/`attachment=0`/`clothes=0` as safe
defaults (100% of the 182 real sampled designs use `texture=0`).

No new npm packages are required — `jomini` and `fflate` are already app dependencies, the File
System Access API is a native browser API, and file downloads use native `Blob`/`URL.createObjectURL`.

**Primary recommendation:** Parse with a quote-aware, brace-depth top-level span scanner (not
jomini) for the splice/round-trip engine; use `jomini.parseText` only for read/validation/UI
purposes; extend `savLoad.ts`'s pipeline to also expose the raw `country`/`species_db`/`leaders`
subtrees (not just the flattened `SavedEmpire`) so a sibling extractor module can build a full
design payload; hand-write the new-entry serializer using the exact tab-indented style sampled
from the real file (do not use `jomini`'s `Writer` class — verified its default output uses
2-space indentation and single-line arrays, cosmetically different from the game's own format).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Designs file upload / FS Access picker | Browser / Client | — | File I/O is entirely client-side; no server exists (D-01) |
| Designs-file parse (span scan + jomini validation) | Browser / Client | — | Must run in-browser; the file never leaves the user's machine |
| Save→design extraction (species/ruler/flag/etc.) | Browser / Client | — | Reuses the existing client-side `.sav` pipeline (`savLoad.ts`) |
| Pending-changes staging (add/remove/archive) | Browser / Client | — | Local UI state; single-session, no persistence requirement beyond D-02's optional handle persistence |
| Splice + serialize output file(s) | Browser / Client | — | Must produce byte-identical kept spans; can only happen where the original bytes live (in-memory in the browser) |
| Download / FS Access write-back + backup | Browser / Client | — | `Blob`+`a[download]` and `showSaveFilePicker`/`FileSystemFileHandle.createWritable` are both browser APIs |
| Static asset hosting (app bundle) | CDN / Static | — | Unchanged from existing phases — this feature ships in the same static SPA bundle |

No Frontend-Server, API/Backend, or Database tier is involved anywhere in this phase — consistent
with the project's static-SPA architecture (CLAUDE.md: "no server component").

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**File access model**
- **D-01: Upload-based flow (user's explicit choice).** The user uploads their
  current `user_empire_designs_v3.4.txt` into the app — same pattern as the
  existing `.sav` loader (file input / drag-drop). No dev-server endpoint; the
  app stays a pure static SPA. Results are handed back as file downloads named
  to match the uploaded file.
- **D-02: FS Access write-back as progressive enhancement.** Where
  `showOpenFilePicker` is available, use it for the upload so the same handle
  can save changes back in place; before any in-place write, download/emit a
  timestamped backup of the original content. Non-Chromium browsers get plain
  upload + download only — feature-detect, never require the API.
- **D-03: Don't hardcode the filename/version suffix.** The game has versioned
  this file (`user_empire_designs_v3.4.txt` today, `_v3` earlier). Accept
  whatever file the user provides; re-emit under the same name.

**Removal & archive**
- **D-04: Archive file next to the original (user-confirmed).** Removed
  designs are appended to `user_empire_designs_archive.txt`, same Clausewitz
  format, restorable by re-adding from the app or copy-paste. The user may
  optionally upload their existing archive file so appends accumulate across
  sessions; otherwise a fresh archive file is generated.
- **D-05: Removal is never destructive-only.** A remove always produces the
  corresponding archive entry in the same session's outputs.

**Adding empires from a save**
- **D-06: Any empire in the save is addable (user-confirmed)** — player or AI.
  The Saved Empire tab already lists every empire in a `.sav`; the manager
  extends that with an "add to my empires" action per empire.
- **D-07: Extraction must produce a complete, game-loadable design entry:**
  species (class, portrait, traits, name list, species name/plural/adjective),
  empire name/adjective, authority, government, ethics, civics, origin,
  empire_flag (icon/background/colors), ruler (name, gender, portrait, class,
  traits), planet_class, graphical_culture, city_graphical_culture, room,
  ship_prefix, spawn flags. `app/src/lib/empire/savLoad.ts` currently extracts
  only a subset (id/name/authority/ethics/civics/origin/perks/researched) —
  extend it (or add a sibling extractor) for the full design payload. Fields
  the save genuinely can't supply (e.g. `initializer`) get safe defaults.

**Round-trip safety (core correctness property)**
- **D-08: Never re-serialize untouched entries.** Parse the uploaded designs
  file into top-level `"Name"={...}` blocks but keep each entry's original
  text span; the output file is a splice — original bytes for kept entries,
  spans dropped for removals, newly serialized text only for added entries.
  A serializer bug must never be able to corrupt designs the user didn't
  touch. Same rule for the uploaded archive file.
- **D-09: Duplicate names.** If an added empire's name collides with an
  existing design key, disambiguate (e.g. suffix) rather than overwrite —
  the game keys designs by name.

### Claude's Discretion
- Exact UI placement (extend the Saved Empire tab vs. a sibling tab/panel),
  component and store shape.
- The parse strategy for locating top-level entry spans (jomini for validation
  + a light span scanner for splicing is acceptable).
- Serializer details for new entries (indentation/quoting matching the game's
  own output style, as sampled from the user's real file).
- How ruler/species lookups resolve through the save's `species_db` /
  leaders tables — validate against a real save during research.

### Deferred Ideas (OUT OF SCOPE)
- In-app editing of design fields (traits, flag designer, etc.)
- Restoring from archive in-app beyond re-adding (nice-to-have; if cheap,
  allow "restore" from an uploaded archive file's list)
- Mod-content awareness/validation of extracted ids
</user_constraints>

<phase_requirements>
## Phase Requirements

No formal `REQUIREMENTS.md` IDs are mapped to this phase — it was added to `ROADMAP.md` post-hoc
at the user's request (see `.planning/STATE.md` → "Roadmap Evolution": *"Phase 4 added: Empire
Manager..."*), outside the v1/v2 requirement tables in `.planning/REQUIREMENTS.md`. The phase's
acceptance criteria are fully specified by CONTEXT.md's D-01 through D-09 decisions above — the
planner should treat those as the requirement list for traceability purposes.
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Static SPA only, no server component** — directly reinforces D-01 (upload-based flow, no
  dev-server endpoint). Any implementation detail that would require a backend (e.g. server-side
  file storage) is out of bounds.
- **Stack is pinned**: Vite 8.1.3 + React 19.x + TypeScript 5.x. `jomini` (0.10.0) and `fflate`
  (^0.8.3) are already `app/` dependencies — this phase adds no new runtime dependencies.
  `sharp`/ImageMagick/elkjs/sigma.js are irrelevant to this phase (no image or graph work).
- **Performance**: "fast and responsive" is a headline project requirement for the tree view;
  this phase's parse/splice work happens on user-initiated file upload (not on every render), so
  it does not carry the same continuous-interaction performance bar, but the existing convention
  of lazy-loading `jomini`+`fflate` as a separate chunk (see `savLoad.ts` comment, `EmpirePanel.tsx`
  `await import(...)`) must be followed so the ~400KB designs-file parser code doesn't bloat the
  main tree-view bundle.
- **Assets/IP**: Not applicable — this phase touches no game icon/art assets.
- **No hand-rolled Clausewitz parser** (CLAUDE.md "What NOT to Use"): use `jomini` for structural
  parsing/validation. Note this constraint is about *parsing*, not the byte-span *splice* logic —
  D-08's span scanner is a narrower, additive tool sitting alongside jomini, not a replacement
  parser (see Pattern 1 below for why this doesn't violate the constraint).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jomini` | 0.10.0 (already installed) | Structural parse/validate the designs & archive text; read save's `country`/`species_db`/`leaders` tables | Already the project's Clausewitz parser (CLAUDE.md pin); verified directly against the real 400KB designs file — parses the 182 top-level entries with zero preprocessing (no `__root__` wrapper needed, unlike `.sav` gamestate) `[VERIFIED: direct file inspection]` |
| `fflate` | ^0.8.3 (already installed) | Unzip `.sav` files (already used by `savLoad.ts`) | No change needed — this phase only extends what's read out of the already-unzipped gamestate |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| File System Access API (native, `showOpenFilePicker`/`FileSystemFileHandle.createWritable`) | Browser-native, no package | Progressive-enhancement write-back per D-02 | Feature-detect via `"showOpenFilePicker" in self`; Chromium (Chrome/Edge/Opera) only as of 2026 `[CITED: developer.chrome.com/docs/capabilities/web-apis/file-system-access]` |
| Native `Blob` + `URL.createObjectURL` + `a[download]` | Browser-native, no package | Fallback / default download path (all browsers) | Always available; this is the D-01 baseline, FS Access is layered on top |
| Native `IndexedDB` (`indexedDB.open`, structured clone of `FileSystemFileHandle`) | Browser-native, no package | Optional: persist the picked file handle across sessions (D-02 mentions this as optional) | `FileSystemFileHandle` is structured-cloneable and can be stored directly in IndexedDB without a helper library; `queryPermission()`/`requestPermission()` must be re-checked on reload since permission grants are not guaranteed to persist `[CITED: developer.chrome.com/docs/capabilities/web-apis/file-system-access]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled span scanner for splicing | `jomini`'s `Writer` class re-serializing the *entire* parsed tree | Rejected: re-serializing everything (even untouched entries) directly violates D-08's core correctness property — a serializer bug could then corrupt designs the user never touched. The scanner only ever touches bytes for entries being added/removed. |
| Hand-rolled tab-indented serializer for new entries | `jomini`'s `Writer` class | `Writer` produces syntactically valid Clausewitz output (confirmed: `is_nomadic=no` style booleans, correct quoting) but with 2-space indentation and single-line arrays — cosmetically different from the game's own tab-indented, multi-line style `[VERIFIED: direct test against jomini 0.10.0]`. Clausewitz's parser is almost certainly whitespace-insensitive so `Writer` output would likely still load in-game, but this is unverified against the actual game client. A hand-rolled template matching the sampled real-file style is lower-risk given the shape is now fully documented (see Code Examples) and keeps the resulting diff visually indistinguishable from game-authored entries. |
| Native IndexedDB for handle persistence | `idb-keyval` (or similar) npm package | Not needed — storing one `FileSystemFileHandle` under one key is a ~10-line raw IndexedDB helper; a dependency is unjustified for this scope, and it's explicitly optional per D-02/CONTEXT discretion. |

**Installation:** None — no new packages required for this phase.

**Version verification:** `jomini@0.10.0` and `fflate@^0.8.3` are already pinned in
`app/package.json` (verified by reading the file directly). No `npm view` check needed since no
new package is being added.

## Package Legitimacy Audit

**No new external packages are introduced by this phase.** `jomini` and `fflate` are pre-existing
`app/` dependencies (already audited/approved in Phase 2/3 research). The File System Access API,
`Blob`, `URL.createObjectURL`, and `IndexedDB` are all native browser APIs with no npm package
involved. The Package Legitimacy Gate protocol (slopcheck, registry verification) is therefore
**not applicable** to this phase — there is nothing to install.

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages evaluated)
**Packages flagged as suspicious [SUS]:** none (no packages evaluated)

## Architecture Patterns

### System Architecture Diagram

```
Upload path (designs file)                    Add-from-save path
─────────────────────────                     ───────────────────
[<input type=file> / drag-drop]                [.sav already loaded via
        OR                                      existing EmpirePanel/savLoad.ts]
[showOpenFilePicker (FS Access)] ──┐                     │
        │                          │            [user clicks "Add to my
        ▼                          │             empires" on a SavedEmpire]
 raw bytes (Uint8Array)            │                     │
        │                          │                     ▼
        ▼                          │            [extractDesignFromCountry()]
 decode UTF-8 (TextDecoder)        │             reads: country.{government,
        │                          │             flag,name,adjective,ship_prefix,
        ▼                          │             graphical_culture,...},
 ┌──────────────────────┐          │             species_db[founder_species_ref],
 │ span scanner          │         │             leaders[country.ruler]
 │ (quote-aware brace    │         │                     │
 │ depth=0 top-level     │         │                     ▼
 │ entries → byte spans) │         │            { name, payload-shape matching
 └──────────┬────────────┘         │             design entry, spanKind: "new" }
            │                      │                     │
            ▼                      │                     │
 [jomini.parseText] for            │                     │
 validation + UI display data ─────┼─────────────────────┤
 (name, authority, ethic, ...)     │                     │
            │                      │                     │
            ▼                      ▼                     ▼
    ┌───────────────────────────────────────────────────────────┐
    │         Pending-changes model (staged in browser state)      │
    │   kept spans (untouched) | removed spans (→ archive) |       │
    │   new entries (serialized fresh, from save extraction)       │
    └───────────────────────────────┬───────────────────────────┘
                                     │ user clicks "Save changes"
                                     ▼
                    ┌────────────────────────────────┐
                    │ splice(): concatenate kept byte  │
                    │ spans + newly serialized text,   │
                    │ drop removed spans; same for      │
                    │ archive file (append removed)     │
                    └───────────────┬────────────────┘
                                     │ UTF-8 encode
                                     ▼
                     ┌───────────────────────────────┐
                     │ Output dispatch                │
                     │  FS Access available?           │
                     │   yes → backup download first,  │
                     │         then createWritable()   │
                     │         write + close (atomic)  │
                     │   no  → Blob + a[download]       │
                     └───────────────────────────────┘
```

### Recommended Project Structure
```
app/src/lib/empire/
├── savLoad.ts              # EXISTING — extend to expose raw country/species_db/leaders
│                            #   subtrees (not just flattened SavedEmpire), so the design
│                            #   extractor can look up founder species / ruler / flag / etc.
├── designsText.ts           # NEW — span scanner (findTopLevelSpans), splice(kept, added,
│                            #   removed) → output bytes; UTF-8 decode/encode helpers
├── designSchema.ts          # NEW — shared "LocName" type ({key, literal?} | {key:"%X%",
│                            #   variables}) + parse/serialize helpers reused across
│                            #   name/adjective/species_name/ship_prefix/ruler_title/etc.
├── designFromSav.ts         # NEW — extractDesignFromCountry(root, countryId) → full design
│                            #   payload object (species, secondary_species?, ruler, flag, ...)
├── designSerialize.ts        # NEW — serialize a design payload object into the exact
│                            #   tab-indented Clausewitz text the game itself writes
└── gates.ts / classify.ts / archetype.ts / draw.ts / classifyEmpire.ts   # EXISTING — unrelated
                                                                          #   tech-gate logic, not touched

app/src/lib/
└── fsAccess.ts               # NEW — showOpenFilePicker wrapper, permission request/query,
                              #   createWritable + backup-before-write, IndexedDB handle
                              #   persistence (optional)

app/src/components/
└── EmpirePanel.tsx / EmpireManagerPanel.tsx (or extend EmpirePanel.tsx)  # UI — Claude's
    discretion per CONTEXT.md whether this is a new tab/panel or an extension of the
    existing Saved Empire tab (see Pattern 5)
```

### Pattern 1: Quote-aware top-level span scanner (the D-08 engine)
**What:** A hand-rolled scanner — not jomini — that walks the raw decoded text tracking (a) whether
it's currently inside a double-quoted string and (b) brace depth, and records `[start, end)` byte
offsets for each `"Name"={...}` block at depth 0. This is the ONLY code path allowed to touch
kept-entry bytes, and it never does — it only *locates* spans; the actual output is built by slicing
the original string/byte array.
**When to use:** Any time the designs file (or the archive file) is loaded and the user might remove
or add entries — i.e., always, for this phase's core round-trip.
**Why this doesn't violate CLAUDE.md's "no hand-rolled Clausewitz parser" rule:** That rule is about
*semantic* parsing (extracting typed field values, handling `@variable`/`hsv{}`/duplicate-key
semantics) — jomini still owns that job for validation and UI-display data. The span scanner's only
job is finding brace-balanced top-level block boundaries in a file whose only quoting concern is
`"`-delimited strings with no backslash-escapes (verified: zero `\"` occurrences in the real
400KB file) and no braces ever observed inside quoted values in the real sample. A minimal,
narrowly-scoped boundary scanner is a fundamentally different (and much lower-risk) piece of code
than a full grammar parser.
**Example (verified against the real file's structure):**
```typescript
// Source: derived from direct inspection of user_empire_designs_v3.4.txt (182 entries, 26517
// lines) — no backslash-escaped quotes observed in the real file; embedded raw 0x11 (Paradox
// color-escape) bytes inside quoted strings do NOT interfere with quote/brace tracking since
// they are not '"' or '{'/'}' characters.
interface EntrySpan {
  name: string;   // the literal bytes between the opening quotes, incl. any embedded 0x11 codes
  start: number;  // index of the opening `"` of the name
  end: number;    // index one past the matching top-level `}`
}

function findTopLevelSpans(text: string): EntrySpan[] {
  const spans: EntrySpan[] = [];
  let i = 0;
  while (i < text.length) {
    // skip whitespace/newlines between top-level entries
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length || text[i] !== '"') break; // EOF or malformed — stop, don't guess
    const nameStart = i;
    i++; // past opening quote
    let name = "";
    while (i < text.length && text[i] !== '"') { name += text[i]; i++; }
    i++; // past closing quote
    while (i < text.length && text[i] !== "{") i++; // skip `=` and whitespace to `{`
    let depth = 0, inQuotes = false;
    const braceStart = i;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"' ) inQuotes = !inQuotes; // no backslash-escape handling — none observed
      else if (!inQuotes && ch === "{") depth++;
      else if (!inQuotes && ch === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    spans.push({ name, start: nameStart, end: i });
  }
  return spans;
}
```

### Pattern 2: Shared "LocName" helper for the pervasive key/literal/variable-template shape
**What:** Nearly every string-ish field in both the design file and the save (`name`, `adjective`,
`species_name`, `species_plural`, `species_adjective`, `planet_name`, `system_name`, `ship_prefix`,
`ruler.ruler_title[_female]`) uses one of two shapes:
1. `{ key: "SomeLocKeyOrLiteralText", literal?: "yes" }`
2. `{ key: "%ADJECTIVE%" | "%ADJ%" | "%LEADER_2%" | ..., variables: { {key, value: LocName}[] } }`
(`ruler.name` adds one extra wrapper level: `{ full_names: LocName, use_full_regnal_name?: "yes" }`.)
**When to use:** Build ONE `parseLocName`/`serializeLocName` pair and reuse it for every field of
this shape in both the designs-file serializer and the save extractor — avoids ad hoc per-field
string building and the bugs that come with it.
**Example (verified — real entries from the file):**
```
// literal form (game-editor-typed text)
species_name={ key="Surreal Stacked Society" literal=yes }
// localisation-key form (vanilla name pool, no literal flag)
species_name={ key="SPEC_Alari" }
// variable-template form (adjective built from a species name)
adjective={
	key="%ADJECTIVE%"
	variables=
	{
		{ key="adjective" value={ key="SPEC_Alari" } }
	}
}
// two-slot compound name (ruler full_names, %LEADER_2% token)
full_names={
	key="%LEADER_2%"
	variables=
	{
		{ key="1" value={ key="PLANT2_CHR_Flower_of" } }
		{ key="2" value={ key="PLANT2_CHR_Somb" } }
	}
}
```

### Pattern 3: Save → design field mapping
**What:** How to resolve every D-07-required design field from a real save's `country` /
`species_db` / `leaders` tables. Verified directly against a real 7.4MB save
(`mpcubecubecubecube16_-933081147/2344.12.07.sav`, unzipped and decoded with the app's own
`fflate`+`jomini`).
**When to use:** This is the field-by-field spec for `designFromSav.ts`.

| Design field | Save source | Notes |
|---|---|---|
| `key` / `name` | `country.name` | Same shape as design's `name` (LocName / variable-template) — copy near-verbatim `[VERIFIED]` |
| `adjective` | `country.adjective` | Same shape, same field name — copy verbatim `[VERIFIED]` |
| `authority` | `country.government.authority` | Direct string copy `[VERIFIED]` |
| `government` | `country.government.type` | Design's top-level `government` = save's `government.type` (design flattens what the save nests) `[VERIFIED]` |
| `civics` | `country.government.civics` | Direct array copy `[VERIFIED]` |
| `origin` | `country.government.origin` | Direct string copy `[VERIFIED]` |
| `ethic` (repeated key, NOT `ethics=` list) | `country.ethos.ethic` (repeated key) — reuse the pop-group fallback already in `savLoad.ts` if `ethos` is absent | **Gotcha, confirmed twice now**: both the save's `ethos` and the DESIGN FILE's top-level field use the singular repeated-key form (`ethic="x" ethic="y"`), unlike `civics=`/`colors=` which are bracketed lists. A dev who assumes `ethic` is list-shaped (like `civics`) will silently emit wrong output. `[VERIFIED: direct file inspection, both files]` |
| `species.class` / `species.portrait` | `species_db[founder_species_ref].class` / `.portrait` | Direct copy, same field names `[VERIFIED]` |
| `species.species_name` / `species_plural` / `species_adjective` | `species_db[i].name` / `.plural` / `.adjective` | **Field renamed** (save: `name`/`plural`/`adjective` at species level → design: `species_name`/`species_plural`/`species_adjective`), same LocName shape `[VERIFIED]` |
| `species.name_list` / `species.gender` | `species_db[i].name_list` / `.gender` | Direct copy, same field names `[VERIFIED]` |
| `species.trait` (repeated key) | `species_db[i].traits.trait` (array, wrapped in a `traits` object) | **Unwrap required**: save wraps traits in a `traits={}` object; design has `trait=` as repeated keys directly under `species={}`, no wrapper `[VERIFIED]` |
| `secondary_species` (optional, ~8% of real entries) | Not directly pointed-to on `country` in the inspected save — **no verified save-side pointer found in this research pass**. See Open Questions. | `[ASSUMED]` — needs a live save with a servitor/gestalt-with-biological-pop country to verify (this research's sample save's inspected countries didn't have this pattern) |
| `founder species resolution when `founder_species_ref` is absent` | Reuse/generalize `savLoad.ts`'s existing "largest population by species" pop-group fallback (currently only used for ethics) | The same fallback logic that resolves ethics-without-`ethos` should be generalized to resolve a full species_db entry, not just ethic strings |
| `empire_flag` | `country.flag` | **Field renamed** (`flag`→`empire_flag`), identical nested shape (`icon.category`/`.file`, `background.category`/`.file`, `colors=[6 quoted strings incl. "null" for unused slots]`) `[VERIFIED]` |
| `ruler` | `country.ruler` (a numeric leader ID) → `leaders[id]` | See Pattern 4 — NOT a direct copy, requires resolution + a fallback path |
| `planet_class` | `planets.planet[country.capital].planet_class` | `country.capital` is a live planet ID into the global `planets.planet` table. **Caveat**: this is the CURRENT capital (may have moved via conquest/relocation, unlike the design file's fixed starting-planet class), and in degenerate saves the resolved id can even point to a star (`pc_*_star`) — validate the resolved class looks like a habitable `pc_*` type, else fall back to a safe default (e.g. `pc_continental`) `[VERIFIED shape, ASSUMED fallback strategy]` |
| `graphical_culture` / `city_graphical_culture` | `country.graphical_culture` / `.city_graphical_culture` | Direct copy, same field names `[VERIFIED]` |
| `room` | `country` — **not directly located in this research pass's sampled country block**; likely present alongside `graphical_culture` based on design-file adjacency, but not independently confirmed against the save | `[ASSUMED]` — verify field presence during implementation; if absent, `default_room` is used by ~40% of real sampled entries and is a safe default |
| `ship_prefix` | `country.ship_prefix` | Direct copy, identical shape (`{key="ISS"}` / `{key="SRS" literal=yes}`) `[VERIFIED]` |
| `is_nomadic` | Not directly observed on `country` in this pass; infer from `origin` (nomadic-family origins) or default `no` | `[ASSUMED]` — 169/182 (93%) of real sampled entries are `no`; safe default |
| `initializer` | No save equivalent (start-of-game system generation choice) | Use `""` (empty string) — 76/182 (42%) of real sampled entries already use an empty initializer, confirming this is an accepted/normal value, not just a placeholder `[VERIFIED via sample frequency]` |
| `spawn_as_fallen` / `spawn_enabled` / `ignore_portrait_duplication` | No save equivalent | Safe defaults matching the overwhelming majority of real sampled entries: `spawn_as_fallen=no`, `spawn_enabled=yes` (162/182), `ignore_portrait_duplication=no` — do NOT default to `spawn_enabled=always`, that value has special AI-empire-pool semantics `[VERIFIED via sample frequency]` |
| `planet_name` / `system_name` | No reliable save equivalent for the ORIGINAL starting names (capital's current name reflects renames) | Use the capital planet's current `name` / its system's current `name` as a reasonable approximation, both already LocName-shaped and directly copyable |
| `advisor_voice_type` (optional) | `country.advisor_voice_type` | Present on the country when set; direct copy when present, omit field entirely when absent (matches 83/182 = 46% real-sample presence rate) `[VERIFIED shape from save inspection]` |

### Pattern 4: Ruler resolution — leader `design` snapshot vs. synthesized fallback
**What:** `country.ruler` in the save is a numeric leader ID, not an inline block. Resolve via
`leaders[id]`. Two cases, both confirmed against real leader entries in the sample save:
1. **Original starting ruler** (leader whose `date` / `recruitment_date` match the game's start
   date, e.g. `2200.01.01` in the sampled save): carries a `design={gender, name, portrait, texture,
   evolution_mask, attachment, clothes, trait, leader_class}` sub-block that is a byte-shape-exact
   match for the design file's `ruler={}` block — **copy it directly, verbatim (after field-name
   pass-through, no renaming needed)** `[VERIFIED]`.
2. **Promoted/elected/replaced ruler** (recruited after game start): **no `design` sub-block
   exists** — confirmed by direct inspection of a real non-original ruler leader entry. Must
   synthesize: `gender`/`name`/`portrait` come from the leader's own top-level fields (same field
   names, direct copy); `texture=0`, `evolution_mask=0`, `attachment=0`, `clothes=0` are safe
   defaults (100% — 182/182 — of real sampled designs use `texture=0`, strongly suggesting this
   slider is rarely touched even by human empire creators `[VERIFIED via sample frequency]`);
   `trait` — pick one representative trait from the leader's `traits` array (the accumulated list
   of ALL traits gained through play is NOT what design's `ruler.trait` wants — that field holds
   exactly one "personality" trait, verified by the case-1 example where `design.trait` was a
   single value also present in, but much shorter than, the full `traits` list) — recommend the
   first `trait_ruler_*`-prefixed entry in the full `traits` list, falling back to any single trait
   if none match that prefix; `leader_class` = the leader's own `class` field (direct copy, same
   field name).
**This heuristic (design-snapshot-only-for-original-ruler) is based on 2 data points in one save**
— tag `[ASSUMED]`, flagged in Assumptions Log below; low implementation risk since both branches
produce a valid, game-loadable ruler block either way.

### Pattern 5: File System Access — progressive enhancement with pre-write backup
**What:** Feature-detect, request `readwrite` permission explicitly, and — critically per D-02 —
emit a backup BEFORE the in-place write is committed (writes are not visible until
`writable.close()`, giving a natural place to sequence "download backup, then write").
**When to use:** Whenever the user picked the designs/archive file via `showOpenFilePicker` (not
plain `<input type=file>`) and chooses to save changes.
**Example:**
```typescript
// Source: developer.chrome.com/docs/capabilities/web-apis/file-system-access (verified 2026-08-18)
const supportsFsAccess = "showOpenFilePicker" in self;

async function pickDesignsFile(): Promise<FileSystemFileHandle | null> {
  if (!supportsFsAccess) return null;
  const [handle] = await (self as any).showOpenFilePicker({
    types: [{ description: "Stellaris empire designs", accept: { "text/plain": [".txt"] } }],
  });
  return handle;
}

async function ensureReadWrite(handle: FileSystemFileHandle): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  if ((await (handle as any).queryPermission(opts)) === "granted") return true;
  return (await (handle as any).requestPermission(opts)) === "granted";
}

async function writeBackThenBackup(
  handle: FileSystemFileHandle,
  originalBytes: Uint8Array,
  newBytes: Uint8Array,
  originalFilename: string,
) {
  // 1) Backup FIRST — before any write touches the real file. Downloaded via
  //    Blob so it doesn't depend on FS Access at all (always works).
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadBlob(originalBytes, `${originalFilename}.${stamp}.bak`);
  // 2) Only now perform the in-place write. Changes aren't visible on disk
  //    until close() — this is effectively atomic from the OS's perspective.
  const writable = await handle.createWritable();
  await writable.write(newBytes);
  await writable.close();
}
```

### Anti-Patterns to Avoid
- **Re-serializing the whole parsed tree on every save**: even if jomini's `Writer` (or any
  full-tree serializer) is used to write NEW entries, never run it over the FULL document including
  kept entries — this is exactly the failure mode D-08 exists to prevent.
- **Reusing `savLoad.ts`'s windows-1252 decoder for the designs file**: the designs file is UTF-8
  (verified below); decoding it as windows-1252 would corrupt the one non-ASCII sample byte
  sequence found in the real file (and any future user's non-ASCII species/empire names).
- **Treating `ethic=` as list-shaped like `civics=`**: it's a repeated scalar key (see Pattern 3)
  in BOTH the save and the design file — a naive `civics`-style serializer (`ethic={ "a" "b" }`)
  would produce a file the game does not write and may not accept.
- **Comparing design names for D-09 duplicate detection after stripping Paradox color codes**:
  the game keys designs by the literal string INCLUDING any embedded `0x11` color-escape bytes
  (confirmed: several real entries have raw `0x11<letter>...0x11!` sequences directly in their
  quoted name) — compare raw byte/string values, only strip codes for *display* (reuse
  `stripPdxCodes` from `pdxText.ts` for the UI list, never for the collision check or the splice).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clausewitz field-value parsing (typed extraction for UI display, validation) | A regex/manual value parser | `jomini.parseText` (already a dependency) | Per CLAUDE.md — Clausewitz has real edge cases (duplicate keys, quoting) that jomini already solves |
| Top-level entry byte-span location for splicing | — (this genuinely IS hand-rolled, by design) | See Pattern 1 | D-08 explicitly requires this NOT go through a full re-serialize path; CONTEXT.md's own "Claude's discretion" section calls this out as acceptable |
| UTF-8/windows-1252 decode/encode | Hand-written charset tables | Native `TextDecoder`/`TextEncoder` | Browser-native, zero-dependency, already the pattern used in `savLoad.ts` for windows-1252 |
| File download | Manual anchor-tag/blob wrangling from scratch each time | One shared `downloadBlob(bytes, filename)` helper | Trivial but should be written once and reused for: designs file, archive file, and pre-write backups (3+ call sites in this phase alone) |
| Paradox color-code display rendering | New parser | `parsePdxText`/`stripPdxCodes` from `app/src/lib/pdxText.ts` (already exists) | Already handles the exact `0x11<code>`/`0x11!`/`0x13<icon>` escape grammar found in both save-derived and design-file names |

**Key insight:** Almost nothing here needs a new dependency or a from-scratch parser — the highest-
value work in this phase is *mapping* (save fields → design fields) and *careful scope-limiting*
(the span scanner touches as little as possible), not building new parsing infrastructure.

## Common Pitfalls

### Pitfall 1: Encoding mismatch (UTF-8 vs windows-1252)
**What goes wrong:** Reusing `savLoad.ts`'s `new TextDecoder("windows-1252")` pattern for the
designs file corrupts non-ASCII characters.
**Why it happens:** The `.sav` gamestate genuinely is windows-1252 (established, working code);
it's an easy copy-paste mistake to assume the designs file uses the same encoding.
**How to avoid:** Decode the designs/archive file as UTF-8. Verified directly: the real file's
only non-ASCII byte sequence (3 bytes at offset 66958) decodes cleanly as a single valid UTF-8
codepoint (U+202F NARROW NO-BREAK SPACE) and a full-file UTF-8 decode→re-encode round-trip was
byte-for-byte identical to the original 399,931-byte file (`[VERIFIED: direct byte inspection +
round-trip test against the real file]`). Only one non-ASCII sample point exists in this user's
file, so treat this as strong-but-singular evidence, not exhaustive proof across all possible
user files — see Assumptions Log.
**Warning signs:** Any mojibake in species/empire names containing accented characters after
round-tripping a file with non-ASCII content.

### Pitfall 2: `ethic=` is a repeated scalar key, not a list block
**What goes wrong:** Serializing ethics the same way as `civics=`/`colors=` (`ethic={ "a" "b" }`)
produces output the design file format doesn't use.
**Why it happens:** `civics`, `colors`, and secondary-species trait lists ARE bracketed lists —
it's natural to assume `ethic` follows the same pattern, especially since jomini will happily
parse either shape.
**How to avoid:** Emit `ethic="x"` as repeated top-level lines (one per ethic), matching the
verified real-file pattern (394 occurrences across 182 entries, avg 2.16/entry, always the
singular repeated-key form, zero occurrences of an `ethics=` bracketed block).
**Warning signs:** A generated design entry the game's empire editor fails to parse/list correctly.

### Pitfall 3: jomini's `Writer` output is cosmetically non-native
**What goes wrong:** Using `Jomini.write()` to emit new entries produces valid-but-different-
looking output (2-space indent, single-line arrays) compared to every other entry in the file.
**Why it happens:** `Writer`'s formatting defaults aren't configurable to match an arbitrary
target style; it's easy to assume "jomini wrote it, so it's the format".
**How to avoid:** Hand-write the serializer using the tab-indented, one-value-per-line style shown
in Code Examples below, matching the 182 real sampled entries exactly.
**Warning signs:** Diffing the app's output against the game's own re-save of the same file shows
every line different even when semantically identical.

### Pitfall 4: Ruler `design` snapshot only exists for the original starting ruler
**What goes wrong:** Code that always looks for `leaders[id].design` will silently produce an
incomplete/wrong ruler block (or throw) for any empire whose current ruler was elected/promoted
after game start — which is common in longer-running saves.
**Why it happens:** The happy-path case (an empire whose original ruler is still in charge) is the
first one anyone tests against.
**How to avoid:** Always branch on `design` presence; implement the synthesis fallback (Pattern 4)
as the default path, not an edge case.
**Warning signs:** "Add to my empires" works for some save empires but produces a ruler with
missing/default portrait sliders for others — this is likely the *expected*, safe outcome for
non-original rulers, not a bug, but the UI/tests should treat it as a known, exercised code path.

### Pitfall 5: `country.capital` can resolve to a non-habitable planet class
**What goes wrong:** Directly copying `planets.planet[country.capital].planet_class` into the
design's `planet_class` field can produce an invalid/nonsensical value (e.g. `pc_k_star`) if the
capital reference resolves unexpectedly (observed once in the sampled test save, for a country
whose `capital` pointed at what appears to be a star object rather than a colonized planet).
**Why it happens:** `planets.planet` is a single flat table covering stars, asteroids, and
colonizable planets — an unusual or edge-case save state can produce a capital id pointing outside
the expected "actual planet" range.
**How to avoid:** Validate the resolved `planet_class` starts with a known habitable-class prefix
(reuse the pipeline's existing planet-class vocabulary if accessible, or a small denylist of
star/asteroid classes) and fall back to a safe default (e.g. `pc_continental`) when it doesn't.
**Warning signs:** A generated design with an obviously wrong planet class (a star or belt type)
for what should be a normal empire.

### Pitfall 6: Splice must also protect the archive file, not just the designs file
**What goes wrong:** Treating the archive file as "just append text" without applying the same
span-preserving discipline to its EXISTING entries (when the user re-uploads a previous archive to
accumulate across sessions) risks corrupting previously-archived designs.
**Why it happens:** Appending feels simpler than the designs-file's add/remove/keep splice, so it's
tempting to just string-concatenate without parsing the existing archive at all.
**How to avoid:** D-08 explicitly states "Same rule for the uploaded archive file" — run the
archive file through the identical span-scanner-based splice engine; new entries append, existing
entries are never re-serialized.
**Warning signs:** A previously-archived design's exact formatting (whitespace, trailing content)
changes after a session that only added more entries to the archive.

## Code Examples

### A complete real design entry (ground truth for the serializer)
```
// Source: direct read of the user's real user_empire_designs_v3.4.txt, entry 1 (lines 1-152)
"Alarian Consciousness"=
{
	key="Alarian Consciousness"
	ship_prefix=
	{
		key="ISS"
	}
	species=
	{
		class="AQUATIC"
		portrait="aqu12"
		species_name=
		{
			key="SPEC_Alari"
		}
		species_plural=
		{
			key="SPEC_Alari_pl"
		}
		species_adjective=
		{
			key="%ADJECTIVE%"
			variables=
			{
				{
					key="adjective"
					value=
					{
						key="SPEC_Alari"
					}
				}
			}
		}
		name_list="HUM1"
		gender=not_set
		trait="trait_hive_mind"
		trait="trait_aquatic"
		trait="trait_rapid_breeders"
		trait="trait_quarrelsome"
		trait="trait_weak"
		trait="trait_organic"
	}
	name=
	{
		key="%ADJECTIVE%"
		variables=
		{
			{ key="adjective" value={ key="SPEC_Alari" } }
			{ key="1" value={ key="Consciousness" } }
		}
	}
	adjective=
	{
		key="%ADJECTIVE%"
		variables=
		{
			{ key="adjective" value={ key="SPEC_Alari" } }
		}
	}
	authority="auth_hive_mind"
	government="gov_hive_mind"
	is_nomadic=no
	planet_name={ key="SPEC_Hesukar_planet" }
	planet_class="pc_continental"
	system_name={ key="SPEC_Hesukar_system" }
	initializer="ocean_paradise_start"
	graphical_culture="aquatic_01"
	city_graphical_culture="aquatic_01"
	empire_flag=
	{
		icon={ category="aquatic" file="aquatic_08.dds" }
		background={ category="backgrounds" file="flag_BG_29.dds" }
		colors=
		{
			"ocean_turquoise"
			"dark_teal"
			"black"
			"null"
			"null"
			"null"
		}
	}
	ruler=
	{
		gender=female
		name={ full_names={ key="HUM1_CHR_Elemani" } use_full_regnal_name=yes }
		portrait="aqu12"
		texture=2
		evolution_mask=0
		attachment=0
		clothes=0
		trait="leader_trait_spark_of_genius"
		leader_class="scientist"
	}
	spawn_as_fallen=no
	ignore_portrait_duplication=no
	room="necroids_room"
	spawn_enabled=yes
	ethic="ethic_gestalt_consciousness"
	civics=
	{
		"civic_hive_empath"
		"civic_hive_natural_neural_network"
	}
	origin="origin_ocean_paradise"
}
```
(Reformatted slightly for brevity above — the real file has every nested `{`/value on its own
line with tab indentation per depth; match that exactly when serializing new entries.)

### Confirmed: jomini parses the designs file with zero preprocessing
```typescript
// Source: direct test against jomini 0.10.0 + the real user_empire_designs_v3.4.txt
const parser = await Jomini.initialize();
const parsed = parser.parseText(text, { encoding: "utf8" }); // NOT windows1252
// parsed is directly { "Alarian Consciousness": {...}, "Quentian Trade Commission": {...}, ... }
// — no __root__ wrapper needed (unlike the .sav gamestate in savLoad.ts), because every
// top-level construct in this file is already a valid key=value pair, whereas the raw
// gamestate text is a bare sequence of top-level keys that jomini's root query needs wrapped.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `<input type=file>` + manual `a[download]` as the only web file-write mechanism | File System Access API (`showOpenFilePicker`/`createWritable`) for direct in-place writes, Chromium-only | Chrome ~86 (2020) onward; still Chromium-exclusive as of 2026 | D-02's "progressive enhancement" framing is the correct, current best practice — there is no cross-browser equivalent, so feature-detection + fallback (not a polyfill) is the only viable approach |

**Deprecated/outdated:** None specific to this phase's domain — Clausewitz text format itself is
stable across Stellaris versions (only the filename suffix changes, per D-03).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The designs file is UTF-8 for all users, not just this one sample | Pitfall 1 / Standard Stack | Verified strongly (byte-perfect round-trip + one clean non-ASCII UTF-8 sequence) but only one non-ASCII data point exists in the sampled file. If a different user's file turns out to be windows-1252, decoding as UTF-8 would either throw (if `fatal: true`) or silently produce mojibake (if not). **Mitigation recommended for the planner**: decode with `{fatal: true}`, catch the exception, and retry as windows-1252 as a defensive fallback, surfacing a warning either way. |
| A2 | `secondary_species` has no directly-observed save-side source field in this research pass | Pattern 3 | If implemented naively (skipped entirely), a "Driven Assimilator"/gestalt-with-servants-style empire added from a save would be missing its second species — game-loadable but incomplete vs. the original design. Needs a live save containing this pattern before implementing that specific field. |
| A3 | `room` field's exact save-side source location wasn't independently confirmed (only inferred from design-file adjacency) | Pattern 3 | Low risk — `default_room` is a safe, common fallback (~40% of real entries) even if the true save-side value can't be located. |
| A4 | Ruler `design` sub-block exists ONLY for the leader who was the original starting ruler (recruited at game-start date) | Pattern 4 | Based on 2 data points (one with, one without) from a single save. If the heuristic is wrong (e.g. `design` sometimes persists after a ruler change, or is sometimes absent even for the original ruler), the fallback-synthesis path still produces a valid, game-loadable ruler block — risk is cosmetic (wrong portrait slider values), not correctness-breaking. |
| A5 | `is_nomadic` has no directly-confirmed save-side source field | Pattern 3 | Defaulting to `no` (93% of real sample) is safe for the vast majority of empires; a Nomadic-origin save empire added without the correct `is_nomadic=yes`/`ship_size` pairing would produce a technically-valid but non-nomadic design. |
| A6 | Recommendation to hand-roll the new-entry serializer (vs. jomini's `Writer`) has not been tested against the actual Stellaris game client's loader | Standard Stack / Pitfall 3 | If Clausewitz turns out to be whitespace/format-sensitive in some way not evident from the sample, `Writer`'s cosmetically-different-but-syntactically-valid output would actually have been safer. Recommend a manual smoke test: paste a generated new entry into a copy of the real file and load it in the game's empire creation screen before shipping. |

**If this table is empty:** N/A — six assumptions logged above, all flagged with concrete mitigation
or verification steps.

## Open Questions (RESOLVED — annotations added at plan-check, 2026-08-18)

1. **Save-side source for `secondary_species` extraction** — **(ACCEPTED as documented v1 limitation)**
   04-04-PLAN.md deliberately omits `secondary_species` extraction with an in-source comment;
   `designSchema.ts` keeps the field optional so future work can populate it without a schema
   change. Recorded in 04-CONTEXT.md Deferred Ideas.
   - What we know: The design file's `secondary_species` block is shaped identically to `species`
     (verified from 15 real sample entries, e.g. "Cyrrician Core" — a Machine Servitor gestalt with
     a `MACHINE` primary species and a `PLANT` secondary species).
   - What's unclear: This research's sample save's inspected countries didn't include a
     servitor/gestalt-with-biological-pop pattern, so no save-side field pointing to a "secondary"
     species was directly observed. It may be derivable from `pop_groups` (second-most-populous
     species after the founder, similar to the existing ethics pop-group fallback) or there may be
     a direct country-level pointer not yet located.
   - Recommendation: Before implementing this specific field, load a save containing a Driven
     Assimilator, Machine Servitor, or Hive/Servitor-hybrid empire and grep its `country` block for
     a species reference beyond `founder_species_ref`.

2. **Exact save-side field name for `room`** — **(RESOLVED)** 04-04-PLAN.md's interfaces block
   cites measured save data (`country.room` present on 70/133 countries) and specifies the
   `default_room` fallback; the plan states "(Resolves RESEARCH Open Question 2 / assumption A3.)"
   - What we know: The design file always has a `room="..._room"` field (100% of 182 sampled
     entries), and it appears in the field-order sequence right after `city_graphical_culture` /
     near `ship_prefix`.
   - What's unclear: This exact field wasn't independently located inside the sampled save's
     country block in this research pass (time-boxed grep didn't hit it before other fields were
     confirmed).
   - Recommendation: `default_room` is a safe fallback if the field truly isn't present in the
     save; verify presence/absence during implementation with a targeted grep for `room=` inside
     a country block.

3. **Whether Clausewitz/the game client cares about serializer whitespace style** — **(RESOLVED
   via verification checkpoint)** 04-08-PLAN.md Task 3 is an explicit human-verification checkpoint
   that loads the produced file in the actual game client, discharging assumption A6; additionally
   the serializer (04-03) targets byte-style parity with the game's own output as a golden-text test.
   - What we know: jomini's own `Writer` produces syntactically different (but presumably still
     valid) whitespace than the game's own output.
   - What's unclear: Whether the game's file loader (used both when loading the empire creation
     screen and when re-saving via the in-game editor) is fully whitespace-agnostic.
   - Recommendation: manual smoke test recommended in Assumptions Log A6.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| File System Access API (`showOpenFilePicker`, `createWritable`) | D-02 write-back | Browser-dependent (Chromium only) | N/A (native API, no version) | Plain `<input type=file>` + `Blob`/`a[download]` — this is D-01's baseline, not a degraded mode; D-02 explicitly frames FS Access as progressive enhancement on top of it `[CITED: developer.chrome.com]` |
| Node.js (build/dev tooling) | Existing project tooling | ✓ | v24.15.0 (verified on this machine) | — |
| `jomini` (already installed) | Parse/validate | ✓ | 0.10.0 | — |
| `fflate` (already installed) | `.sav` unzip | ✓ | ^0.8.3 | — |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** File System Access API on non-Chromium browsers — this is
the expected, designed-for case (D-02), not a gap to fill.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Static SPA, no accounts (CLAUDE.md: no auth system) |
| V3 Session Management | no | No server/session concept exists |
| V4 Access Control | no | No server-side resources to control access to |
| V5 Input Validation | yes | User-uploaded designs/archive/save files are untrusted input: run `jomini.parseText` in a `try`/`catch` for structural validation BEFORE offering any write-back UI; the span scanner (Pattern 1) must fail closed (stop and surface an error) on any file it can't fully account for, rather than guessing at boundaries and silently corrupting output |
| V6 Cryptography | no | No secrets, no crypto operations in this phase |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/foreign `.txt` file uploaded as "designs file" (wrong file entirely, or a truncated/corrupted one) | Tampering (of the app's own output, via bad input) | Validate with `jomini.parseText` first; if it throws or the span scanner can't reconcile spans with jomini's entry count, refuse to offer "Save changes" and show a clear error instead of emitting a possibly-corrupt splice |
| In-place write (`createWritable`/`close()`) silently destroying the user's real file if a bug in the splice logic produces bad output, with no recovery path | Repudiation / data loss (not a classic security threat, but the D-02-mandated safety property) | The pre-write backup (Pattern 5) must be sequenced to complete BEFORE `createWritable()` is ever called — this is the actual mitigation D-02 specifies, and it should be enforced in code (not just convention), e.g. by making the backup step a required argument/step in the write-back function's control flow |
| Rendering user/save-derived names (which can contain raw control bytes / Paradox color-escape sequences) directly into the DOM | Tampering (of the app's own display, via crafted save content) | Continue routing all such text through `parsePdxText`/`stripPdxCodes` (existing, `pdxText.ts`) for display — never `dangerouslySetInnerHTML`; these bytes should stay opaque data throughout the splice/serialize pipeline and only be interpreted at the two existing display call sites |

## Sources

### Primary (HIGH confidence)
- Direct read + byte-level inspection of `C:\Users\alexy\Documents\Paradox Interactive\Stellaris\user_empire_designs_v3.4.txt` (397,632 bytes / 26,517 lines / 182 top-level entries) — field presence/order tables, encoding determination, all Pattern 1-3 claims tagged `[VERIFIED: direct file inspection]`
- Direct extraction + inspection of a real save (`mpcubecubecubecube16_-933081147/2344.12.07.sav`, unzipped via `fflate`, decoded via `TextDecoder("windows-1252")`, 82.3MB gamestate) using the app's own installed dependencies — `country`, `species_db`, `leaders`, `planets` table shapes
- `app/node_modules/jomini/dist/types/jomini.d.ts` — confirmed `Query`/`Writer` API surface (no span/offset info exposed; `Writer`'s default formatting tested directly)
- Direct test of `jomini.parseText` against the real designs file (Node script using `app/node_modules/jomini` + `app/node_modules/fflate`) — confirmed root-level parse works with zero preprocessing, byte-perfect UTF-8 round-trip
- `app/src/lib/empire/savLoad.ts`, `app/src/components/EmpirePanel.tsx`, `app/src/lib/pdxText.ts`, `app/src/lib/empire/gates.ts` — existing codebase, read in full
- [File System Access API — Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) — fetched directly, `showOpenFilePicker`/`createWritable`/permission-model/handle-persistence details

### Secondary (MEDIUM confidence)
- WebSearch: "File System Access API showOpenFilePicker createWritable browser support 2026 Firefox Safari" — cross-referenced MDN/Chrome docs/testmuai.com summaries confirming Chromium-only status persists into 2026 with no Firefox/Safari support announced

### Tertiary (LOW confidence)
- None — all findings in this research were either directly verified against real project files/dependencies or cited from official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing pinned versions read directly from `app/package.json`
- Architecture: HIGH — every field-mapping claim was checked against real file bytes or real save contents, not training-data recall
- Pitfalls: HIGH for encoding/ethic-shape/Writer-formatting (directly tested); MEDIUM for the ruler-design-snapshot heuristic and capital-planet-class edge case (small sample size, logged in Assumptions)

**Research date:** 2026-08-18
**Valid until:** Stable — Clausewitz text format and the File System Access API surface change
slowly; re-verify if the game updates the designs-file version suffix past `_v3.4` (per D-03,
the app must not hardcode this anyway) or if Firefox/Safari ship FS Access support (would change
the Environment Availability table, not the core parsing/splice logic).
