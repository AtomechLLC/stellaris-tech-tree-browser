/**
 * Saved Empire (spike 005) — client-side .sav loader.
 *
 * Ported from spike 004 (`.planning/spikes/004-browser-port/browser-main.ts`),
 * proven at ~4.4 s / 271 MB on the real 72 MB gamestate. Unzips the .sav with
 * fflate, parses the gamestate with jomini (base64-inlined WASM → bundles under
 * Vite), and extracts each empire's identity + researched techs.
 *
 * NOTE (spike): jomini + fflate land in the app's main bundle here. The real
 * build should lazy-load this module so the tree app isn't paying for the parser
 * until the user opens the Saved Empire tab.
 */
import { unzipSync } from "fflate";
import { Jomini } from "jomini";
import type { RawEmpire } from "./gates";

export interface SavedEmpire extends RawEmpire {
  id: number;
  name: string;
  playerName: string | null;
  researchedCount: number;
}

export interface SavLoadResult {
  empires: SavedEmpire[];
  parseMs: number;
}

let parser: Jomini | null = null;

function toArr<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Full client-side pipeline: raw .sav bytes → list of empires. */
export async function loadEmpiresFromSav(savBytes: Uint8Array): Promise<SavLoadResult> {
  if (!parser) parser = await Jomini.initialize();
  const t0 = performance.now();

  const files = unzipSync(savBytes);
  const gs = files["gamestate"];
  if (!gs) throw new Error("This .sav has no gamestate entry — is it a valid Stellaris save?");

  let text = new TextDecoder("windows-1252").decode(gs);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const parsed = parser.parseText(`__root__ = {\n${text}\n}`, { encoding: "windows1252" }) as Record<string, any>;
  const root = parsed.__root__ ?? {};

  const playerByCountry = new Map<number, string>();
  for (const p of toArr(root.player)) {
    if (isObj(p) && typeof p.country === "number" && typeof p.name === "string") {
      playerByCountry.set(p.country, p.name);
    }
  }

  const countries = root.country;
  const empires: SavedEmpire[] = [];
  if (isObj(countries)) {
    for (const [key, val] of Object.entries(countries)) {
      if (!/^\d+$/.test(key) || !isObj(val)) continue;
      const c = val as Record<string, any>;

      const researched: string[] = [];
      if (isObj(c.tech_status)) {
        const techs = toArr(c.tech_status.technology).filter((t): t is string => typeof t === "string");
        const levels = toArr(c.tech_status.level);
        techs.forEach((tk, i) => {
          if ((typeof levels[i] === "number" ? levels[i] : 1) >= 1) researched.push(tk);
        });
      }
      if (researched.length === 0) continue; // skip empty/degenerate country entries

      const gov = isObj(c.government) ? (c.government as Record<string, any>) : {};
      const ethics: string[] = [];
      if (isObj(c.ethos)) for (const e of toArr(c.ethos.ethics)) if (typeof e === "string") ethics.push(e);
      // Ascension perks — a flat list of `ap_*` ids on the country. Drives the
      // gate check `has_ascension_perk` (e.g. Cosmogenesis crisis techs).
      const perks = toArr(c.ascension_perks).filter((x): x is string => typeof x === "string");

      const idNum = Number(key);
      const literal = isObj(c.name) && (c.name.literal === "yes" || c.name.literal === true);
      const rawKey = isObj(c.name) ? (typeof c.name.key === "string" ? c.name.key : null) : null;
      const playerName = playerByCountry.get(idNum) ?? null;

      empires.push({
        id: idNum,
        name: literal && rawKey ? rawKey : playerName ?? rawKey ?? `country_${key}`,
        playerName,
        authority: typeof gov.authority === "string" ? gov.authority : null,
        ethics,
        civics: toArr(gov.civics).filter((x): x is string => typeof x === "string"),
        origin: typeof gov.origin === "string" ? gov.origin : null,
        perks,
        researched,
        researchedCount: researched.length,
      });
    }
  }

  empires.sort((a, b) => {
    if (!!a.playerName !== !!b.playerName) return a.playerName ? -1 : 1;
    return b.researchedCount - a.researchedCount;
  });

  return { empires, parseMs: performance.now() - t0 };
}
