/**
 * Faction-type / ideology resolver (4.6.0 factions table).
 *
 * Reads common/pop_faction_types and common/ideologies (expanding their
 * top-level `inline_script` includes), maps GFX sprite names to textures via
 * interface/*.gfx, and emits a deterministic table keyed by faction type.
 *
 * Game-documented defaults (pop_faction_types/99_documentation.txt): the name
 * loc key defaults to "pft_" + key and the icon sprite to "GFX_faction_icon_" +
 * key. Overrides live in `swappable_data` (either `default = {...}` or direct
 * name/icon). The ideological swap is the swap_type whose trigger is
 * `exists = ideology`.
 *
 * All parse problems are warnings, never throws (auxiliary scan).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { parseClausewitzFile, parseClausewitzText, normalizeToArray } from "../parser/clausewitz.js";
import { resolveDisplayText } from "../localisation/loc-scanner.js";
import type { FactionTypeSchema } from "../schema/tech-snapshot.js";

export type FactionType = z.infer<typeof FactionTypeSchema>;

const MAX_DEPTH = 8;
const SAFE_SCRIPT = /^[A-Za-z0-9_/-]+$/;
const SAFE_PARAM = /^[A-Za-z0-9_]+$/;
const FACTION_ICON_PREFIX = "gfx/interface/icons/factions/";

type Block = Record<string, unknown>;

function isBlock(v: unknown): v is Block {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const scriptTextCache = new Map<string, string | null>();

function readScriptText(gameRoot: string, script: string): string | null {
  const path = join(gameRoot, "common", "inline_scripts", ...script.split("/")) + ".txt";
  const cacheKey = path;
  if (scriptTextCache.has(cacheKey)) return scriptTextCache.get(cacheKey)!;
  let text: string | null = null;
  if (existsSync(path)) {
    try {
      text = readFileSync(path).toString("latin1");
    } catch {
      text = null;
    }
  }
  scriptTextCache.set(cacheKey, text);
  return text;
}

function mergeInto(target: Block, source: Block): void {
  for (const [k, v] of Object.entries(source)) {
    if (!(k in target)) {
      target[k] = v;
    } else {
      target[k] = [...normalizeToArray(target[k]), ...normalizeToArray(v)];
    }
  }
}

/**
 * Replaces every top-level `inline_script` entry of `block` with the parsed
 * content of common/inline_scripts/<script>.txt (textual `$PARAM$`
 * substitution first). Nested content is expanded recursively up to depth 8.
 * Problems push a warning and drop the entry.
 */
export async function expandInlineScripts(
  block: Block,
  gameRoot: string,
  warnings: string[],
  depth = 0,
): Promise<Block> {
  const out: Block = {};
  for (const [k, v] of Object.entries(block)) {
    if (k !== "inline_script") out[k] = v;
  }
  const entries = normalizeToArray(block.inline_script as unknown | unknown[] | undefined);
  if (entries.length === 0) return out;
  if (depth >= MAX_DEPTH) {
    warnings.push(`inline_script depth limit (${MAX_DEPTH}) reached; ${entries.length} include(s) dropped`);
    return out;
  }

  for (const entry of entries) {
    let script: string | undefined;
    const params: Record<string, string> = {};
    if (typeof entry === "string") {
      script = entry;
    } else if (isBlock(entry)) {
      if (typeof entry.script === "string") script = entry.script;
      for (const [pk, pv] of Object.entries(entry)) {
        if (pk === "script") continue;
        if ((typeof pv === "string" || typeof pv === "number") && SAFE_PARAM.test(pk)) params[pk] = String(pv);
      }
    }
    if (!script) {
      warnings.push("inline_script entry without a script path; dropped");
      continue;
    }
    if (!SAFE_SCRIPT.test(script) || script.split("/").some((seg) => seg === ".." || seg === "")) {
      warnings.push(`inline_script path refused (unsafe): ${JSON.stringify(script)}`);
      continue;
    }
    const raw = readScriptText(gameRoot, script);
    if (raw === null) {
      warnings.push(`inline_script file missing: ${script}`);
      continue;
    }
    let text = raw;
    for (const [pk, pv] of Object.entries(params)) {
      text = text.split(`$${pk}$`).join(pv);
    }
    try {
      const parsed = await parseClausewitzText(text);
      mergeInto(out, await expandInlineScripts(parsed, gameRoot, warnings, depth + 1));
    } catch (err) {
      warnings.push(`inline_script parse failed: ${script} (${err})`);
    }
  }
  return out;
}

/** Sprite name -> texture path, from every .gfx directly under interface/. */
export async function loadSpriteTextures(gameRoot: string, warnings: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const dir = join(gameRoot, "interface");
  let files: string[] = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".gfx"))
      .sort();
  } catch {
    return map;
  }
  for (const file of files) {
    try {
      const parsed = await parseClausewitzFile(join(dir, file));
      for (const st of normalizeToArray(parsed.spriteTypes as unknown | unknown[] | undefined)) {
        if (!isBlock(st)) continue;
        for (const sprite of normalizeToArray(st.spriteType as unknown | unknown[] | undefined)) {
          if (!isBlock(sprite)) continue;
          const name = sprite.name;
          const tex = sprite.textureFile ?? sprite.texturefile;
          if (typeof name === "string" && typeof tex === "string") map.set(name, tex);
        }
      }
    } catch (err) {
      warnings.push(`gfx file unparsed: ${file} (${err})`);
    }
  }
  return map;
}

