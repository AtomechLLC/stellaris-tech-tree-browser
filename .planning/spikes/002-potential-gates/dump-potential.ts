import { loadScriptedVariables } from "../../../pipeline/src/parser/scripted-variables.ts";
import { extractAllTechs } from "../../../pipeline/src/parser/tech-extractor.ts";

const GAME = "Z:/SteamLibrary/steamapps/common/Stellaris";

async function main() {
  const want = process.argv.slice(2);
  const varMap = await loadScriptedVariables(GAME);
  const techs = await extractAllTechs(GAME, varMap);
  for (const t of techs) {
    if (want.length && !want.includes(t.key)) continue;
    if ((t as any).potentialRaw === undefined) continue;
    console.log(`\n===== ${t.key} =====`);
    console.log(JSON.stringify((t as any).potentialRaw, null, 1));
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
