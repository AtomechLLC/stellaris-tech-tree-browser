/**
 * Spike 003 — classify: the four-bucket join.
 *
 * Combines empire researched set (001) + gate verdicts (002) + prerequisite
 * reachability into: researched / available-now / reachable-later / never.
 *
 *   never          = gate unsatisfiable OR prereq chain roots in a never tech
 *   researched     = in the empire's tech_status
 *   available-now  = not researched, gate admits now, ALL direct prereqs researched
 *   reachable-later= not researched, not blocked, but prereqs not all met yet
 */
import { classifyGate, type GateNode, type EmpireState } from "../002-potential-gates/gates.ts";

export type Bucket = "researched" | "available" | "reachable" | "never";

export interface TechLite {
  key: string;
  prerequisites: string[];
  gate: GateNode | null;
}

export interface ClassifyResult {
  buckets: Map<string, Bucket>;
  counts: Record<Bucket, number>;
  /** researched techs our gate model wrongly calls "never" — must be 0. */
  falseNeverResearched: string[];
}

export function classifyAll(techs: TechLite[], state: EmpireState): ClassifyResult {
  const byKey = new Map(techs.map((t) => [t.key, t]));
  const researched = state.researched;

  // gate-never set
  const gateNever = new Set<string>();
  for (const t of techs) if (classifyGate(t.gate, state).never) gateNever.add(t.key);

  // reachability fixpoint (memoized DFS; DAG is acyclic per pipeline validation)
  const memo = new Map<string, boolean>();
  function reachable(key: string, stack: Set<string>): boolean {
    if (memo.has(key)) return memo.get(key)!;
    if (gateNever.has(key)) {
      memo.set(key, false);
      return false;
    }
    if (stack.has(key)) return true; // cycle guard (shouldn't happen)
    stack.add(key);
    const t = byKey.get(key);
    const ok = (t?.prerequisites ?? []).every((p) => (byKey.has(p) ? reachable(p, stack) : true));
    stack.delete(key);
    memo.set(key, ok);
    return ok;
  }

  const buckets = new Map<string, Bucket>();
  const counts: Record<Bucket, number> = { researched: 0, available: 0, reachable: 0, never: 0 };
  const falseNeverResearched: string[] = [];

  for (const t of techs) {
    let b: Bucket;
    const isResearched = researched.has(t.key);
    const blocked = gateNever.has(t.key) || !reachable(t.key, new Set());
    if (isResearched) {
      b = "researched";
      if (gateNever.has(t.key)) falseNeverResearched.push(t.key); // validation signal
    } else if (blocked) {
      b = "never";
    } else {
      const prereqsMet = t.prerequisites.every((p) => researched.has(p));
      const admitsNow = classifyGate(t.gate, state).passesNow;
      b = prereqsMet && admitsNow ? "available" : "reachable";
    }
    buckets.set(t.key, b);
    counts[b]++;
  }

  return { buckets, counts, falseNeverResearched };
}