function lastBlock(v: unknown): Block | null {
  const arr = normalizeToArray(v as unknown | unknown[] | undefined).filter(isBlock);
  return arr.length ? arr[arr.length - 1]! : null;
}

function txtFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".txt"))
      .sort();
  } catch {
    return [];
  }
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    for (const e of normalizeToArray(v as unknown | unknown[] | undefined)) {
      if (typeof e === "string") return e;
    }
  }
  return null;
}

function sortedUnique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}

export async function resolveFactionTypes(
  gameRoot: string,
  locMap: Map<string, string>,
  sprites: Map<string, string>,
  convertedStems: Set<string>,
): Promise<{ factions: FactionType[]; warnings: string[] }> {
  const warnings: string[] = [];

  // --- ideologies: faction key -> ideology keys / ethics ---
  const ideoByFaction = new Map<string, { ideologies: string[]; ethics: string[] }>();
  const ideoDir = join(gameRoot, "common", "ideologies");
  for (const file of txtFiles(ideoDir)) {
    let root: Block;
    try {
      root = await parseClausewitzFile(join(ideoDir, file));
    } catch (err) {
      warnings.push(`ideology file unparsed: ${file} (${err})`);
      continue;
    }
    for (const [key, value] of Object.entries(root)) {
      if (key.startsWith("@") || key === "inline_script") continue;
      const block = lastBlock(value);
      if (!block) continue;
      const ex = await expandInlineScripts(block, gameRoot, warnings);
      const faction = firstString(ex.faction);
      if (!faction) continue;
      const entry = ideoByFaction.get(faction) ?? { ideologies: [], ethics: [] };
      entry.ideologies.push(key);
      const ethic = firstString(ex.ethic);
      if (ethic) entry.ethics.push(ethic);
      ideoByFaction.set(faction, entry);
    }
  }

  const resolveIcon = (sprite: string, owner: string): string | null => {
    const tex = sprites.get(sprite);
    if (!tex) {
      warnings.push(`faction "${owner}": sprite ${sprite} has no texture`);
      return null;
    }
    const norm = tex.replace(/\\/g, "/");
    if (!norm.toLowerCase().startsWith(FACTION_ICON_PREFIX)) {
      warnings.push(`faction "${owner}": texture outside factions icon dir refused: ${norm}`);
      return null;
    }
    const stem = norm.slice(norm.lastIndexOf("/") + 1).replace(/\.dds$/i, "");
    if (!convertedStems.has(stem)) {
      warnings.push(`faction "${owner}": texture ${stem} was not converted`);
      return null;
    }
    return `_factiontype_${stem}.webp`;
  };

  const resolveName = (nameKey: string, key: string): string => {
    const raw = locMap.get(nameKey);
    if (raw !== undefined) return resolveDisplayText(raw, locMap);
    const own = locMap.get(key);
    if (own !== undefined) return resolveDisplayText(own, locMap);
    warnings.push(`faction "${key}": no localisation for ${nameKey} or ${key}; using raw key`);
    return key;
  };

  // --- factions ---
  const byKey = new Map<string, FactionType>();
  const facDir = join(gameRoot, "common", "pop_faction_types");
  for (const file of txtFiles(facDir)) {
    if (file.toLowerCase().includes("documentation")) continue;
    let root: Block;
    try {
      root = await parseClausewitzFile(join(facDir, file));
      root = await expandInlineScripts(root, gameRoot, warnings);
    } catch (err) {
      warnings.push(`faction file unparsed: ${file} (${err})`);
      continue;
    }
    for (const [key, value] of Object.entries(root)) {
      if (key.startsWith("@") || key === "inline_script") continue;
      const raw = lastBlock(value);
      if (!raw) continue;
      const block = await expandInlineScripts(raw, gameRoot, warnings);

      const swaps = normalizeToArray(block.swappable_data as unknown | unknown[] | undefined).filter(isBlock);
      let nameKey: string | null = null;
      let iconSprite: string | null = null;
      for (const sw of swaps) {
        const def = lastBlock(sw.default);
        nameKey ??= firstString(def?.name, sw.name);
        iconSprite ??= firstString(def?.icon, sw.icon);
      }
      nameKey ??= `pft_${key}`;
      iconSprite ??= `GFX_faction_icon_${key}`;

      let ideologicalName: string | null = null;
      let ideologicalIcon: string | null = null;
      for (const sw of swaps) {
        for (const st of normalizeToArray(sw.swap_type as unknown | unknown[] | undefined)) {
          if (!isBlock(st)) continue;
          const trig = lastBlock(st.trigger);
          if (!trig || firstString(trig.exists) !== "ideology") continue;
          const n = firstString(st.name);
          const ic = firstString(st.icon);
          if (n) {
            const rawName = locMap.get(n);
            ideologicalName = rawName !== undefined ? resolveDisplayText(rawName, locMap) : null;
            if (rawName === undefined) warnings.push(`faction "${key}": no localisation for ${n}`);
          }
          if (ic) ideologicalIcon = resolveIcon(ic, key);
        }
      }

      const ideo = ideoByFaction.get(key);
      byKey.set(key, {
        key,
        name: resolveName(nameKey, key),
        icon: resolveIcon(iconSprite, key),
        guidingEthic: firstString(block.guiding_ethic),
        ideologies: sortedUnique(ideo?.ideologies ?? []),
        ideologyEthics: sortedUnique(ideo?.ethics ?? []),
        ideologicalName,
        ideologicalIcon,
      });
    }
  }

  const factions = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { factions, warnings };
}
