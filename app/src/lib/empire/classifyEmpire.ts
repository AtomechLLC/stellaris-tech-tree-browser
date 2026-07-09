/**
 * Saved Empire — glue between the app snapshot and the classifier.
 *
 * Gates now ship in `tech.json` (pipeline `gate` field, produced by
 * pipeline/src/gates.ts::normalizePotential). `buildTechLite` reads `t.gate`
 * straight from the snapshot — no side-loaded file, no fetch.
 */
import type { TechSnapshot } from "../../types/tech-snapshot";
import { buildEmpireState } from "./gates";
import { classifyAll, type TechLite, type Bucket, type ClassifyResult } from "./classify";
import type { SavedEmpire } from "./savLoad";

export type { Bucket };

/** Project the snapshot into the classifier's input (key + prereqs + gate). */
export function buildTechLite(snapshot: TechSnapshot): TechLite[] {
  return Object.values(snapshot.techs).map((t) => ({
    key: t.key,
    prerequisites: t.prerequisites ?? [],
    gate: t.gate ?? null,
  }));
}

export function classifyEmpire(techLite: TechLite[], empire: SavedEmpire): ClassifyResult {
  return classifyAll(techLite, buildEmpireState(empire));
}
