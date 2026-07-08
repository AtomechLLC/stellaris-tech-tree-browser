/**
 * Orchestrator entrypoint for `npm run build:data` — the FULL PIPELINE
 * (Plan 05, replacing Plan 01's walking-skeleton single-tech-file slice).
 *
 * Composes every stage per RESEARCH.md's System Architecture Diagram:
 *   1. resolveConfig() -> gameRoot
 *   2. detectGameVersion(gameRoot)
 *   3. loadScriptedVariables(gameRoot)
 *   4. loadDlcRegistry(gameRoot)
 *   5. scanAllLocalisation(<gameRoot>/localisation/english)
 *   6. extractAllTechs(gameRoot, varMap) over all 33 files (+ raw unlock content)
 *   7. buildAndValidateGraph(techs) -> leadsTo reverse edges; THROWS on any
 *      dangling prerequisite or cycle (D-16)
 *   8. per tech: classifyDlc, resolveTechText (STRICT-FAIL on missing name),
 *      buildUnlocks (both D-05 components), resolveIconSource +
 *      convertDdsToWebp (or placeholder, D-13)
 *   9. sort techs by key + sort every internal list (D-03)
 *  10. assemble full meta block
 *  11. TechSnapshotSchema.parse() BEFORE writing (D-16) — throw, write nothing
 *      if invalid
 *  12. write data/v{version}/tech.json (fixed indentation, deterministic
 *      key ordering)
 *  13. buildReport + printReport (D-17)
 *
 * Single command, no manual steps (D-14/DATA-05).
 *
 * Note on idempotency (DATA-05): `meta.generatedAt` is a timestamp and will
 * legitimately differ between runs. The idempotency test (Task 3,
 * corpus.test.ts) compares tech.json with `meta.generatedAt` normalized/
 * excluded — every OTHER field is byte-stable across runs.
 */
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveConfig } from "./config.js";
import { detectGameVersion } from "./version/detect.js";
import { loadScriptedVariables } from "./parser/scripted-variables.js";
import { extractAllTechs, listTechFiles, type ExtractedTech } from "./parser/tech-extractor.js";
import { loadDlcRegistry } from "./dlc/dlc-registry.js";
import { classifyDlc } from "./dlc/dlc-classifier.js";
import { buildAndValidateGraph } from "./graph/build-dag.js";
import { scanAllLocalisation, resolveTechText } from "./localisation/loc-scanner.js";
import { resolveIconSource, type TechSwap } from "./icons/resolve.js";
import { convertDdsToWebp } from "./icons/convert.js";
import { buildUnlocks } from "./unlocks.js";
import { buildReport, printReport, type ReportWarnings } from "./report.js";
import { TechSnapshotSchema, type Tech, type TechSnapshot } from "./schema/tech-snapshot.js";

const LOCALISATION_SUBDIR = join("localisation", "english");
const PLACEHOLDER_ICON_PATH = join(process.cwd(), "assets", "placeholder-icon.webp");
const PLACEHOLDER_ICON_NAME = "placeholder-icon.webp";

/**
 * Runs the full pipeline and returns the path to the written tech.json
 * snapshot.
 */
