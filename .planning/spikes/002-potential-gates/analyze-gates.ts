/**
 * Spike 002 — potential-gates, Phase A: vocabulary survey.
 *
 * Before designing the gate summary, learn WHAT the corpus actually uses. Reuse
 * the pipeline extractor (which already captures `potentialRaw`) to tally every
 * trigger key that appears inside `potential = {}` across all techs, plus how
 * many techs use each. Then hand-categorize the keys into:
 *   - STATIC identity gates (authority/ethics/civics/origin/species/DLC) → can
 *     yield a permanent "never" verdict for an empire.
 *   - DYNAMIC conditions (flags/war/other-tech/pop-count/…) → never means
 *     "never" only if statically false; otherwise conditional, NOT a hard gate.
 *
 * Import pipeline modules by relative path — their bare `jomini` import resolves
 * from pipeline/node_modules (ESM resolves bare specifiers from the importing
 * file's location, i.e. pipeline/src, not this script's location).
 *
 * Run: pipeline/node_modules/.bin/tsx .planning/spikes/002-potential-gates/analyze-gates.ts
 */
import { loadScriptedVariables } from "../../../pipeline/src/parser/scripted-variables.ts";
import { extractAllTechs } from "../../../pipeline/src/parser/tech-extractor.ts";

const GAME_ROOT = "Z:/SteamLibrary/steamapps/common/Stellaris";

// Boolean/aggregate combinators — descend into their children, don't count them
// as leaf triggers.
const COMBINATORS = new Set(["NOT", "NOR", "OR", "AND", "NAND", "count", "hidden_trigger"]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Collect leaf trigger keys inside a potential block (recursing through combinators). */
function collectTriggerKeys(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTriggerKeys(item, out);
    return;
  }
  if (!isObj(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (COMBINATORS.has(k)) {
      collectTriggerKeys(v, out); // descend, don't record the combinator itself
    } else {
      out.add(k);
      // some triggers nest further (e.g. species checks), descend too
      if (isObj(v) || Array.isArray(v)) collectTriggerKeys(v, out);
    }
  }
}

async function main() {
  const varMap = await loadScriptedVariables(GAME_ROOT);
  const techs = await extractAllTechs(GAME_ROOT, varMap);
  console.log(`[002] extracted ${techs.length} techs`);

  const tally = new Map<string, number>();
  let withPotential = 0;
  const examplesByKey = new Map<string, string>();

  for (const t of techs) {
    const pot = (t as any).potentialRaw;
    if (pot === undefined || pot === null) continue;
    withPotential++;
    const keys = new Set<string>();
    collectTriggerKeys(pot, keys);
    for (const k of keys) {
      tally.set(k, (tally.get(k) ?? 0) + 1);
      if (!examplesByKey.has(k)) examplesByKey.set(k, t.key);
    }
  }

  console.log(`[002] techs with a potential block: ${withPotential}/${techs.length}`);
  console.log(`[002] distinct trigger keys: ${tally.size}\n`);

  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  console.log("count  trigger_key                          example_tech");
  for (const [k, n] of sorted) {
    console.log(`${String(n).padStart(4)}   ${k.padEnd(36)} ${examplesByKey.get(k)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
