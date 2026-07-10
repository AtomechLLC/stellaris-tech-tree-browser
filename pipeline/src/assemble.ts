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
import { writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveConfig } from "./config.js";
import { detectGameVersion, detectVersionLabel } from "./version/detect.js";
import { extractTechSources } from "./parser/event-grants.js";
import { loadScriptedVariables } from "./parser/scripted-variables.js";
import { extractAllTechsWithStats, listTechFiles } from "./parser/tech-extractor.js";
import { loadDlcRegistry } from "./dlc/dlc-registry.js";
import { classifyDlc } from "./dlc/dlc-classifier.js";
import { buildAndValidateGraph } from "./graph/build-dag.js";
import { scanAllLocalisation, resolveTechText } from "./localisation/loc-scanner.js";
import { resolveIconSource, type TechSwap } from "./icons/resolve.js";
import { convertDdsToWebp, PLACEHOLDER_ICON_NAME } from "./icons/convert.js";
import { buildUnlocks } from "./unlocks.js";
import { normalizePotential } from "./gates.js";
import { buildReport, printReport, type ReportWarnings } from "./report.js";
import { TechSnapshotSchema, type Tech, type TechSnapshot } from "./schema/tech-snapshot.js";

const LOCALISATION_SUBDIR = join("localisation", "english");
const PLACEHOLDER_ICON_PATH = join(process.cwd(), "assets", PLACEHOLDER_ICON_NAME);

/**
 * Defense-in-depth (T-01-01): tech keys and swap names are parsed out of game
 * files under the user-configurable gameRoot and flow into output file paths.
 * They must be plain identifiers — no path separators, no drive/segment
 * syntax — before being used as a path segment under data/v{version}/icons/.
 */
const SAFE_NAME = /^[a-zA-Z0-9_\-@.]+$/;

/**
 * Whether a tech is "event/archaeology-obtained" enough to warrant a synthetic
 * source parent: an archaeostudies tech, or one that can't be drawn normally
 * (no weight / no prerequisites). Excludes starting and repeatable techs, and
 * tier-0 basics, so a source card never decorates an ordinary research node.
 */