export async function runAssemble(): Promise<string> {
  // D-15 precedence #1: let resolveConfig read the real CLI args
  // (process.argv.slice(2) default) so `npm run build:data -- --game-root=<path>`
  // actually takes effect. (Test files deliberately pass [] to avoid vitest
  // argv interference; the entrypoint must NOT.)
  const { gameRoot } = resolveConfig();
  const gameVersion = detectGameVersion(gameRoot);
  const varMap = await loadScriptedVariables(gameRoot);
  const dlcRegistry = await loadDlcRegistry(gameRoot);
  const locMap = scanAllLocalisation(join(gameRoot, LOCALISATION_SUBDIR));

  const sourceFiles = listTechFiles(gameRoot);
  const extractedTechs: ExtractedTech[] = await extractAllTechs(gameRoot, varMap);
  const totalTechKeysFound = extractedTechs.length;

  // D-16: buildAndValidateGraph throws on any dangling prerequisite or cycle.
  const graph = buildAndValidateGraph(extractedTechs);

  const outDir = join(process.cwd(), "data", gameVersion);
  const iconsOutDir = join(outDir, "icons");
  mkdirSync(iconsOutDir, { recursive: true });

  // D-13: the placeholder is copied ONCE into the icons output dir and every
  // fallback references that same emitted file — the shipped `icon` field must
  // always point at a real file under data/v{version}/icons/ (SCHEMA.md
  // contract). A copy failure warns rather than failing the build.
  let placeholderEmitted = false;
  const usePlaceholder = (): string => {
    if (!placeholderEmitted) {
      placeholderEmitted = true;
      try {
        copyFileSync(PLACEHOLDER_ICON_PATH, join(iconsOutDir, PLACEHOLDER_ICON_NAME));
      } catch (err) {
        console.warn(
          `[assemble] failed to copy placeholder icon into ${iconsOutDir} (${err}) — placeholder refs may dangle`,
        );
      }
    }
    return PLACEHOLDER_ICON_NAME;
  };

  const missingNames: string[] = [];
  let unresolvedGrantLocKeysTotal = 0;

  const techs: Record<string, Tech> = {};

  for (const extracted of extractedTechs) {
    const { key, sourceFile, unlockContentRaw, potentialRaw, iconOverrideRaw, technologySwapRaw, fileVars, ...techFields } =
      extracted;

    const dlc = classifyDlc({ potentialRaw }, sourceFile, dlcRegistry);

    const { name, description } = resolveTechText(key, locMap);
    if (!name) {
      missingNames.push(key);
    }

    const leadsToForTech = graph.get(key)?.leadsTo ?? [];
    const unlocksResult = buildUnlocks(unlockContentRaw, locMap, leadsToForTech, fileVars);
    unresolvedGrantLocKeysTotal += unlocksResult.unresolvedGrantLocKeys;

    const iconSource = resolveIconSource(
      { key, icon: iconOverrideRaw, technology_swap: technologySwapRaw as TechSwap | TechSwap[] | undefined },
      gameRoot,
    );
    const webpOutPath = join(iconsOutDir, `${key}.webp`);
    let iconRef: string;
    if (iconSource.base) {
      const pngTempPath = join(iconsOutDir, `${key}.tmp.png`);
      await convertDdsToWebp(iconSource.base, pngTempPath, webpOutPath);
      iconRef = `${key}.webp`;
    } else {
      iconRef = usePlaceholder();
      console.warn(`[assemble] no icon source resolved for "${key}" — using placeholder`);
    }

    for (const swap of iconSource.swaps) {
      const swapWebpPath = join(iconsOutDir, `${swap.name}.webp`);
      const swapPngTempPath = join(iconsOutDir, `${swap.name}.tmp.png`);
      await convertDdsToWebp(swap.path, swapPngTempPath, swapWebpPath);
    }

    techs[key] = {
      ...techFields,
      key,
      prerequisites: [...techFields.prerequisites].sort(),
      unlocks: { grants: unlocksResult.grants, leadsTo: unlocksResult.leadsTo },
      dlc,
      name: name ?? key,
      description,
      icon: iconRef,
    };
  }

  // D-16: strict-fail on any tech with an unresolved name.
  if (missingNames.length > 0) {
    throw new Error(
      `runAssemble: ${missingNames.length} tech(es) missing a resolved localisation name: ${missingNames
        .slice(0, 10)
        .join(", ")}${missingNames.length > 10 ? ", ..." : ""}`,
    );
  }

  const sortedKeys = Object.keys(techs).sort();
  const sortedTechs: Record<string, Tech> = {};
  for (const k of sortedKeys) sortedTechs[k] = techs[k];

  const areaCounts: Record<string, number> = {};
  const tierCounts: Record<string, number> = {};
  for (const tech of Object.values(sortedTechs)) {
    areaCounts[tech.area] = (areaCounts[tech.area] ?? 0) + 1;
    tierCounts[String(tech.tier)] = (tierCounts[String(tech.tier)] ?? 0) + 1;
  }

  const snapshot: TechSnapshot = {
    meta: {
      gameVersion,
      generatedAt: new Date().toISOString(),
      techCount: sortedKeys.length,
      areaCounts,
      tierCounts,
      sourceFiles,
    },
    techs: sortedTechs,
  };

  // D-16: validate before writing — throw and do not write if invalid.
  const validated = TechSnapshotSchema.parse(snapshot);

  const outPath = join(outDir, "tech.json");
  writeFileSync(outPath, JSON.stringify(validated, null, 2), "utf8");

  console.log(`[assemble] wrote ${outPath}`);
  console.log(`[assemble] techCount=${validated.meta.techCount}`);

  // D-17: validation report.
  const warnings: ReportWarnings = {
    totalTechKeysFound,
    unresolvedVariableCount: 0,
    danglingPrerequisiteCount: 0,
    unresolvedGrantLocKeys: unresolvedGrantLocKeysTotal,
  };
  const report = buildReport(validated, warnings);
  printReport(report);

  return outPath;
}

const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isMainModule) {
  runAssemble().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
