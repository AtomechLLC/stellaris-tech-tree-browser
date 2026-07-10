import { describe, it, expect } from "vitest";
import { diffSnapshots } from "../src/diff.js";

/** Snapshot diff: added/removed/changed detection over gameplay fields. */

function tech(key: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    key,
    name: key.replace(/^tech_/, ""),
    tier: 1,
    cost: 100,
    weight: 50,
    area: "physics",
    category: ["computing"],
    prerequisites: [],
    dlc: null,
    ...over,
  };
}

function snap(version: string, techs: ReturnType<typeof tech>[]) {
  return {
    meta: { gameVersion: version },
    techs: Object.fromEntries(techs.map((t) => [t.key, t])),
  } as Parameters<typeof diffSnapshots>[0];
}

describe("diffSnapshots", () => {
  it("detects added, removed and changed techs", () => {
    const from = snap("v4.4.6", [tech("tech_a"), tech("tech_gone")]);
    const to = snap("v4.5.0", [
      tech("tech_a", { cost: 200, tier: 2 }),
      tech("tech_new", { area: "society" }),
    ]);
    const d = diffSnapshots(from, to);
    expect(d.fromVersion).toBe("v4.4.6");
    expect(d.toVersion).toBe("v4.5.0");
    expect(d.added).toEqual([{ key: "tech_new", name: "new", tier: 1, area: "society" }]);
    expect(d.removed).toEqual([{ key: "tech_gone", name: "gone" }]);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].changes).toEqual([
      { field: "tier", from: 1, to: 2 },
      { field: "cost", from: 100, to: 200 },
    ]);
  });

  it("treats prerequisite changes order-insensitively", () => {
    const from = snap("a", [tech("tech_x", { prerequisites: ["p1", "p2"] })]);
    const same = snap("b", [tech("tech_x", { prerequisites: ["p2", "p1"] })]);
    expect(diffSnapshots(from, same).changed).toHaveLength(0);
    const diff = snap("b", [tech("tech_x", { prerequisites: ["p1", "p3"] })]);
    expect(diffSnapshots(from, diff).changed[0].changes).toEqual([
      { field: "prerequisites", from: "p1,p2", to: "p1,p3" },
    ]);
  });

  it("reports dlc reassignment with 'none' placeholders", () => {
    const from = snap("a", [tech("tech_x")]);
    const to = snap("b", [tech("tech_x", { dlc: "Utopia" })]);
    expect(diffSnapshots(from, to).changed[0].changes).toEqual([
      { field: "dlc", from: "none", to: "Utopia" },
    ]);
  });

  it("returns an empty diff for identical snapshots", () => {
    const s = snap("a", [tech("tech_x"), tech("tech_y")]);
    const d = diffSnapshots(s, snap("b", [tech("tech_x"), tech("tech_y")]));
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.changed).toHaveLength(0);
  });
});
