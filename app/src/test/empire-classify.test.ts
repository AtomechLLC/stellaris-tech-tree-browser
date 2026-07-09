import { describe, it, expect } from "vitest";
import { buildEmpireState, classifyGate, type GateNode } from "../lib/empire/gates";
import { classifyAll, type TechLite } from "../lib/empire/classify";

/**
 * Saved Empire classification — ports the spike-002 gate assertions and the
 * spike-003 four-bucket invariant into the app suite. Gates here are written as
 * the pipeline emits them (pipeline/src/gates.ts::normalizePotential output).
 */

// ── empire fixtures ────────────────────────────────────────────────────────
const machine = buildEmpireState({
  authority: "auth_machine_intelligence",
  ethics: ["ethic_gestalt_consciousness"],
  civics: [],
  origin: "origin_machine_o",
  researched: [],
});
const regular = buildEmpireState({
  authority: "auth_democratic",
  ethics: ["ethic_xenophile"],
  civics: [],
  origin: "origin_x",
  researched: [],
});
const indivMachine = buildEmpireState({
  authority: "auth_oligarchic",
  ethics: ["ethic_materialist"],
  civics: ["civic_individual_machine_replication"],
  origin: "origin_void_machines",
  researched: [],
});

// ── gate fixtures (real shapes from the corpus) ────────────────────────────
const G: Record<string, GateNode> = {
  interplanetaryCommerce: { op: "leaf", trigger: "is_gestalt", value: false, static: true },
  collective: { op: "leaf", trigger: "is_hive_empire", value: true, static: true },
  roboticWorkers: {
    op: "nor",
    children: [
      { op: "leaf", trigger: "has_ethic", value: "ethic_gestalt_consciousness", static: true },
      { op: "leaf", trigger: "is_individual_machine", value: true, static: false },
    ],
  },
  psionicTheory: {
    op: "and",
    children: [
      {
        op: "or",
        children: [
          { op: "leaf", trigger: "has_shroud_dlc", value: true, static: true },
          { op: "not", children: [{ op: "leaf", trigger: "has_ethic", value: "ethic_gestalt_consciousness", static: true }] },
        ],
      },
      { op: "not", children: [{ op: "leaf", trigger: "has_origin", value: "origin_mindwardens", static: true }] },
    ],
  },
};

describe("buildEmpireState", () => {
  it("derives gestalt/hive/machine/individual-machine/megacorp from authority + ethics + civics", () => {
    expect(machine.isMachine).toBe(true);
    expect(machine.isGestalt).toBe(true);
    expect(machine.isHive).toBe(false);
    expect(machine.isIndividualMachine).toBe(true);

    const hive = buildEmpireState({ authority: "auth_hive_mind", ethics: ["ethic_gestalt_consciousness"], civics: [], origin: null, researched: [] });
    expect(hive.isHive).toBe(true);
    expect(hive.isGestalt).toBe(true);

    expect(indivMachine.isGestalt).toBe(false);
    expect(indivMachine.isIndividualMachine).toBe(true);
    expect(indivMachine.isMachine).toBe(false);

    const corp = buildEmpireState({ authority: "auth_corporate", ethics: ["ethic_xenophile"], civics: [], origin: null, researched: [] });
    expect(corp.isMegacorp).toBe(true);
    expect(corp.isGestalt).toBe(false);
  });
});

describe("classifyGate — 'never' via satisfiability (spike 002)", () => {
  it("is_gestalt=no → never for a gestalt machine, open for a regular empire", () => {
    expect(classifyGate(G.interplanetaryCommerce, machine).never).toBe(true);
    expect(classifyGate(G.interplanetaryCommerce, regular).never).toBe(false);
  });

  it("is_hive_empire=true → never for every non-hive (regular AND machine)", () => {
    expect(classifyGate(G.collective, regular).never).toBe(true);
    expect(classifyGate(G.collective, machine).never).toBe(true);
  });

  it("NOR{gestalt, individual_machine} → never for gestalt + individual-machine (monotonic pin), open for a plain regular", () => {
    expect(classifyGate(G.roboticWorkers, machine).never).toBe(true);
    expect(classifyGate(G.roboticWorkers, indivMachine).never).toBe(true);
    expect(classifyGate(G.roboticWorkers, regular).never).toBe(false);
  });

  it("OR short-circuits via has_shroud_dlc (owned) → open even for a gestalt", () => {
    expect(classifyGate(G.psionicTheory, machine).never).toBe(false);
  });

  it("no gate → open for everyone", () => {
    expect(classifyGate(null, machine).never).toBe(false);
    expect(classifyGate(null, regular).never).toBe(false);
  });
});

describe("classifyAll — four buckets + integrity invariant (spike 003)", () => {
  const techs: TechLite[] = [
    { key: "root", prerequisites: [], gate: null },
    { key: "mid", prerequisites: ["root"], gate: G.interplanetaryCommerce }, // is_gestalt=no
    { key: "leaf", prerequisites: ["mid"], gate: null },
    { key: "hiveonly", prerequisites: [], gate: G.collective }, // is_hive_empire=true
  ];

  it("regular empire with root researched → researched / available / reachable / never", () => {
    const state = buildEmpireState({ authority: "auth_democratic", ethics: [], civics: [], origin: "o", researched: ["root"] });
    const r = classifyAll(techs, state);
    expect(r.buckets.get("root")).toBe("researched");
    expect(r.buckets.get("mid")).toBe("available"); // prereq researched, gate passes (not gestalt)
    expect(r.buckets.get("leaf")).toBe("reachable"); // prereq mid not yet researched
    expect(r.buckets.get("hiveonly")).toBe("never"); // is_hive gate, regular is not a hive
    expect(r.counts).toEqual({ researched: 1, available: 1, reachable: 1, never: 1 });
    expect(r.falseNeverResearched).toHaveLength(0);
  });

  it("a downstream tech whose prereq chain roots in a 'never' tech is itself never", () => {
    // A gestalt empire: `mid` (is_gestalt=no) is never → `leaf` (prereq mid) is never too.
    const state = buildEmpireState({ authority: "auth_machine_intelligence", ethics: ["ethic_gestalt_consciousness"], civics: [], origin: "o", researched: ["root"] });
    const r = classifyAll(techs, state);
    expect(r.buckets.get("mid")).toBe("never");
    expect(r.buckets.get("leaf")).toBe("never");
  });

  it("integrity guard: a researched tech is never bucketed 'never', but IS flagged as a gate false-positive", () => {
    // Artificial: a gestalt that somehow researched the gestalt-blocked `mid`.
    const state = buildEmpireState({ authority: "auth_machine_intelligence", ethics: ["ethic_gestalt_consciousness"], civics: [], origin: "o", researched: ["mid"] });
    const r = classifyAll(techs, state);
    expect(r.buckets.get("mid")).toBe("researched"); // researched wins over gate-never
    expect(r.falseNeverResearched).toContain("mid"); // …and the inconsistency is surfaced
  });
});
