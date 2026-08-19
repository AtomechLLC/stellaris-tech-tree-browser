# Phase 4: Empire Manager - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an **Empire Manager** feature to the existing app: the user uploads their
`user_empire_designs_v3.4.txt` (the custom-empire list from
`Documents\Paradox Interactive\Stellaris\`), the app lists the designs in it,
and the user can (a) add any empire from a loaded `.sav` as a full playable
custom empire design, (b) remove existing designs, with removed designs
archived to a `user_empire_designs_archive.txt` in the same format. Updated
files are returned via download; when the browser supports the File System
Access API (Chrome/Edge), the app writes straight back to the picked file.

**In scope:** designs-file parsing + lossless round-trip, save→design
extraction (species/traits/flag/ruler/ethics/civics/origin/etc.), add/remove
UI, archive file generation (appending to an optionally-uploaded existing
archive), download + FS-Access write-back with pre-write backup.

**Out of scope:** editing a design's fields in-app, creating designs from
scratch, mod-added content guarantees (vanilla + owned-DLC content is the
target), any server component, biography/lore text authoring.

</domain>

<decisions>
## Implementation Decisions (user-confirmed 2026-08-18)

### File access model
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

### Removal & archive
- **D-04: Archive file next to the original (user-confirmed).** Removed
  designs are appended to `user_empire_designs_archive.txt`, same Clausewitz
  format, restorable by re-adding from the app or copy-paste. The user may
  optionally upload their existing archive file so appends accumulate across
  sessions; otherwise a fresh archive file is generated.
- **D-05: Removal is never destructive-only.** A remove always produces the
  corresponding archive entry in the same session's outputs.

### Adding empires from a save
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

### Round-trip safety (core correctness property)
- **D-08: Never re-serialize untouched entries.** Parse the uploaded designs
  file into top-level `"Name"={...}` blocks but keep each entry's original
  text span; the output file is a splice — original bytes for kept entries,
  spans dropped for removals, newly serialized text only for added entries.
  A serializer bug must never be able to corrupt designs the user didn't
  touch. Same rule for the uploaded archive file.
- **D-09: Duplicate names.** If an added empire's name collides with an
  existing design key, disambiguate (e.g. suffix) rather than overwrite —
  the game keys designs by name.

### Claude's discretion
- Exact UI placement (extend the Saved Empire tab vs. a sibling tab/panel),
  component and store shape.
- The parse strategy for locating top-level entry spans (jomini for validation
  + a light span scanner for splicing is acceptable).
- Serializer details for new entries (indentation/quoting matching the game's
  own output style, as sampled from the user's real file).
- How ruler/species lookups resolve through the save's `species_db` /
  leaders tables — validate against a real save during research.

</decisions>

<canonical_refs>
## Canonical References

- `app/src/lib/empire/savLoad.ts` — existing client-side .sav pipeline
  (fflate unzip → jomini parse → country extraction). Extend, don't fork its
  learnings: windows-1252 decode, `__root__` wrapper, `ethos.ethic` singular
  key gotcha, pop-group ethics fallback.
- `app/src/components/EmpirePanel.tsx` — the Saved Empire tab this feature
  integrates with (empire list, lazy parser import pattern).
- `C:\Users\alexy\Documents\Paradox Interactive\Stellaris\user_empire_designs_v3.4.txt`
  — the real target file (~400 KB); sample entries inspected 2026-08-18 show
  the full design shape (species block with traits, `%ADJECTIVE%` name
  variables, empire_flag, ruler block, ethic/civics/origin).
- `app/src/lib/pdxText.ts` — existing Paradox text helpers.

</canonical_refs>

<code_context>
## Existing Code Insights

- Parser stack already in the app: `jomini` (WASM, lazy-loaded chunk) +
  `fflate`. The designs file is plain text (no zip) — jomini `parseText`
  handles it directly.
- The `.sav` loader lazy-imports its module so parser weight stays out of the
  main bundle — the designs parser/serializer should follow the same pattern.
- Name rendering: design names use localisation keys and `%ADJECTIVE%`
  variable templates; `stripPdxCodes`/`parsePdxText` exist for display.
  Save-derived empires may have literal names (`name.literal=yes`) vs key
  names — the extractor must emit the design-file name structure, not a
  flattened display string.
</code_context>

<specifics>
## Specific Ideas

- Add-to-list action lives naturally on the already-selected empire in the
  Saved Empire tab ("Add to my empires"), with the manager panel showing the
  uploaded list state (current designs, pending adds/removes, archive
  preview) and a single "Save changes" step producing the outputs.
- Pending-changes model (stage adds/removes, then one write/download) beats
  per-action downloads — one file dialog instead of many.
</specifics>

<deferred>
## Deferred Ideas

- In-app editing of design fields (traits, flag designer, etc.)
- `secondary_species` extraction from saves (accepted v1 limitation at plan-check: no verified
  save-side source field located — RESEARCH Open Question 1; `designSchema.ts` keeps the field
  optional so it can be populated later without a schema change, and 04-04 records the omission
  with an in-source comment)
- Restoring from archive in-app beyond re-adding (nice-to-have; if cheap,
  allow "restore" from an uploaded archive file's list)
- Mod-content awareness/validation of extracted ids
</deferred>

---

*Phase: 4 - Empire Manager*
*Context gathered: 2026-08-18*
