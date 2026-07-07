/**
 * Prerequisite DAG validation + reverse-edge computation (D-05 component b,
 * D-16 strict-fail).
 *
 * Validates the tech corpus's `prerequisites` edges form a real DAG: every
 * prerequisite must resolve to a real tech key (a dangling reference is a
 * structural error per D-16 — fails loud rather than silently dropping the
 * edge), and the graph must be acyclic (a cycle is also a structural error).
 * Computes reverse edges ("leads to": for each tech, which techs list it as a
 * prerequisite) — this is the `unlocks.leadsTo` component of D-05; the OTHER
 * component (`unlocks.grants`, what the tech itself grants) comes from Task
 * 1's captured `unlockContentRaw`, joined with localisation in Plan 05. This
 * module produces ONLY the leadsTo half.
 *
 * No building/component cross-referencing here — that is UNLK-01 (v2).
 */

export interface GraphNode {
  leadsTo: string[];
}

interface MinimalTech {
  key: string;
  prerequisites: string[];
}

/**
 * Builds the prerequisite adjacency structure, validates it (dangling refs,
 * cycles), and returns a Map of tech key -> computed reverse edges
 * (`leadsTo`), sorted deterministically (D-03 idempotency).
 *
 * Throws:
 *   - "dangling prerequisite" error naming the tech and the missing key, if
 *     any `prerequisites` entry doesn't resolve to a real tech in the set.
 *   - "cycle" error naming the offending cycle, if the prerequisite graph is
 *     not acyclic.
 */
export function buildAndValidateGraph(techs: MinimalTech[]): Map<string, GraphNode> {
  const keySet = new Set(techs.map((t) => t.key));

  // Validate: every prerequisite must resolve to a real tech key.
  for (const tech of techs) {
    for (const prereq of tech.prerequisites ?? []) {
      if (!keySet.has(prereq)) {
        throw new Error(
          `buildAndValidateGraph: dangling prerequisite — tech "${tech.key}" references unknown prerequisite "${prereq}"`,
        );
      }
    }
  }

  // Validate: the graph must be acyclic. DFS with a recursion-stack marker.
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const tech of techs) color.set(tech.key, WHITE);

  const adjacency = new Map<string, string[]>();
  for (const tech of techs) adjacency.set(tech.key, tech.prerequisites ?? []);

  function visit(key: string, stack: string[]): void {
    color.set(key, GRAY);
    stack.push(key);

    for (const prereq of adjacency.get(key) ?? []) {
      const state = color.get(prereq);
      if (state === GRAY) {
        const cycleStart = stack.indexOf(prereq);
        const cyclePath = [...stack.slice(cycleStart), prereq].join(" -> ");
        throw new Error(`buildAndValidateGraph: cycle detected in prerequisite graph: ${cyclePath}`);
      }
      if (state === WHITE) {
        visit(prereq, stack);
      }
    }

    stack.pop();
    color.set(key, BLACK);
  }

  for (const tech of techs) {
    if (color.get(tech.key) === WHITE) {
      visit(tech.key, []);
    }
  }

  // Compute reverse edges (leadsTo): for each tech, which techs list it as a prerequisite.
  const leadsTo = new Map<string, string[]>();
  for (const tech of techs) leadsTo.set(tech.key, []);

  for (const tech of techs) {
    for (const prereq of tech.prerequisites ?? []) {
      leadsTo.get(prereq)!.push(tech.key);
    }
  }

  const graph = new Map<string, GraphNode>();
  for (const [key, dependents] of leadsTo) {
    graph.set(key, { leadsTo: [...dependents].sort() });
  }

  return graph;
}