function isSourceEligible(t: {
  category: string[];
  weight: number;
  prerequisites: string[];
  tier: number;
  flags: { isStarting: boolean; isRepeatable: boolean };
}): boolean {
  if (t.flags.isStarting || t.flags.isRepeatable) return false;
  if (t.category.includes("archaeostudies")) return true;
  return t.tier >= 1 && (t.weight === 0 || t.prerequisites.length === 0);
}

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
  const versionLabel = detectVersionLabel(gameRoot);
  const varMap = await loadScriptedVariables(gameRoot);
  const dlcRegistry = await loadDlcRegistry(gameRoot);
  const locMap = scanAllLocalisation(join(gameRoot, LOCALISATION_SUBDIR));

  // Event / dig-site tech grants → synthetic "source" parent cards (reliable
  // subset; see parser/event-grants.ts). Attached below to eligible techs only.
  const { sources: techSources, skippedBundles, parseFailures: eventParseFailures } =
    await extractTechSources(gameRoot, locMap);

  const sourceFiles = listTechFiles(gameRoot);
  // D-17: totalTechKeysFound is measured BEFORE the extraction filter (inside
  // extractAllTechsWithStats), not derived from the filtered output — the
  // report's parsed-vs-found count match must be able to detect drift.
  const { techs: extractedTechs, totalTechKeysFound } = await extractAllTechsWithStats(gameRoot, varMap);

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
  let unresolvedVariableRefsTotal = 0;

  // Swap icons share the per-tech output namespace ({name}.webp) and many
  // swap names ARE real tech keys — those techs' own conversion passes
  // produce their files. Converting such swaps again would be redundant and,
  // if the colliding tech uses an `icon =` override, a silent iteration-order
  // last-writer-wins content conflict. Used to skip those below.
  const extractedKeySet = new Set(extractedTechs.map((t) => t.key));

  const techs: Record<string, Tech> = {};

  for (const extracted of extractedTechs) {
    const { key, sourceFile, unlockContentRaw, potentialRaw, iconOverrideRaw, technologySwapRaw, fileVars, ...techFields } =
      extracted;

    const dlc = classifyDlc({ potentialRaw }, sourceFile, dlcRegistry);
    // Normalize the raw `potential` block into a machine-evaluable gate tree so
    // the app's Saved Empire view can classify never-reachable techs (null when
    // the tech has no potential gate).
    const gate = normalizePotential(potentialRaw);

    const { name, description } = resolveTechText(key, locMap);
    if (!name) {
      missingNames.push(key);
    }

    const leadsToForTech = graph.get(key)?.leadsTo ?? [];
    const unlocksResult = buildUnlocks(unlockContentRaw, locMap, leadsToForTech, fileVars);
    unresolvedGrantLocKeysTotal += unlocksResult.unresolvedGrantLocKeys;
    unresolvedVariableRefsTotal += unlocksResult.unresolvedVariableRefs;

    const iconSource = resolveIconSource(
      { key, icon: iconOverrideRaw, technology_swap: technologySwapRaw as TechSwap | TechSwap[] | undefined },
      gameRoot,
    );
    if (!SAFE_NAME.test(key)) {
      throw new Error(`runAssemble: unsafe tech key for output path: "${key}"`);
    }
    const webpOutPath = join(iconsOutDir, `${key}.webp`);
    let iconRef: string;
    if (iconSource.base) {
      const pngTempPath = join(iconsOutDir, `${key}.tmp.png`);
      // D-13: a corrupt/unreadable DDS (or transient magick failure) degrades
      // to the placeholder — it must never abort the whole build.
      try {
        await convertDdsToWebp(iconSource.base, pngTempPath, webpOutPath);
        iconRef = `${key}.webp`;
      } catch (err) {
        console.warn(`[assemble] icon conversion failed for "${key}" (${err}) — using placeholder`);
        iconRef = usePlaceholder();
      }
    } else {
      iconRef = usePlaceholder();
      console.warn(`[assemble] no icon source resolved for "${key}" — using placeholder`);
    }

    for (const swap of iconSource.swaps) {
      // Skip swaps whose name is a real extracted tech key — that tech's own
      // pass produces {name}.webp (see extractedKeySet note above).
      if (extractedKeySet.has(swap.name)) continue;
      if (!SAFE_NAME.test(swap.name)) {
        throw new Error(`runAssemble: unsafe technology_swap name for output path: "${swap.name}"`);
      }
      const swapWebpPath = join(iconsOutDir, `${swap.name}.webp`);
      const swapPngTempPath = join(iconsOutDir, `${swap.name}.tmp.png`);
      try {
        await convertDdsToWebp(swap.path, swapPngTempPath, swapWebpPath);
      } catch (err) {
        // D-13: swap icons are supplementary — warn and skip, never fail the build.
        console.warn(`[assemble] swap icon conversion failed for "${swap.name}" (${err}) — skipping`);
      }
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
      gate,
      // Attach the event/dig-site source only to eligible (event/archaeology)
      // techs — never decorate a normally-researched node.
      source: isSourceEligible(techFields) ? techSources.get(key) ?? null : null,
    };
  }

  // Research-currency icons: each tech costs its AREA's research (physics /
  // society / engineering). Convert the three fixed resource icons once,
  // alongside the tech icons, so the app can show a cost-type icon next to each
  // tech's cost. Referenced by the app as `_research_<area>.webp`. Supplementary
  // (D-13): a conversion failure warns and skips, never fails the build.
  for (const area of ["physics", "society", "engineering"]) {
    const ddsPath = join(gameRoot, "gfx", "interface", "icons", "resources", `${area}_research.dds`);
    const webpOut = join(iconsOutDir, `_research_${area}.webp`);
    const pngTmp = join(iconsOutDir, `_research_${area}.tmp.png`);
    try {
      await convertDdsToWebp(ddsPath, pngTmp, webpOut);
    } catch (err) {
      console.warn(`[assemble] research icon conversion failed for "${area}" (${err}) — cost icon will be absent`);
    }
  }

  // Tech-category ("subtype") icons — one per research category (biology,
  // computing, …). Convert every category_<name>.dds → `_category_<name>.webp`
  // so the app can show a subtype icon on cards and in the category nav.
  const catIconDir = join(gameRoot, "gfx", "interface", "icons", "technologies", "categories");
  try {
    for (const file of readdirSync(catIconDir)) {
      const m = /^category_(.+)\.dds$/i.exec(file);
      if (!m) continue;
      const webpOut = join(iconsOutDir, `_category_${m[1]}.webp`);
      const pngTmp = join(iconsOutDir, `_category_${m[1]}.tmp.png`);
      try {
        await convertDdsToWebp(join(catIconDir, file), pngTmp, webpOut);
      } catch (err) {
        console.warn(`[assemble] category icon conversion failed for "${file}" (${err}) — subtype icon will be absent`);
      }
    }
  } catch (err) {
    console.warn(`[assemble] could not read category icon dir ${catIconDir} (${err})`);
  }

  // App-header ethic icon (xenophile) — a single fixed decorative icon.
  try {
    await convertDdsToWebp(
      join(gameRoot, "gfx", "interface", "icons", "ethics", "ethic_xenophile.dds"),
      join(iconsOutDir, "_ethic_xenophile.tmp.png"),
      join(iconsOutDir, "_ethic_xenophile.webp"),
    );
  } catch (err) {
    console.warn(`[assemble] ethic_xenophile icon conversion failed (${err}) — header icon will be absent`);
  }

  // Ascension-perk hexagon icons — rendered as synthetic PARENT nodes of the
  // perk-gated (Ambition / Crisis) techs in Explore (`_perk_<id>.webp`).
  for (const perk of ["ap_cosmogenesis", "ap_become_the_crisis"]) {
    try {
      await convertDdsToWebp(
        join(gameRoot, "gfx", "interface", "icons", "ascension_perks", `${perk}.dds`),
        join(iconsOutDir, `_perk_${perk}.tmp.png`),
        join(iconsOutDir, `_perk_${perk}.webp`),
      );
    } catch (err) {
      console.warn(`[assemble] perk icon ${perk} conversion failed (${err}) — perk node will be iconless`);
    }
  }

  // Event/archaeology "source" icons — synthetic PARENT nodes of techs that a
  // specific event or dig site grants (`_source_site.webp` / `_source_event.webp`).
  const sourceIcons: Array<[file: string, out: string]> = [
    ["situation_log_archaeology", "_source_site"],
    ["situation_log_main_quest", "_source_event"],
  ];
  for (const [file, out] of sourceIcons) {
    try {
      await convertDdsToWebp(
        join(gameRoot, "gfx", "interface", "icons", "situation_log", `${file}.dds`),
        join(iconsOutDir, `${out}.tmp.png`),
        join(iconsOutDir, `${out}.webp`),
      );
    } catch (err) {
      console.warn(`[assemble] source icon ${out} conversion failed (${err}) — source node will be iconless`);
    }
  }

  // Empire-archetype filter icons (app: ArchetypeToggles) — 3 exclusive pairs
  // (Landed/Nomad, Machine/Biological, Alloy Ship/Bioship) + standalone Fauna.
  // Not tied to any specific tech; static UI chrome like the perk/source icons.
  const archetypeIcons: Array<[relPath: string, out: string]> = [
    ["gfx/interface/icons/planet.dds", "_arch_landed"],
    ["gfx/interface/icons/governments/nomad_toggle.dds", "_arch_nomad"],
    ["gfx/interface/icons/governments/authorities/auth_machine_intelligence.dds", "_arch_machine"],
    ["gfx/interface/icons/ascension_perks/ap_engineered_evolution.dds", "_arch_biological"],
    ["gfx/interface/icons/technologies/tech_battleships.dds", "_arch_alloy_ship"],
    ["gfx/interface/icons/technologies/tech_cosmogenesis_mauler.dds", "_arch_bioship"],
    ["gfx/interface/icons/origins/origins_wilderness.dds", "_arch_fauna"],
  ];
  for (const [relPath, out] of archetypeIcons) {
    try {
      await convertDdsToWebp(
        join(gameRoot, ...relPath.split("/")),
        join(iconsOutDir, `${out}.tmp.png`),
        join(iconsOutDir, `${out}.webp`),
      );
    } catch (err) {
      console.warn(`[assemble] archetype icon ${out} conversion failed (${err}) — toggle will be iconless`);
    }
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
      versionLabel: versionLabel.label,
      checksum: versionLabel.checksum ?? undefined,
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

  // Event/dig-site source coverage (synthetic source parents).
  const withSource = Object.values(validated.techs).filter((t) => t.source);
  const bySite = withSource.filter((t) => t.source?.type === "site").length;
  console.log(
    `[assemble] tech sources: ${withSource.length} techs attributed ` +
      `(${bySite} site, ${withSource.length - bySite} event); ` +
      `${skippedBundles} bundle-events skipped; ${eventParseFailures} event files unparsed`,
  );

  // D-17: validation report — every metric below is MEASURED from the actual
  // artifact/accumulators, never asserted as a constant.
  // buildAndValidateGraph already throws on dangling refs, so this measured
  // count is 0 on every successful run — by measurement, not by assumption.
  const techKeySet = new Set(Object.keys(validated.techs));
  let danglingPrerequisiteCount = 0;
  for (const tech of Object.values(validated.techs)) {
    for (const prereq of tech.prerequisites) {
      if (!techKeySet.has(prereq)) danglingPrerequisiteCount++;
    }
  }

  const warnings: ReportWarnings = {
    totalTechKeysFound,
    unresolvedVariableCount: unresolvedVariableRefsTotal,
    danglingPrerequisiteCount,
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
