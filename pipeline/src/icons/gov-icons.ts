/**
 * Civic / origin / authority icon resolution for v4.5.1 (restores the 91
 * `_civic_*` / `_origin_*` / `_auth_*` files that went missing when the
 * assemble.ts def pass alone stopped covering v4.5.1's restructured defs).
 *
 * Why this module exists, in order:
 *   1. v4.5.1 moved the authority-swap ids (auth_bio_/cyber_/shroud_/synth_
 *      etc.) OUT of top-level authority defs and INTO nested
 *      `advanced_authority_swap = { name = "auth_..." ... }` sub-blocks —
 *      the old top-level-keys-only def pass never sees them.
 *   2. v4.5.1 deleted a batch of legacy alias civic/origin defs outright, but
 *      their ids still appear in pre-4.5.1 save files (which the Saved Empire
 *      loader still accepts) and their conventional art still ships on disk —
 *      so those ids need a conventional-art scan, not a def, to resolve.
 *   3. The origins art directory uses a PLURAL `origins_` filename prefix
 *      (`gfx/interface/icons/origins/origins_clones.dds`) for the singular
 *      `origin_clones` id — the id and its art stem differ by one letter.
 *   4. `_35x35`-suffixed files are small-size art duplicates of the same id,
 *      never ids in their own right, and must never be scanned in as one.
 *   5. Resolution here is existence-driven (a name resolves iff its
 *      conventional file exists on disk), matching the game's own comment on
 *      `advanced_authority_swap.name` ("will also be used to attempt and find
 *      an icon from interface/icons/governments/authorities/") — so an
 *      `inherit_icon = yes` swap with no art file is naturally skipped
 *      without needing to special-case that flag at all.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseClausewitzFile, normalizeToArray } from "../parser/clausewitz.js";

/**
 * Defense-in-depth (mirrors assemble.ts's T-01-01 path-segment guard): ids
 * come from game files (def keys, swap `name` fields, scanned art stems)
 * under the user-configurable gameRoot and become path segments under
 * data/v{version}/icons/. They must be plain identifiers before use.
 */
const SAFE_NAME = /^[a-zA-Z0-9_\-@.]+$/;

/** `_35x35`-style suffixes mark a size-variant art duplicate, not a real id. */
const SIZE_VARIANT = /_\d+x\d+$/;

interface GovDefSource {
  defDir: string;
  idPattern: RegExp;
  fallbackDir: string;
  /** Keys inside a def block whose sub-blocks may carry their own icon id (a
   *  `name` field), e.g. `advanced_authority_swap`. */
  swapKeys: string[];
}

const GOV_DEF_SOURCES: GovDefSource[] = [
  {
    defDir: "common/governments/civics",
    idPattern: /^(civic_|origin_)/,
    fallbackDir: "gfx/interface/icons/governments/civics",
    swapKeys: ["swap_type"],
  },
  {
    defDir: "common/governments/authorities",
    idPattern: /^auth_/,
    fallbackDir: "gfx/interface/icons/governments/authorities",
    swapKeys: ["advanced_authority_swap"],
  },
];

interface LegacyArtScan {
  artDir: string;
  match: RegExp;
  toId: (m: RegExpExecArray) => string;
}

const LEGACY_ART_SCANS: LegacyArtScan[] = [
  {
    artDir: "gfx/interface/icons/governments/civics",
    match: /^((?:civic_|origin_).+)\.dds$/i,
    toId: (m) => m[1],
  },
  {
    artDir: "gfx/interface/icons/governments/authorities",
    match: /^(auth_.+)\.dds$/i,
    toId: (m) => m[1],
  },
  {
    // Plural `origins_` filename prefix maps to the singular `origin_` id
    // (e.g. origins_clones.dds -> origin_clones), including the shipped
    // typo `origins_one_the_shoulders_of_giant.dds`.
    artDir: "gfx/interface/icons/origins",
    match: /^origins_(.+)\.dds$/i,
    toId: (m) => `origin_${m[1]}`,
  },
];

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Resolves every civic/origin/authority icon id to an absolute `.dds` source
 * path, combining:
 *   - a def pass over `common/governments/{civics,authorities}` (top-level
 *     defs, honoring a declared `icon =` path, plus their nested swap
 *     sub-blocks), then
 *   - a legacy conventional-art scan for ids whose def v4.5.1 deleted.
 *
 * Per-file read/parse failures warn and skip (`[gov-icons]` prefix); this
 * function never throws for a per-id or per-file problem.
 */
export async function resolveGovIconSources(gameRoot: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const consider = (
    id: string,
    block: Record<string, unknown>,
    source: { idPattern: RegExp; fallbackDir: string },
  ): void => {
    if (!source.idPattern.test(id) || !SAFE_NAME.test(id) || map.has(id)) return;
    const declared = typeof block.icon === "string" && /\.dds$/i.test(block.icon) ? block.icon : null;
    const relPath = declared ?? `${source.fallbackDir}/${id}.dds`;
    const srcPath = join(gameRoot, ...relPath.split("/"));
    if (!existsSync(srcPath)) return;
    map.set(id, srcPath);
  };

  // Def pass: top-level gov defs, plus their nested swap sub-blocks (array or
  // single-object jomini shape — normalizeToArray makes both uniform).
  for (const source of GOV_DEF_SOURCES) {
    const dir = join(gameRoot, ...source.defDir.split("/"));
    let defFiles: string[] = [];
    try {
      defFiles = readdirSync(dir).filter((f) => f.endsWith(".txt"));
    } catch (err) {
      console.warn(`[gov-icons] could not read gov def dir ${dir} (${err})`);
      continue;
    }
    for (const file of defFiles) {
      let raw: Record<string, unknown>;
      try {
        raw = await parseClausewitzFile(join(dir, file));
      } catch (err) {
        console.warn(`[gov-icons] could not parse gov defs ${file} (${err}) — skipping`);
        continue;
      }
      for (const [id, val] of Object.entries(raw)) {
        const block = Array.isArray(val) ? val.find(isPlain) : val;
        if (!isPlain(block)) continue;
        consider(id, block, source);
        // Iterate swaps for every plain top-level block, even when the parent
        // id was skipped, had no art, or was already mapped.
        for (const swapKey of source.swapKeys) {
          for (const swap of normalizeToArray(block[swapKey])) {
            if (!isPlain(swap) || typeof swap.name !== "string") continue;
            consider(swap.name, swap, source);
          }
        }
      }
    }
  }

  // Legacy scan (runs AFTER the whole def pass): conventional art for ids
  // whose def v4.5.1 deleted outright. Never overwrites an id the def pass
  // already resolved.
  for (const scan of LEGACY_ART_SCANS) {
    const dir = join(gameRoot, ...scan.artDir.split("/"));
    let files: string[] = [];
    try {
      files = readdirSync(dir);
    } catch (err) {
      console.warn(`[gov-icons] could not read legacy art dir ${dir} (${err})`);
      continue;
    }
    for (const file of files) {
      const m = scan.match.exec(file);
      if (!m) continue;
      const id = scan.toId(m);
      if (SIZE_VARIANT.test(id) || !SAFE_NAME.test(id) || map.has(id)) continue;
      map.set(id, join(dir, file));
    }
  }

  return map;
}
