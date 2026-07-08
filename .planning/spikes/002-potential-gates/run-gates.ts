/**
 * Spike 002 runner: build the gate-annotated dataset and validate the evaluator
 * against known empire/tech cases.
 *
 * Run: pipeline/node_modules/.bin/tsx .planning/spikes/002-potential-gates/run-gates.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadScriptedVariables } from "../../../pipeline/src/parser/scripted-variables.ts";
import { extractAllTechs } from "../../../pipeline/src/parser/tech-extractor.ts";
import {
  normalizePotential,
  buildEmpireState,
  classifyGate,
  collectLeafTriggers,
  type GateNode,
} from "./gates.ts";

const GAME = "Z:/SteamLibrary/steamapps/common/Stellaris";
const EMPIRES = "C:/Projects/Stellaris/tech/.planning/spikes/001-sav-extract/empires.json";
const OUT = "C:/Projects/Stellaris/tech/.planning/spikes/002-potential-gates/tech-gates.json";

async function main() {
  const varMap = await loadScriptedVariables(GAME);
  const techs = await extractAllTechs(GAME, varMap);

  // 1. normalize every tech's potential → gate tree; emit dataset
  const gateByKey = new Map<string, GateNode | null>();
  const dataset: Record<string, { prerequisites: string[]; gate: GateNode | null }> = {};
  let gated = 0;
  const allTriggers = new Set<string>();
  for (const t of techs) {
    const gate = normalizePotential((t as any).potentialRaw);
    if (gate) {
      gated++;
      collectLeafTriggers(gate, allTriggers);
    }
    gateByKey.set(t.key, gate);
    dataset[t.key] = { prerequisites: t.prerequisites, gate };
  }
  writeFileSync(OUT, JSON.stringify(dataset, null, 1), "utf8");
  console.log(`[002] ${techs.length} techs, ${gated} with a gate → wrote tech-gates.json`);
  console.log(`[002] distinct triggers in normalized gates: ${allTriggers.size}`);

  // 2. build empire states
  const empires = JSON.parse(readFileSync(EMPIRES, "utf8")) as any[];
  const byName = new Map(empires.map((e) => [e.name, e]));
  const players = empires.filter((e) => e.playerName);

  // 3. never-count per player empire
  console.log(`\n[002] === "never reachable" tech count per empire (gate-only, prereqs excluded) ===`);
  console.log("empire                        never  passesNow-not-researched");
  for (const e of players) {
    const s = buildEmpireState(e);
    let never = 0;
    let openNotResearched = 0;
    const researched = new Set(e.researched as string[]);
    for (const t of techs) {
      const v = classifyGate(gateByKey.get(t.key) ?? null, s);
      if (v.never) never++;
      else if (!researched.has(t.key) && v.passesNow) openNotResearched++;
    }
    console.log(`${e.name.padEnd(28)}  ${String(never).padStart(5)}  ${String(openNotResearched).padStart(5)}`);
  }

  // 4. assertions on known cases
  console.log(`\n[002] === known-case assertions ===`);
  const cases: Array<[string, string, "never" | "open", string]> = [
    ["Nexan Collective", "tech_interplanetary_commerce", "never", "machine/gestalt blocked by is_gestalt=no"],
    ["Rootsong", "tech_interplanetary_commerce", "open", "regular empire → allowed"],
    ["Nexan Collective", "tech_collective_production_methods", "never", "not a hive → is_hive_empire=true fails"],
    ["Rootsong", "tech_collective_production_methods", "never", "not a hive → blocked"],
    ["Nexan Collective", "tech_robotic_workers", "never", "gestalt → NOR{gestalt,indiv_machine} unsat"],
    ["CUBE-CUBE-CUBE-CUBE", "tech_robotic_workers", "never", "individual-machine → NOR unsat"],
    ["Rootsong", "tech_robotic_workers", "open", "regular non-machine → allowed"],
    ["Nexan Collective", "tech_psionic_theory", "open", "OR short-circuits via has_shroud_dlc (owned)"],
  ];
  let pass = 0;
  for (const [empName, techKey, expect, why] of cases) {
    const e = byName.get(empName);
    const v = classifyGate(gateByKey.get(techKey) ?? null, buildEmpireState(e));
    const got = v.never ? "never" : "open";
    const ok = got === expect;
    if (ok) pass++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${empName.padEnd(20)} ${techKey.padEnd(34)} expected=${expect} got=${got}  (${why})`);
  }
  console.log(`\n[002] assertions: ${pass}/${cases.length} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
