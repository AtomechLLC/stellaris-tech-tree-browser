import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TechSnapshot } from "../types/tech-snapshot";
import { layoutTree } from "../lib/tree/layoutTree";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CARD_W = 230;
const CARD_H = 92;

function loadRealSnapshot(): TechSnapshot {
  // Reads the real, full-scale copied snapshot from disk (D-08: benchmark
  // against the real 678-node graph, not a sample). `pretest` runs
  // copy-data first so this fixture exists before the test runs.
  const path = join(__dirname, "..", "..", "public", "data", "v4.5.0", "tech.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as TechSnapshot;
}

describe("smoke: full-scale tech-tree layout", () => {
  it("lays out all 678 techs into positioned nodes", async () => {
    const snapshot = loadRealSnapshot();
    const layout = await layoutTree(snapshot, CARD_W, CARD_H);

    expect(layout.nodes.length).toBe(678);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  }, 30_000);
});
