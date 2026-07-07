/**
 * DLC registry — the authoritative DLC display-name source (D-08 refined per
 * RESEARCH.md's "Don't Hand-Roll" finding).
 *
 * Rather than a hand-maintained filename->DLC-name lookup table, this parses
 * the game's own DLC metadata files at "dlc/dlc0XX_<name>/dlc0XX.dlc"
 * (Clausewitz format, same parser as tech files). Each file's `name` field is
 * the EXACT string used by in-script `host_has_dlc = "..."` triggers
 * elsewhere in tech files (verified directly against the real 4.5.0 install:
 * "Ancient Relics Story Pack", "Apocalypse", "Federations", "Distant Stars
 * Story Pack", etc all match exactly). This self-updates whenever a new
 * DLC folder appears in the install — no code change needed for the
 * display-name part.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseClausewitzFile } from "../parser/clausewitz.js";

const DLC_SUBDIR = "dlc";

/**
 * Parses every DLC metadata file under "dlc/dlc0XX_<name>/dlc0XX.dlc" and
 * returns a map keyed by the DLC folder name (e.g. "dlc021_ancient_relics")
 * -> authoritative display name (e.g. "Ancient Relics Story Pack") read from
 * the file's `name` field.
 */
export async function loadDlcRegistry(gameRoot: string): Promise<Map<string, string>> {
  const dlcRoot = join(gameRoot, DLC_SUBDIR);
  const folders = readdirSync(dlcRoot).filter((f) => statSync(join(dlcRoot, f)).isDirectory());

  const registry = new Map<string, string>();
  for (const folder of folders) {
    const folderPath = join(dlcRoot, folder);
    const dlcFile = readdirSync(folderPath).find((f) => f.endsWith(".dlc"));
    if (!dlcFile) continue;

    const parsed = await parseClausewitzFile(join(folderPath, dlcFile));
    const name = parsed.name;
    if (typeof name === "string") {
      registry.set(folder, name);
    }
  }

  return registry;
}
