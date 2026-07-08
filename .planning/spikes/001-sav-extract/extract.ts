/**
 * Spike 001 — sav-extract
 *
 * Question: given a Stellaris .sav (zip → `gamestate` Clausewitz text), can we
 * reliably pull out (a) the list of empires with human-readable names, (b) each
 * empire's set of researched techs, and (c) each empire's identity fields
 * (authority / ethics / civics / origin / species) that a later spike will
 * evaluate `potential` gates against?
 *
 * Server-side (Node) baseline. Parse strategy here is the SIMPLEST possible:
 * full jomini parse of the entire 72 MB gamestate, then walk the object tree.
 * We measure wall-time + peak heap so spike 004 (browser) knows what it's up
 * against. Unzip is proven trivially (System.IO.Compression / fflate); this
 * script reads the already-extracted `gamestate` text so we isolate the
 * parse+extract question.
 *
 * Run:
 *   pipeline/node_modules/.bin/tsx .planning/spikes/001-sav-extract/extract.ts [gamestatePath]
 * (NODE_OPTIONS=--max-old-space-size=8192 recommended for the full-parse path.)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// jomini lives in pipeline/node_modules — resolve it from there without a
// separate install for the spike.
const require = createRequire("C:/Projects/Stellaris/tech/pipeline/");
const { Jomini } = require("jomini") as typeof import("jomini");

const DEFAULT_GAMESTATE =
  "C:/Users/alexy/AppData/Local/Temp/claude/C--Projects-Stellaris-tech/f48b68bc-ecc3-4637-a6b9-6f496f2c9fa1/scratchpad/sav/gamestate";

const OUT_JSON = "C:/Projects/Stellaris/tech/.planning/spikes/001-sav-extract/empires.json";

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface Empire {
  id: number;
  name: string;
  rawNameKey: string | null;
  countryType: string | null;
  playerName: string | null;
  authority: string | null;
  ethics: string[];
  civics: string[];
  origin: string | null;
  governmentType: string | null;
  founderSpeciesRef: number | null;
  researched: string[]; // tech keys with level >= 1
  researchedCount: number;
}

async function main() {
  const gamestatePath = process.argv[2] ?? DEFAULT_GAMESTATE;
  console.log(`[001] reading gamestate: ${gamestatePath}`);
  const buf = readFileSync(gamestatePath);
  console.log(`[001] file size: ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

  const parser = await Jomini.initialize();

  // The gamestate root is a bare object (no enclosing braces). Wrap in
  // __root__ = { ... } exactly like pipeline/src/parser/clausewitz.ts.
  let text = buf.toString("latin1");
  if (text.startsWith("ï»¿")) text = text.slice(3);
  const wrapped = `__root__ = {\n${text}\n}`;

  const t0 = Date.now();
  const parsed = parser.parseText(wrapped, { encoding: "windows1252" }) as Record<string, any>;
  const root = parsed.__root__ ?? {};
  const parseMs = Date.now() - t0;
  const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`[001] full parse: ${parseMs} ms, heapUsed ${heapMb.toFixed(0)} MB`);

  // --- player name map: country id -> human player name ---
  const playerByCountry = new Map<number, string>();
  for (const p of toArray(root.player)) {
    if (isObj(p) && typeof p.country === "number" && typeof p.name === "string") {
      playerByCountry.set(p.country, p.name);
    }
  }
  console.log(`[001] human players: ${playerByCountry.size}`);

  // --- DIAGNOSTIC: dump the raw shape of one country's identity fields so we
  //     confirm the real key names for government/ethos before trusting them. ---
  const countries = root.country;
  if (!isObj(countries)) {
    throw new Error("[001] no country={} object at root — parse shape unexpected");
  }
  const firstKey = Object.keys(countries).find((k) => /^\d+$/.test(k) && isObj(countries[k]));
  if (firstKey) {
    const c0 = countries[firstKey] as Record<string, any>;
    console.log(`\n[001] === raw identity shape for country ${firstKey} ===`);
    console.log("keys:", Object.keys(c0).slice(0, 60).join(", "));
    console.log("name:", JSON.stringify(c0.name));
    console.log("country_type:", JSON.stringify(c0.country_type));
    console.log("government:", JSON.stringify(c0.government)?.slice(0, 600));
    console.log("ethos:", JSON.stringify(c0.ethos)?.slice(0, 400));
    console.log("origin:", JSON.stringify(c0.origin));
    console.log("=== end raw shape ===\n");
  }

  // --- extract every country ---
  const empires: Empire[] = [];
  for (const [key, val] of Object.entries(countries)) {
    if (!/^\d+$/.test(key) || !isObj(val)) continue;
    const c = val as Record<string, any>;

    // researched techs: tech_status has parallel technology[]/level[] arrays
    const researched: string[] = [];
    if (isObj(c.tech_status)) {
      const techs = toArray(c.tech_status.technology).filter((t): t is string => typeof t === "string");
      const levels = toArray(c.tech_status.level);
      techs.forEach((tk, i) => {
        const lvl = typeof levels[i] === "number" ? (levels[i] as number) : 1;
        if (lvl >= 1) researched.push(tk);
      });
    }

    // name resolution: literal key wins; else human player name; else raw key
    let rawNameKey: string | null = null;
    let name: string;
    if (isObj(c.name)) {
      rawNameKey = typeof c.name.key === "string" ? c.name.key : null;
    } else if (typeof c.name === "string") {
      rawNameKey = c.name;
    }
    const idNum = Number(key);
    const playerName = playerByCountry.get(idNum) ?? null;
    const literal = isObj(c.name) && (c.name.literal === "yes" || c.name.literal === true);
    if (literal && rawNameKey) name = rawNameKey;
    else if (playerName) name = playerName;
    else name = rawNameKey ?? `country_${key}`;

    // government identity (shape confirmed by the diagnostic dump above)
    const gov = isObj(c.government) ? (c.government as Record<string, any>) : {};
    const authority = typeof gov.authority === "string" ? gov.authority : null;
    const governmentType = typeof gov.type === "string" ? gov.type : null;
    const civics = toArray(gov.civics).filter((x): x is string => typeof x === "string");
    const origin =
      typeof gov.origin === "string" ? gov.origin : typeof c.origin === "string" ? c.origin : null;

    // ethics: real shape (confirmed) is ethos = { ethics=[ "ethic_x", ... ] };
    // older saves used repeated `ethic=` keys — handle both.
    const ethics: string[] = [];
    if (isObj(c.ethos)) {
      for (const e of toArray(c.ethos.ethics)) if (typeof e === "string") ethics.push(e);
      for (const e of toArray(c.ethos.ethic)) if (typeof e === "string") ethics.push(e);
    }

    empires.push({
      id: idNum,
      name,
      rawNameKey,
      countryType: typeof c.country_type === "string" ? c.country_type : null,
      playerName,
      authority,
      ethics,
      civics,
      origin,
      governmentType,
      founderSpeciesRef: typeof c.founder_species_ref === "number" ? c.founder_species_ref : null,
      researched,
      researchedCount: researched.length,
    });
  }

  // sort: human players first, then by researched count desc
  empires.sort((a, b) => {
    if (!!a.playerName !== !!b.playerName) return a.playerName ? -1 : 1;
    return b.researchedCount - a.researchedCount;
  });

  console.log(`[001] total country entries: ${empires.length}`);
  console.log(`\n[001] === empires (players first) ===`);
  console.log("id   player?  type                 #tech  name");
  for (const e of empires.slice(0, 30)) {
    console.log(
      `${String(e.id).padEnd(4)} ${(e.playerName ? "YES" : "  -").padEnd(7)} ${String(
        e.countryType,
      ).padEnd(20)} ${String(e.researchedCount).padStart(5)}  ${e.name}`,
    );
  }

  writeFileSync(OUT_JSON, JSON.stringify(empires, null, 2), "utf8");
  console.log(`\n[001] wrote ${empires.length} empires -> ${OUT_JSON}`);

  // --- JOIN VALIDATION: do the save's tech keys match tech.json keys? ---
  // This is the make-or-break question for the whole idea. If the save
  // references techs our data doesn't know (repeatables, event techs, removed
  // techs), classification will silently drop them.
  const TECH_JSON = "C:/Projects/Stellaris/tech/pipeline/data/v4.5.0/tech.json";
  try {
    const snapshot = JSON.parse(readFileSync(TECH_JSON, "utf8"));
    const known = new Set(Object.keys(snapshot.techs));
    console.log(`\n[001] === join validation vs tech.json (${known.size} known techs) ===`);
    const sample = empires.filter((e) => e.playerName).slice(0, 3);
    const allUnmatched = new Set<string>();
    for (const e of sample) {
      const matched = e.researched.filter((t) => known.has(t));
      const unmatched = e.researched.filter((t) => !known.has(t));
      unmatched.forEach((t) => allUnmatched.add(t));
      console.log(
        `  ${e.name}: ${matched.length}/${e.researched.length} matched, ${unmatched.length} unmatched`,
      );
    }
    if (allUnmatched.size) {
      console.log(`  unmatched keys (sample): ${[...allUnmatched].slice(0, 25).join(", ")}`);
    }
  } catch (err) {
    console.log(`[001] join validation skipped (tech.json not readable: ${err})`);
  }

  console.log(`[001] peak heapUsed ~${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
