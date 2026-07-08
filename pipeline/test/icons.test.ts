import { describe, it, expect } from "vitest";
import { resolveConfig } from "../src/config.js";
import { resolveIconSource } from "../src/icons/resolve.js";

const { gameRoot } = resolveConfig([]);

describe("icons: resolveIconSource", () => {
  it("Test 1: an explicit icon= override wins over the tech-key convention", () => {
    // Real corpus fixture: tech_archeology_lab_ancrel has `icon = "tech_archeology_lab"`,
    // a different tech's icon name (RESEARCH.md DATA-04 row).
    const tech = { key: "tech_archeology_lab_ancrel", icon: "tech_archeology_lab" };
    const resolved = resolveIconSource(tech, gameRoot);
    expect(resolved.base).not.toBeNull();
    expect(resolved.base).toMatch(/tech_archeology_lab\.dds$/);
  });

  it("Test 2: a plain tech with no icon field resolves via the tech_<key>.dds convention", () => {
    const tech = { key: "tech_space_exploration" };
    const resolved = resolveIconSource(tech, gameRoot);
    expect(resolved.base).not.toBeNull();
    expect(resolved.base).toMatch(/tech_space_exploration\.dds$/);
  });

  it("Test 3: a tech whose expected .dds does not exist on disk returns a null base, not a throw", () => {
    const tech = { key: "tech_this_key_does_not_exist_anywhere_xyz" };
    expect(() => resolveIconSource(tech, gameRoot)).not.toThrow();
    const resolved = resolveIconSource(tech, gameRoot);
    expect(resolved.base).toBeNull();
  });

  it("Test 4: technology_swap variants with their own .dds file are reported alongside the base icon", () => {
    // Real corpus fixture: tech_basic_science_lab_3 has a multi-arity (array)
    // technology_swap — first entry (tech_wilderness_science_lab_3) has
    // inherit_icon = no and ships its own .dds; second entry (itself,
    // inherit_icon = yes) has no separate file and must be omitted.
    const tech = {
      key: "tech_basic_science_lab_3",
      technology_swap: [
        { name: "tech_wilderness_science_lab_3", inherit_icon: false, inherit_effects: true },
        { name: "tech_basic_science_lab_3", inherit_icon: true, inherit_effects: true },
      ],
    };
    const resolved = resolveIconSource(tech, gameRoot);
    expect(resolved.base).not.toBeNull();
    expect(resolved.base).toMatch(/tech_basic_science_lab_3\.dds$/);
    expect(resolved.swaps).toHaveLength(1);
    expect(resolved.swaps[0].name).toBe("tech_wilderness_science_lab_3");
    expect(resolved.swaps[0].path).toMatch(/tech_wilderness_science_lab_3\.dds$/);
  });

  it("Test 4b: a single (non-array) technology_swap object is handled without crashing (Pitfall 5 arity)", () => {
    const tech = {
      key: "tech_terrestrial_sculpting",
      technology_swap: { name: "tech_terrestrial_sculpting_wilderness", inherit_icon: true, inherit_effects: false },
    };
    expect(() => resolveIconSource(tech, gameRoot)).not.toThrow();
  });
});
