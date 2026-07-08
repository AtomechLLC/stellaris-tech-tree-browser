import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TechSnapshot } from "../types/tech-snapshot";
// RED (Task 1): buildGraph does not exist yet — this import fails to
// resolve, which is the intended failing state until Task 2 creates it.
import { buildGraph } from "../lib/graph/buildGraph";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadRealSnapshot(): TechSnapshot {
  // Reads the real, full-scale copied snapshot from disk (D-08: benchmark
  // against the real 678-node graph, not a sample). `pretest` runs
  // copy-data first so this fixture exists before the test runs.
  const path = join(__dirname, "..", "..", "public", "data", "v4.5.0", "tech.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as TechSnapshot;
}

describe("smoke: full-scale graph construction", () => {
  it("builds a directed graphology graph with all 678 nodes", () => {
    const snapshot = loadRealSnapshot();
    const graph = buildGraph(snapshot);

    expect(graph.order).toBe(678);
    expect(graph.type).toBe("directed");
  });
});
