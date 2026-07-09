/**
 * Spike 003 runner: validate the four-bucket classification across all player
 * empires, then emit a self-contained demo-data.json for index.html.
 *
 * Run: pipeline/node_modules/.bin/tsx .planning/spikes/003-classify-demo/build-demo.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildEmpireState, type GateNode } from "../002-potential-gates/gates.ts";
import { classifyAll, type TechLite } from "./classify.ts";

const BASE = "C:/Projects/Stellaris/tech";
const TECH_JSON = `${BASE}/pipeline/data/v4.5.0/tech.json`;
const GATES_JSON = `${BASE}/.planning/spikes/002-potential-gates/tech-gates.json`;
const EMPIRES_JSON = `${BASE}/.planning/spikes/001-sav-extract/empires.json`;
const OUT = `${BASE}/.planning/spikes/003-classify-demo/demo-data.json`;

function main() {
  const snap = JSON.parse(readFileSync(TECH_JSON, "utf8"));
  const gates = JSON.parse(readFileSync(GATES_JSON, "utf8")) as Record<
    string,
    { prerequisites: string[]; gate: GateNode | null }
  >;
  const empires = JSON.parse(readFileSync(EMPIRES_JSON, "utf8")) as any[];

  // merge display fields (tech.json) + gate (tech-gates.json)
  const techs = Object.values<any>(snap.techs).map((t) => ({
    key: t.key,
    name: t.name,
    area: t.area,
    tier: t.tier,
    category: t.category?.[0] ?? null,
    prerequisites: t.prerequisites ?? [],
    gate: gates[t.key]?.gate ?? null,
  }));
  const techLite: TechLite[] = techs.map((t) => ({
    key: t.key,
    prerequisites: t.prerequisites,
    gate: t.gate,
  }));

  // --- server-side validation across all players ---
  console.log("[003] === four-bucket classification per player empire ===");
  console.log("empire                        researched  available  reachable  never   falseNever");
  const players = empires.filter((e) => e.playerName);
  let totalFalseNever = 0;
  for (const e of players) {
    const state = buildEmpireState(e);
    const r = classifyAll(techLite, state);
    totalFalseNever += r.falseNeverResearched.length;
    console.log(
      `${e.name.padEnd(28)}  ${String(r.counts.researched).padStart(9)}  ${String(r.counts.available).padStart(
        8,
      )}  ${String(r.counts.reachable).padStart(8)}  ${String(r.counts.never).padStart(5)}  ${String(
        r.falseNeverResearched.length,
      ).padStart(9)}${r.falseNeverResearched.length ? " ← " + r.falseNeverResearched.slice(0, 5).join(",") : ""}`,
    );
  }
  console.log(
    `\n[003] VALIDATION: total researched-but-classified-never = ${totalFalseNever} (must be 0 — any >0 is a gate false positive)`,
  );

  // --- emit demo data ---
  const demoEmpires = empires.map((e) => ({
    id: e.id,
    name: e.name,
    playerName: e.playerName,
    authority: e.authority,
    ethics: e.ethics,
    civics: e.civics,
    origin: e.origin,
    researched: e.researched,
    researchedCount: e.researchedCount,
  }));
  writeFileSync(OUT, JSON.stringify({ techs, empires: demoEmpires }, null, 0), "utf8");
  const sizeMb = (readFileSync(OUT).length / 1024 / 1024).toFixed(2);
  console.log(`[003] wrote demo-data.json (${techs.length} techs, ${demoEmpires.length} empires, ${sizeMb} MB)`);
}

main();
