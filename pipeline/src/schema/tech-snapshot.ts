/**
 * TechSnapshotSchema — the hard pipeline/frontend contract (D-04).
 *
 * This module is the frozen boundary between the build-time data pipeline
 * (this `pipeline/` package) and Phase 2's frontend consumer. Downstream
 * plans (02-05) widen the DATA these fields carry (all 33 files, real
 * localisation, real icons, DLC, full unlocks text) but must never need a
 * BREAKING revision to this schema's shape.
 *
 * D-05: `unlocks` intentionally separates two distinct components from the
 * start, both REQUIRED (non-optional) arrays:
 *   - `grants`: what the tech itself grants (human-readable text derived
 *     from its own modifier/feature_flags/prereqfor_desc/gateway content
 *     joined with localisation). Filled by Plan 05; may be `[]` at skeleton
 *     scope, but the field must always exist.
 *   - `leadsTo`: the reverse-prerequisite edges ("this tech leads to X") —
 *     computed by Plan 02's graph builder, filled by Plan 05; may be `[]` at
 *     skeleton scope.
 * Freezing both sub-fields now means no breaking schema revision is needed
 * once Plan 02/05 populate them with real data.
 */
import { z } from "zod";

const AreaEnum = z.enum(["physics", "society", "engineering"]);

const UnlocksSchema = z.object({
  grants: z.array(z.string()),
  leadsTo: z.array(z.string()),
});

const FlagsSchema = z.object({
  isRare: z.boolean(),
  isDangerous: z.boolean(),
  isRepeatable: z.boolean(),
  isStarting: z.boolean(),
  /** Pre-FTL "insight" tech (First Contact / observation research); groups the
   *  [Insight] explore bucket. Source: `is_insight = yes` in the game files. */
  isInsight: z.boolean(),
});

export const TechSchema = z.object({
  key: z.string(),
  area: AreaEnum,
  category: z.array(z.string()).default([]),
  tier: z.number(),
  /** Resolved concrete cost (after @scripted_variable resolution). */
  cost: z.number(),
  /**
   * Preserves the defensive block-form `cost = { factor = ... }` shape when
   * present (Open Question 1 / Assumption A3) — unobserved in the sampled
   * corpus but documented as valid syntax; not yet populated at skeleton
   * scope.
   */
  costRaw: z.unknown().optional(),
  /** Base flat weight (D-06); resolved from @scripted_variable if present. */
  weight: z.number(),
  /**
   * Raw weight_modifier block(s) preserved structurally (D-06) — duplicate
   * `modifier` entries must be preserved as arrays, never collapsed. Filled
   * by a later plan; not yet populated at skeleton scope.
   */
  weightModifierRaw: z.unknown().optional(),
  prerequisites: z.array(z.string()).default([]),
  unlocks: UnlocksSchema,
  /** DLC display name, or null if base-game. Filled by Plan 02 (D-08). */
  dlc: z.string().nullable().default(null),
  flags: FlagsSchema,
  /** Human-readable name; skeleton may use the key as a placeholder. */
  name: z.string(),
  /** Localised description; filled by Plan 03. */
  description: z.string().nullable().default(null),
  /** Web-ready icon path/reference; filled by Plan 04. */
  icon: z.string().nullable().default(null),
});

export const TechSnapshotSchema = z.object({
  meta: z.object({
    gameVersion: z.string(),
    generatedAt: z.string(),
    techCount: z.number(),
    areaCounts: z.record(z.string(), z.number()),
    tierCounts: z.record(z.string(), z.number()),
    sourceFiles: z.array(z.string()),
  }),
  /** Keyed by tech key; written sorted by key for deterministic output (D-03). */
  techs: z.record(z.string(), TechSchema),
});

export type TechSnapshot = z.infer<typeof TechSnapshotSchema>;
export type Tech = z.infer<typeof TechSchema>;
