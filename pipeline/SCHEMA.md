# tech.json Schema

This document describes the contract of `data/v{version}/tech.json` — the
build-time data pipeline's single output artifact and the **hard boundary**
between the pipeline (`pipeline/`) and the Phase 2 frontend consumer.

**Source of truth:** `pipeline/src/schema/tech-snapshot.ts` (`TechSnapshotSchema`,
a Zod schema). This document is a human-readable companion to that module —
if the two ever disagree, the Zod schema is authoritative. `TechSnapshotSchema.parse()`
gates every write (D-16): the pipeline throws and writes nothing if the
assembled snapshot fails validation.

Phase 2 can build against fixture data shaped to this contract before or
independently of running the pipeline itself.

## Top-level shape

```ts
{
  meta: Meta,
  techs: Record<string, Tech>, // keyed by tech key, e.g. "tech_lasers_1"
}
```

## `meta` block

| Field | Type | Nullable | Description |
|---|---|---|---|
| `gameVersion` | `string` | no | Auto-detected from `launcher-settings.json`'s `rawVersion` (D-02), e.g. `"v4.5.0"`. |
| `generatedAt` | `string` | no | ISO-8601 timestamp of the pipeline run. **Volatile** — differs between runs by design; excluded/normalized when testing idempotency (DATA-05). |
| `techCount` | `number` | no | Total number of techs in the `techs` record. Matches `Object.keys(techs).length`. |
| `areaCounts` | `Record<string, number>` | no | Tech count per research area (`physics`/`society`/`engineering`). |
| `tierCounts` | `Record<string, number>` | no | Tech count per tier (stringified tier number as the key). |
| `sourceFiles` | `string[]` | no | The full list of source filenames under `common/technology/` that were parsed (33 files for the current corpus). |

## `techs` record

Keyed by tech key (e.g. `"tech_lasers_1"`). Written **sorted by key** for
deterministic, diff-stable output across runs (D-03/DATA-05).

## `Tech` fields

