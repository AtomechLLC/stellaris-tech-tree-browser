# Phase 1: Data Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 1-Data Pipeline
**Areas discussed:** Snapshot contract & versioning, Parsed data depth (v1), Icon pipeline, Pipeline ergonomics & failure policy
**Mode:** `--auto` — all gray areas auto-selected; recommended option chosen for each question without user prompts.

---

## Snapshot contract & versioning

| Option | Description | Selected |
|--------|-------------|----------|
| Single versioned tech.json | `data/v{version}/tech.json` + icons dir, meta block, deterministic ordering | ✓ |
| Split by area | Separate physics/society/engineering JSON files (reference tool's approach) | |
| Split by DLC for lazy-loading | Per-DLC chunks loaded on demand | |

**Auto-selected:** Single versioned tech.json (recommended by architecture research — split unnecessary at ~600-900 techs; single file keeps the contract simple).
**Notes:** Version auto-detected from `launcher-settings.json`; schema documented for Phase 2 fixture development.

---

## Parsed data depth (v1)

| Option | Description | Selected |
|--------|-------------|----------|
| Tech-file-local unlocks + reverse edges | Parse unlocks from tech definitions + localisation; compute "leads to" edges; preserve raw weight_modifier blocks | ✓ |
| Full cross-file unlock resolution | Also parse buildings/components/ship sections for a complete unlocks graph | |
| Minimal flat parse | Names, costs, prereqs only; skip weight modifiers and flags | |

**Auto-selected:** Tech-file-local unlocks + reverse edges (recommended — matches DETL-01 v1 scope; full cross-referencing is UNLK-01/v2; minimal parse would force a pipeline re-run for v2 features).
**Notes:** Flags and structural weight modifiers are captured now (cheap in pipeline, needed by v2 FLAG-01/WGHT-01). Duplicate `modifier` keys preserved as arrays.

---

## Icon pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| WebP native-res via ImageMagick+sharp, early fidelity smoke-test | Convention-based icon resolution, swap variants exported, texconv fallback | ✓ |
| PNG-only conversion | Simpler, larger files | |
| Ship .dds handling to the browser | No conversion; decode client-side | |

**Auto-selected:** WebP with smoke-test and texconv fallback (recommended by stack research; DDS fidelity is a flagged unverified risk to be validated early).
**Notes:** Missing icons are warnings with placeholder, not failures.

---

## Pipeline ergonomics & failure policy

| Option | Description | Selected |
|--------|-------------|----------|
| Single npm script, configurable path, strict-fail structural / warn cosmetic, validation report | One command; config file + env/CLI override for game path; deterministic output | ✓ |
| Lenient pipeline | Never fail; emit whatever parsed | |
| Interactive CLI wizard | Prompt for paths/options each run | |

**Auto-selected:** Strict structural failure policy with single-command regeneration (recommended — automation-first pipeline is the direct countermeasure to the reference tool's staleness death; silent parse gaps would undermine the accuracy value prop).
**Notes:** Validation report includes per-area/tier counts and anomaly lists to make future patch updates auditable.

---

## Claude's Discretion

- Exact JSON field naming/nesting (content per D-01…D-09 is fixed; shape is flexible)
- Pipeline module structure and intermediate representations
- Test framework / corpus validation harness choice
- Placeholder icon design

## Deferred Ideas

- Deep unlocks browser (UNLK-01) — v2, already tracked
- Structured weight-modifier display (WGHT-01) — v2; pipeline preserves raw data now
