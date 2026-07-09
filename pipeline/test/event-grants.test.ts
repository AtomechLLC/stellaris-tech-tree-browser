import { describe, it, expect } from "vitest";
import { collectGrants } from "../src/parser/event-grants.js";

/**
 * Unit coverage for the grant-detection core of the event/dig-site source
 * parser. Uses jomini-shaped in-memory objects (no game files) so the three
 * grant-effect forms, nesting, and jomini's duplicate-key arraying are all
 * pinned independently of the corpus integration tests.
 */
describe("collectGrants", () => {
  it("detects all three grant effect forms", () => {
    const out: { tech: string; mech: string }[] = [];
    collectGrants(
      {
        give_technology: { tech: "tech_a" },
        add_research_option: "tech_b",
        add_tech_progress: { tech: "tech_c", progress: 0.1 },
      },
      out,
    );
    expect(out).toEqual([
      { tech: "tech_a", mech: "give" },
      { tech: "tech_b", mech: "option" },
      { tech: "tech_c", mech: "progress" },
    ]);
  });

  it("finds grants nested inside immediate / if-limit effect blocks", () => {
    const out: { tech: string; mech: string }[] = [];
    collectGrants(
      {
        id: "ancrel.2",
        immediate: {
          if: { limit: { NOT: { has_technology: "tech_x" } }, add_research_option: "tech_x" },
        },
      },
      out,
    );
    expect(out).toEqual([{ tech: "tech_x", mech: "option" }]);
  });

  it("handles jomini duplicate-key arrays (multiple grants of the same key)", () => {
    const out: { tech: string; mech: string }[] = [];
    // Two `add_research_option` in one block → jomini arrays them.
    collectGrants({ add_research_option: ["tech_a", "tech_b"] }, out);
    // Two `give_technology` blocks → array of objects.
    collectGrants({ give_technology: [{ tech: "tech_c" }, { tech: "tech_d" }] }, out);
    expect(out.map((g) => g.tech)).toEqual(["tech_a", "tech_b", "tech_c", "tech_d"]);
  });

  it("does not treat the inner `tech`/`progress` scalars as separate grants", () => {
    const out: { tech: string; mech: string }[] = [];
    collectGrants({ add_tech_progress: { tech: "tech_only", progress: 0.5 } }, out);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ tech: "tech_only", mech: "progress" });
  });

  it("ignores unrelated effects and malformed grants", () => {
    const out: { tech: string; mech: string }[] = [];
    collectGrants(
      { set_country_flag: "foo", give_technology: { notatech: "bar" }, add_research_option: 42 },
      out,
    );
    expect(out).toEqual([]);
  });
});
