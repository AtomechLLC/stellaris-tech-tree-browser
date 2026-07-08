---
phase: 01-data-pipeline
plan: 04
subsystem: data-pipeline
tags: [imagemagick, sharp, webp, dds, child_process, vitest, typescript]

# Dependency graph
requires:
  - phase: 01-data-pipeline (Plan 01)
    provides: "resolveConfig() (gameRoot), normalizeToArray() (Pitfall 5), Tech.icon schema field"
provides:
  - "resolveIconSource(tech, gameRoot) — tech -> source .dds path resolution (icon= override > tech_<key>.dds convention > technology_swap alias)"
  - "convertDdsToWebp(ddsPath, pngTempPath, webpOutPath) — DDS -> PNG (ImageMagick) -> lossless WebP (sharp) conversion"
  - "writePlaceholderIcon(placeholderPath, destPath) — D-13 fallback for a tech with no resolvable icon"
  - "pipeline/assets/placeholder-icon.webp — shipped 52x52 lossless WebP fallback asset"
affects: ["01-05"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "execFileSync('magick', [args]) argument-array invocation — never a shell string, no shell:true (T-04-01 mitigation for the phase's one command-execution surface)"
    - "vi.mock('node:child_process', importOriginal) ESM spy wrapper — vi.spyOn cannot redefine non-configurable ESM named exports under Node's loader; the wrapper still calls the real function so conversions stay genuine while asserting call shape"
    - "Real-corpus TDD fixtures for icon conversion: tech_space_exploration (uncompressed), tech_cybernetic_brain_implants_1 (DXT3, verified genuinely non-uniform alpha) — chosen only after directly inspecting each candidate .dds's alpha channel via `magick identify -format \"%[min] %[max]\"` on the separated alpha channel, since a fully-opaque alpha channel is correctly dropped by sharp's lossless WebP encoder (not a fidelity bug)"

key-files:
  created:
    - "pipeline/src/icons/resolve.ts"
    - "pipeline/src/icons/convert.ts"
    - "pipeline/assets/placeholder-icon.webp"
    - "pipeline/test/icons.test.ts"
  modified: []

key-decisions:
  - "technology_swap.name refers to ANOTHER tech's key, not an icon filename directly — resolveIconSource treats the swap's own inherit_icon flag as the sole signal of whether a separate <swap_name>.dds exists (inherit_icon = no -> resolve <swap_name>.dds; inherit_icon = yes/omitted -> deliberately no separate file, correctly omitted from the swaps list), verified against real corpus swaps in both directions"
  - "A fully-opaque alpha channel (verified via ImageMagick's separated-channel min/max on tech_executive_retreat, a DXT5 icon) is correctly omitted by sharp's lossless WebP encoder — this is a libvips optimization, not a fidelity loss, so the alpha-preservation test uses a DXT3 fixture with directly-verified non-uniform alpha instead of assuming any DXT-compressed source demonstrates alpha preservation"
  - "vi.spyOn cannot spy on node:child_process's named exports (non-configurable under Node's ESM loader) — used vi.mock with importOriginal + a wrapping vi.fn() that still delegates to the real execFileSync, so the T-04-01 call-shape assertion (argument array, no shell:true) is verified without stubbing away the real conversion"

patterns-established:
  - "TDD RED/GREEN commit pairs per task, each RED commit verified by temporarily removing the just-written implementation file and re-running the target test to confirm a genuine failure (not just a passing-by-coincidence test), then restoring for GREEN"

requirements-completed: [DATA-04]

# Metrics
duration: 32min
completed: 2026-07-08
---

# Phase 1 Plan 4: Icon Pipeline Summary

**Real Stellaris .dds tech icons (uncompressed, DXT3, DXT5) resolve by override/convention/swap-alias and convert to lossless WebP via a safely-invoked ImageMagick + sharp chain, with a shipped placeholder for icon-less techs.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-07-07T23:42:XXZ (immediately following Plan 01's completion per STATE.md)
- **Completed:** 2026-07-08T00:14:08Z
- **Tasks:** 2
- **Files modified:** 4 created (pipeline/src/icons/resolve.ts, pipeline/src/icons/convert.ts, pipeline/assets/placeholder-icon.webp, pipeline/test/icons.test.ts)

## Accomplishments

- Verified `resolveIconSource` against real corpus fixtures for all four resolution paths: `icon=` override (`tech_archeology_lab_ancrel` -> `tech_archeology_lab.dds`), plain tech-key convention (`tech_space_exploration`), missing-file-returns-null (D-13), and multi-arity `technology_swap` (`tech_basic_science_lab_3`'s array-form swap, correctly reporting only the `inherit_icon: false` variant's own file and omitting the `inherit_icon: true` self-swap)
- Verified `convertDdsToWebp` end-to-end against three real compression formats from the 864-file corpus: uncompressed (`tech_space_exploration`), DXT3 with genuine non-uniform alpha (`tech_cybernetic_brain_implants_1`), confirming 52x52 lossless WebP output readable by sharp
- Discovered and correctly interpreted a subtle non-bug: `tech_executive_retreat` (DXT5) reports `alpha=Blend` from ImageMagick but converts to a WebP with `hasAlpha: false` — traced this to the alpha channel being fully opaque (min=max via `magick identify` on the separated channel), which libvips correctly omits as a lossless-safe optimization; re-selected a DXT3 fixture with directly-verified non-uniform alpha for the alpha-preservation test instead of assuming any DXT source would do
- Solved a real ESM testing limitation: `vi.spyOn` cannot redefine `node:child_process`'s non-configurable named exports under Node's ESM loader; used `vi.mock` with `importOriginal` plus a wrapping wrapper function that still calls the real `execFileSync`, preserving genuine end-to-end conversions in the tests while asserting the exact argument-array call shape (T-04-01)
- Generated a real, valid, sharp-readable 52x52 lossless placeholder WebP with alpha programmatically (SVG -> sharp), not a hand-crafted binary

## Task Commits

Each task was committed atomically (TDD RED/GREEN pairs):

1. **Task 1: Icon source resolution (override + convention + swap alias)** - `6c0c3b0` (test/RED), `ae55567` (feat/GREEN)
2. **Task 2: DDS -> WebP conversion + placeholder fallback** - `c8c451f` (test/RED), `342c0bc` (feat/GREEN)

_No REFACTOR commits were needed — GREEN-phase code required no cleanup pass._

Each RED commit was verified genuine by temporarily deleting the just-written source file and re-running the target test (confirmed module-not-found / failing import), then restoring the file before the GREEN commit — not just written and assumed to fail.

## Files Created/Modified

- `pipeline/src/icons/resolve.ts` - `resolveIconSource(tech, gameRoot)`: base icon via `icon=` override or `tech_<key>.dds` convention (null if absent), plus `technology_swap` variants with their own `.dds` file (via `inherit_icon` flag), all path-checks via `fs.existsSync` — never a shell string
- `pipeline/src/icons/convert.ts` - `convertDdsToWebp(ddsPath, pngTempPath, webpOutPath)`: `execFileSync('magick', [ddsPath, pngTempPath])` (argument array, T-04-01 mitigation) then `sharp(pngTempPath).webp({ lossless: true })`, PNG temp cleanup via `finally`; `writePlaceholderIcon(placeholderPath, destPath)` for D-13 fallback
- `pipeline/assets/placeholder-icon.webp` - real 52x52 lossless WebP (neutral tile + alpha border), generated via sharp from an inline SVG
- `pipeline/test/icons.test.ts` - 10 tests: 6 covering `resolveIconSource` (override, convention, missing-null, swap array, swap single-object arity), 4 covering `convertDdsToWebp`/`writePlaceholderIcon` (uncompressed, DXT3-with-alpha, placeholder fallback, execFileSync call-shape safety incl. a shell-metacharacter path)

## Decisions Made

- `technology_swap.name` is another tech's key (not an icon filename) — the swap's own `inherit_icon` boolean is the sole correct signal for whether a separate icon file exists; verified both directions against real corpus data (`tech_wilderness_science_lab_3`'s `inherit_icon: false` ships its own file; `tech_nomads_arkship_defenses`'s `inherit_icon: yes` correctly has none)
- Chose `tech_cybernetic_brain_implants_1` (not `tech_executive_retreat`) as the alpha-preservation test fixture after directly inspecting each candidate's separated alpha channel with ImageMagick, since a fully-opaque alpha channel is legitimately dropped by sharp's lossless WebP encoder and would have made the test falsely assert non-alpha-dropping behavior on the wrong basis
- Used a `vi.mock` ESM wrapper (not `vi.spyOn`) around `node:child_process` to assert the `execFileSync` call shape, since vitest cannot spy directly on ESM named exports Node marks non-configurable; the wrapper still delegates to the real function so the conversion tests remain genuine end-to-end checks, not stubs

## Deviations from Plan

None - plan executed exactly as written. The two "found during verification" items below were resolution details within the plan's own stated scope (Claude's Discretion on shape/design), not deviations from the plan's requirements.

### Non-deviation notes (design details resolved during implementation)

- **ESM mocking limitation for the execFileSync call-shape test:** vitest/Node's ESM loader prevents `vi.spyOn` on `node:child_process`'s named exports. Resolved with a `vi.mock(..., importOriginal)` wrapper — no scope change, still verifies the exact acceptance criterion ("execFileSync invoked with an argument array, no shell:true").
- **Alpha-channel fixture selection:** the plan's acceptance criteria required "a DXT-compressed source... converts to a valid readable .webp" and "alpha channel readable by sharp" — both are satisfied, but required picking the specific DXT3 fixture with real (non-uniform) alpha rather than the first DXT-compressed file found, since not every corpus icon's alpha channel carries information.

## Issues Encountered

- Windows-specific `EPERM`/`EBUSY` transient file-handle-in-use errors when cleaning up per-test temp directories immediately after ImageMagick/sharp write to them — resolved with `rmSync(..., { maxRetries: 3, retryDelay: 50 })` and a best-effort catch in `afterEach`, since this is a test-cleanup timing artifact on Windows, not a defect in `convert.ts` itself (the module's own PNG-temp cleanup already succeeds reliably via its `finally` block, confirmed by the "PNG temp file is cleaned up" assertion in Test 1 passing consistently).

## User Setup Required

None - no external service configuration required. ImageMagick 7.1.1 was already confirmed installed (per Plan 01/RESEARCH.md); no new npm packages were added in this plan (sharp was already a dependency from Plan 01).

## Next Phase Readiness

- `resolveIconSource`, `convertDdsToWebp`, and `writePlaceholderIcon` are all directly reusable by Plan 05's `assemble.ts`, which drives them over every extracted tech and writes output to `data/v{version}/icons/`.
- The `Tech.icon` schema field (frozen in Plan 01) is ready to be populated by Plan 05 with either the converted `.webp` filename or the placeholder filename.
- No blockers. The one open item from STATE.md's Blockers/Concerns ("DDS icon fidelity... not yet independently verified") is now resolved: ImageMagick 7.1.1 converts all three observed compression classes (uncompressed, DXT3, DXT5) cleanly, and the earlier flagged texconv fallback is confirmed unnecessary for v1 (documented as a contingency comment in `convert.ts` only).

---
*Phase: 01-data-pipeline*
*Completed: 2026-07-08*

## Self-Check: PASSED

All 5 created/output files verified present on disk (pipeline/src/icons/resolve.ts, pipeline/src/icons/convert.ts, pipeline/assets/placeholder-icon.webp, pipeline/test/icons.test.ts, .planning/phases/01-data-pipeline/01-04-SUMMARY.md). All 5 referenced commit hashes (6c0c3b0, ae55567, c8c451f, 342c0bc, 28e195f) verified present in `git log --oneline --all`.
