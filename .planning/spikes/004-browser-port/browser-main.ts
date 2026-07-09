/**
 * Spike 004 — browser-port. The final-target question: can we do the WHOLE
 * pipeline client-side — unzip the .sav, parse the 72 MB gamestate, extract
 * empires, and classify — with no server?
 *
 * Reuses the pure logic from spikes 002/003 (gates + classify). jomini's ESM
 * build inlines its WASM as base64, so esbuild bundles this into one self-
 * contained module (no .wasm fetch).
 *
 * Bundle:
 *   pipeline/node_modules/.bin/esbuild .planning/spikes/004-browser-port/browser-main.ts \
 *     --bundle --format=esm --platform=browser \
 *     --outfile=.planning/spikes/004-browser-port/bundle.js
 */
import { unzipSync } from "fflate";
import { Jomini } from "jomini";
import { buildEmpireState, type RawEmpire } from "../002-potential-gates/gates.ts";
import { classifyAll, type TechLite } from "../003-classify-demo/classify.ts";

export interface BrowserEmpire extends RawEmpire {
  id: number;
  name: string;
  playerName: string | null;
  researchedCount: number;
}

function toArr<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

let parser: Jomini | null = null;

export interface ExtractResult {
  empires: BrowserEmpire[];
  timings: { unzipMs: number; decodeMs: number; parseMs: number; extractMs: number; totalMs: number };
  sizes: { zipBytes: number; gamestateBytes: number };
  heapMb: number | null;
}

/** Full client-side pipeline over the raw .sav bytes. */
export async function extractFromSav(savBytes: Uint8Array): Promise<ExtractResult> {
  if (!parser) parser = await Jomini.initialize();
  const t0 = performance.now();

  // 1. unzip
  const files = unzipSync(savBytes);
  const gsBytes = files["gamestate"];
  if (!gsBytes) throw new Error("no gamestate entry in .sav");
  const t1 = performance.now();

  // 2. decode (windows-1252 / latin1, like the pipeline parser)
  let text = new TextDecoder("windows-1252").decode(gsBytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const t2 = performance.now();

  // 3. jomini parse (wrap root like pipeline/src/parser/clausewitz.ts)
  const parsed = parser.parseText(`__root__ = {\n${text}\n}`, { encoding: "windows1252" }) as Record<string, any>;
  const root = parsed.__root__ ?? {};
  const t3 = performance.now();

  // 4. extract empires (same shape as spike 001)
  const playerByCountry = new Map<number, string>();
  for (const p of toArr(root.player)) {
    if (isObj(p) && typeof p.country === "number" && typeof p.name === "string") {
      playerByCountry.set(p.country, p.name);
    }
  }
  const countries = root.country;
  const empires: BrowserEmpire[] = [];
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
      const gov = isObj(c.government) ? (c.government as Record<string, any>) : {};
      const ethics: string[] = [];
      if (isObj(c.ethos)) for (const e of toArr(c.ethos.ethics)) if (typeof e === "string") ethics.push(e);
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
        researched,
        researchedCount: researched.length,
      });
    }
  }
  empires.sort((a, b) => {
    if (!!a.playerName !== !!b.playerName) return a.playerName ? -1 : 1;
    return b.researchedCount - a.researchedCount;
  });
  const t4 = performance.now();

  const mem = (performance as any).memory;
  return {
    empires,
    timings: {
      unzipMs: t1 - t0,
      decodeMs: t2 - t1,
      parseMs: t3 - t2,
      extractMs: t4 - t3,
      totalMs: t4 - t0,
    },
    sizes: { zipBytes: savBytes.length, gamestateBytes: gsBytes.length },
    heapMb: mem ? mem.usedJSHeapSize / 1024 / 1024 : null,
  };
}

// Re-export classify pieces so the page uses the SAME logic.
export { buildEmpireState, classifyAll };
export type { TechLite };
