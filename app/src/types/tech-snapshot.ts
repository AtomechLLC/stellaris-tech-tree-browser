/**
 * App-side Tech/TechSnapshot schema (Zod) — the frontend's contract for the
 * generated `tech.json`.
 *
 * This is a SELF-CONTAINED copy of `pipeline/src/schema/tech-snapshot.ts`, kept
 * in the app so the app builds standalone. Originally the app re-exported the
 * types straight from the pipeline source (D-04, single source of truth), but
 * that made `tsc`/`vite` compile a pipeline file whose `import "zod"` resolves
 * against `pipeline/node_modules` — absent on a `cd app && npm ci` deploy, which
 * broke the production build. The app already vendors `zod` and validates the
 * snapshot at load, so owning the schema here removes the cross-package coupling.
 *
 * KEEP IN SYNC with the pipeline schema. The `verify:schema-parity` shape is the
 * same object; if the pipeline schema gains/loses a field, mirror it here.
 */
import { z } from "zod";

const AreaEnum = z.enum(["physics", "society", "engineering"]);

/**
 * Recursive `potential` gate tree (pipeline/src/gates.ts). A leaf is a single
 * trigger tagged static; combinators are AND/OR/NOR/NOT over children.
 */
export type GateNode =
  | { op: "leaf"; trigger: string; value: string | number | boolean; static: boolean }
  | { op: "and" | "or" | "nor" | "not"; children: GateNode[] };

const GateNodeSchema: z.ZodType<GateNode> = z.lazy(() =>
  z.union([
    z.object({
      op: z.literal("leaf"),
      trigger: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
      static: z.boolean(),
    }),
    z.object({
      op: z.enum(["and", "or", "nor", "not"]),
      children: z.array(GateNodeSchema),
    }),
  ]),
);

const UnlocksSchema = z.object({
  grants: z.array(z.string()),
  leadsTo: z.array(z.string()),
});

const FlagsSchema = z.object({
  isRare: z.boolean(),
  isDangerous: z.boolean(),
  isRepeatable: z.boolean(),
  isStarting: z.boolean(),
  isInsight: z.boolean(),
});

export const TechSchema = z.object({
  key: z.string(),
  area: AreaEnum,
  category: z.array(z.string()).default([]),
  tier: z.number(),
  cost: z.number(),
  costRaw: z.unknown().optional(),
  weight: z.number(),
  weightModifierRaw: z.unknown().optional(),
  prerequisites: z.array(z.string()).default([]),
  unlocks: UnlocksSchema,
  dlc: z.string().nullable().default(null),
  flags: FlagsSchema,
  name: z.string(),
  description: z.string().nullable().default(null),
  icon: z.string().nullable().default(null),
  gate: GateNodeSchema.nullable().default(null),
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
  techs: z.record(z.string(), TechSchema),
});

export type TechSnapshot = z.infer<typeof TechSnapshotSchema>;
export type Tech = z.infer<typeof TechSchema>;