| Field | Type | Nullable | Description |
|---|---|---|---|
| `key` | `string` | no | The tech's Clausewitz script key, e.g. `"tech_lasers_1"`. |
| `area` | `"physics" \| "society" \| "engineering"` | no | Research area. |
| `category` | `string[]` | no (may be `[]`) | Category tag(s), e.g. `["weapons"]`. |
| `tier` | `number` | no | Tech tier. |
| `cost` | `number` | no | Resolved concrete research cost — `@scripted_variable` references are resolved to a plain number before this field is populated (DATA-02). |
| `costRaw` | `unknown` | yes (optional) | Preserves the documented-but-rarely-observed block-form `cost = { factor = ... }` shape when present, instead of discarding it. Absent for the common bare-number/`@variable` case. |
| `weight` | `number` | no | Resolved base flat weight (D-06), for display. Same `@scripted_variable` resolution as `cost`. |
| `weightModifierRaw` | `unknown` | yes (optional) | The raw `weight_modifier` block(s), preserved structurally and NOT flattened (D-06) — duplicate `modifier` entries stay arrays. Deferred structured display is v2 (WGHT-01); this field exists so that future work has the real data rather than a lossy summary. |
| `prerequisites` | `string[]` | no (may be `[]`) | Flattened list of prerequisite tech keys. OR-alternative blocks (`{OR: [...]}` or jomini's mixed-key positional artifact) are flattened into real edges — "any one of these satisfies the prerequisite" is still treated as a genuine dependency relationship for graph/leadsTo purposes. No AND/OR semantics are modeled in this field's shape. |
| `unlocks` | `{ grants: string[], leadsTo: string[] }` | no (both sub-fields always present, required, never `.default()`) | See "unlocks (D-05)" section below — the two-component shape. |
| `dlc` | `string \| null` | yes | The DLC display name gating this tech (e.g. `"Apocalypse"`), or `null` for base-game content (D-08). Sourced from the game's own `dlc/dlc0XX_*/dlc0XX.dlc` metadata (`name` field), matched by source filename convention and/or an explicit `host_has_dlc` trigger override — not a hand-typed lookup table. |
| `flags` | `{ isRare: boolean, isDangerous: boolean, isRepeatable: boolean, isStarting: boolean }` | no | Parsed flags (D-09). Visual flag legend/display is deferred to v2 (FLAG-01); the data ships now so no pipeline re-run is needed later. |
| `name` | `string` | no | Resolved localised display name. **Strict-fail** (D-16): the pipeline throws and refuses to write if any tech's name cannot be resolved. |
| `description` | `string \| null` | yes | Resolved localised description. **Warn-not-fail** (D-16): `null` is an expected, cosmetic gap for some techs, not a build failure. |
| `icon` | `string \| null` | yes | Web-ready icon reference (the emitted `.webp` filename under `data/v{version}/icons/`), either the tech's real converted icon or the shipped placeholder filename (D-13) if no source `.dds` could be resolved. |

### Plain-text string contract (Security Domain)

`name`, `description`, and every string in `unlocks.grants` are shipped as
**raw plain text**, exactly as extracted from the game's localisation files.
The pipeline does **not** convert Paradox markup (`§color§!` codes, `$variable$`
tokens) into HTML or any other markup — Phase 2 owns safe rendering of these
strings. Treat every one of these fields as untrusted display text requiring
proper escaping/sanitization at render time, not as pre-sanitized HTML.

## `unlocks` (D-05) — the two-component shape

`unlocks` is the field that answers "what does this tech unlock?" for the
Phase 2 frontend. It deliberately separates two distinct components, **both
required** (non-optional `string[]` fields — a fixture omitting either
sub-field fails Zod validation):

- **`grants`** — what the tech **itself** grants. Built by joining the tech's
  own captured raw unlock content (its `feature_flags` tokens, `prereqfor_desc`
  title/desc localisation-key pairs, top-level `modifier` stat key/value
  grants, and `gateway` marker) with the global localisation map. Each token
  is resolved to a human-readable display string where a real localisation
  entry exists; otherwise it ships **verbatim as plain text** (never HTML —
  Security Domain) and is counted as a cosmetic "unresolved grant loc-key" in
  the validation report (warn, not fail, per D-16). May be `[]` for a tech
  that grants nothing of this kind.
- **`leadsTo`** — the computed **reverse-prerequisite edges**: the sorted
  list of tech keys that list *this* tech as one of their `prerequisites`
  ("this tech leads to X"). Computed once for the whole corpus by the
  prerequisite-graph builder (which also validates the graph is a real DAG —
  fails loud on any dangling reference or cycle, D-16). May be `[]` for a
  leaf tech with no dependents.

Both arrays are sorted deterministically (D-03) so re-running the pipeline
produces byte-identical output.

**Explicitly out of scope for v1:** deep building/component/ship
cross-referencing (e.g. "this tech unlocks the ability to build X") is
**not** part of `grants` — that is UNLK-01, deferred to v2. `grants` in v1 is
limited to what can be extracted from the tech's own script content plus
localisation, as described above.

## Determinism / idempotency (D-03, DATA-05)

Re-running the pipeline against the same game install produces a
byte-identical `tech.json`, except for `meta.generatedAt` (a timestamp that
legitimately changes every run). This is achieved by:

- Sorting `techs` by tech key.
- Sorting every internal list, including `prerequisites`, `unlocks.grants`,
  and `unlocks.leadsTo`.
- Fixed 2-space JSON indentation and stable key ordering (no incidental
  ordering from object insertion order).

## Strict-fail vs. warn-and-report (D-16)

| Condition | Policy |
|---|---|
| Unparseable tech file | **Strict-fail** — throw, write nothing. |
| Unresolved prerequisite ID (dangling reference) | **Strict-fail** — the graph builder throws. |
| Unresolved `@scripted_variable` in a required field (cost/weight) | **Strict-fail** — throw, write nothing. |
| Missing tech `name` | **Strict-fail** — throw, write nothing. |
| Missing icon | **Warn-and-report** — shipped placeholder icon, counted in the report. |
| Missing `description` | **Warn-and-report** — `null`, counted in the report. |
| `prereqfor_desc`/`modifier` grant loc-key with no localisation entry | **Warn-and-report** (cosmetic) — token shipped verbatim in `unlocks.grants`, counted in the report. |

## Validation report (D-17)

Every pipeline run prints a console report (see `pipeline/src/report.ts`)
covering: total tech count parsed vs. total `tech_*` keys found, unresolved
`@scripted_variable` count (must be 0), dangling-prerequisite count (must be
0), counts of techs missing name/description/icon, per-area and per-tier
tech counts, a DLC breakdown, the two known cross-DLC `host_has_dlc` sanity
checks (`tech_titans` -> Apocalypse, `tech_juggernaut` -> Federations), and
unlocks coverage (techs with non-empty `grants`, techs with non-empty
`leadsTo`, and the count of unresolved grant loc-keys).
