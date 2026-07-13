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

/** One star system on the galaxy minimap. Coordinates are the save's raw
 *  values — the renderer flips x (in-game map convention, same as stellarmaps). */
export interface GalaxySystem {
  x: number;
  y: number;
  /** Owning country id (matches SavedEmpire.id), or null if unclaimed. */
  ownerId: number | null;
}

/** A nomad structure on the minimap — waystations and arc ships are starbases
 *  (`starbase_level_waystation_*` / `starbase_level_*arkship_*`) that can sit
 *  in systems the empire does NOT own, so they get their own markers. */
export interface GalaxyMarker {
  x: number;
  y: number;
  ownerId: number;
  kind: "waystation" | "arcship";
}

export interface SavGalaxy {
  systems: GalaxySystem[];
  /** Hyperlanes as index pairs into `systems` (deduped, one entry per lane). */
  lanes: Array<[number, number]>;
  /** Nomad waystation / arc-ship locations (empty for saves without nomads). */
  markers: GalaxyMarker[];
}

export interface SavLoadResult {
  empires: SavedEmpire[];
  /** Galaxy map data for the minimap, or null if the save had none. */
  galaxy: SavGalaxy | null;
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

  // Pop-group ethics fallback (Stellaris 4.x pop rework): some saves carry no
  // `country.ethos` — pop ETHICS live on pop groups instead, keyed by species
  // (`pop_group.key = { species, ethos = { ethic } }`). Aggregate per country:
  // planet owner → pop groups on that planet → per-species ethic totals. The
  // empire's "first species" = its largest population; its ethics stand in
  // for the missing governing ethos.
  const planetOwner = new Map<number, number>();
  const planetsTable = isObj(root.planets) ? (root.planets as Record<string, any>).planet : null;
  if (isObj(planetsTable)) {
    for (const [pid, p] of Object.entries(planetsTable)) {
      if (/^\d+$/.test(pid) && isObj(p) && typeof (p as Record<string, any>).owner === "number") {
        planetOwner.set(Number(pid), (p as Record<string, any>).owner);
      }
    }
  }
  /** country → species → { size, per-ethic sizes } */
  const popEthics = new Map<number, Map<number, { size: number; ethics: Map<string, number> }>>();
  if (isObj(root.pop_groups)) {
    for (const g of Object.values(root.pop_groups as Record<string, any>)) {
      if (!isObj(g) || typeof g.planet !== "number") continue;
      const owner = planetOwner.get(g.planet);
      if (owner === undefined) continue;
      const key = (g as Record<string, any>).key;
      if (!isObj(key) || typeof key.species !== "number") continue;
      const size = typeof g.size === "number" ? g.size : 0;
      const ethics = isObj(key.ethos)
        ? toArr((key.ethos as Record<string, any>).ethic).filter((e): e is string => typeof e === "string")
        : [];
      let bySpecies = popEthics.get(owner);
      if (!bySpecies) popEthics.set(owner, (bySpecies = new Map()));
      let entry = bySpecies.get(key.species);
      if (!entry) bySpecies.set(key.species, (entry = { size: 0, ethics: new Map() }));
      entry.size += size;
      for (const e of ethics) entry.ethics.set(e, (entry.ethics.get(e) ?? 0) + size);
    }
  }
  /** Ethics of a country's "first" species — the FOUNDER species when its id
   *  is known (country.founder_species_ref indexes species_db as-is), else the
   *  largest ethic-carrying population. Largest pop shares first. */
  const speciesEthicsFor = (countryId: number, founderRef: number | null): string[] => {
    const bySpecies = popEthics.get(countryId);
    if (!bySpecies) return [];
    let entry = founderRef !== null ? bySpecies.get(founderRef) : undefined;
    if (!entry || entry.ethics.size === 0) {
      let top: { size: number; ethics: Map<string, number> } | null = null;
      for (const e of bySpecies.values()) {
        if (e.ethics.size > 0 && (!top || e.size > top.size)) top = e;
      }
      entry = top ?? undefined;
    }
    if (!entry) return [];
    return [...entry.ethics.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
  };

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

      const idNum = Number(key);
      const gov = isObj(c.government) ? (c.government as Record<string, any>) : {};
      // Ethics live under `ethos = { ethic = "ethic_x" ethic = "ethic_y" }` —
      // the key is `ethic` (singular, repeated → jomini array), NOT `ethics`.
      // (Reading the wrong key silently emptied every empire's ethics, which
      // also broke has_ethic gate evaluation.)
      let ethics: string[] = [];
      if (isObj(c.ethos)) for (const e of toArr(c.ethos.ethic)) if (typeof e === "string") ethics.push(e);
      // No governing ethos in this save → fall back to the ethics of the
      // empire's first (founder) species from its pop groups.
      if (ethics.length === 0) {
        const founderRef = typeof c.founder_species_ref === "number" ? c.founder_species_ref : null;
        ethics = speciesEthicsFor(idNum, founderRef);
      }
      // Ascension perks — a flat list of `ap_*` ids on the country. Drives the
      // gate check `has_ascension_perk` (e.g. Cosmogenesis crisis techs).
      const perks = toArr(c.ascension_perks).filter((x): x is string => typeof x === "string");

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

  return { empires, galaxy: extractGalaxy(root), parseMs: performance.now() - t0 };
}

/**
 * Galaxy minimap data: every system's position + owning country.
 *
 * Ownership follows the chain stellarmaps uses (processSystemOwnership.ts):
 * a system's first starbase → its `station` SHIP → that ship's fleet → the
 * country whose `fleets_manager.owned_fleets` lists the fleet. (Starbases
 * carry no `owner` field themselves.)
 */
function extractGalaxy(root: Record<string, any>): SavGalaxy | null {
  const objects = root.galactic_object;
  if (!isObj(objects)) return null;

  const fleetToCountry = new Map<number, number>();
  if (isObj(root.country)) {
    for (const [cid, c] of Object.entries(root.country)) {
      if (!/^\d+$/.test(cid) || !isObj(c)) continue;
      const mgr = (c as Record<string, any>).fleets_manager;
      if (!isObj(mgr)) continue;
      for (const of of toArr(mgr.owned_fleets)) {
        if (isObj(of) && typeof of.fleet === "number") fleetToCountry.set(of.fleet, Number(cid));
      }
    }
  }

  const starbases = isObj(root.starbase_mgr) ? (root.starbase_mgr as Record<string, any>).starbases : null;
  const ships = root.ships;

  /** Resolve a starbase entry's owning country via station ship → fleet. */
  const starbaseOwner = (sb: unknown): number | null => {
    const ship =
      isObj(sb) && typeof (sb as Record<string, any>).station === "number" && isObj(ships)
        ? (ships as Record<string, any>)[(sb as Record<string, any>).station]
        : null;
    return isObj(ship) && typeof ship.fleet === "number" ? fleetToCountry.get(ship.fleet) ?? null : null;
  };

  // One pass over the starbase table: which ids are nomad structures, and who
  // owns them. Waystations sit in systems their owner does NOT control (they
  // appear in that system's `starbases` list); arc ships are MOBILE and never
  // appear in any system's list — their position comes from the station
  // ship's coordinate instead (resolved after the system pass below).
  const nomadById = new Map<number, { kind: GalaxyMarker["kind"]; ownerId: number }>();
  const arcships: Array<{ ownerId: number; origin: number | null; x: number | null; y: number | null }> = [];
  if (isObj(starbases)) {
    for (const [sbKey, sb] of Object.entries(starbases)) {
      if (!/^\d+$/.test(sbKey) || !isObj(sb)) continue;
      const level = (sb as Record<string, any>).level;
      if (typeof level !== "string") continue;
      const kind = /waystation/i.test(level) ? "waystation" : /arkship/i.test(level) ? "arcship" : null;
      if (!kind) continue;
      const ownerId = starbaseOwner(sb);
      if (ownerId === null) continue;
      nomadById.set(Number(sbKey), { kind, ownerId });
      if (kind === "arcship") {
        const ship =
          typeof (sb as Record<string, any>).station === "number" && isObj(ships)
            ? (ships as Record<string, any>)[(sb as Record<string, any>).station]
            : null;
        const coord = isObj(ship) ? (ship as Record<string, any>).coordinate : null;
        arcships.push({
          ownerId,
          // 4294967295 (u32 "none") = in deep space between systems.
          origin:
            isObj(coord) && typeof coord.origin === "number" && coord.origin !== 4294967295
              ? coord.origin
              : null,
          x: isObj(coord) && typeof coord.x === "number" ? coord.x : null,
          y: isObj(coord) && typeof coord.y === "number" ? coord.y : null,
        });
      }
    }
  }

  const systems: GalaxySystem[] = [];
  const markers: GalaxyMarker[] = [];
  const indexById = new Map<number, number>();
  // Raw hyperlane endpoints (system ids), converted to indexes after the pass.
  const rawLanes: Array<[number, number]> = [];

  for (const [key, val] of Object.entries(objects)) {
    if (!/^\d+$/.test(key) || !isObj(val)) continue;
    const sys = val as Record<string, any>;
    const coord = sys.coordinate;
    if (!isObj(coord) || typeof coord.x !== "number" || typeof coord.y !== "number") continue;
    const id = Number(key);
    const sysStarbases = toArr(sys.starbases).filter((v): v is number => typeof v === "number");

    // System ownership: the FIRST starbase only (stellarmaps' rule) — extra
    // starbases in the list are guest structures, not claims. A nomad
    // structure as starbases[0] claims nothing either (nomads are landless).
    let ownerId: number | null = null;
    const sb0 = sysStarbases[0];
    if (sb0 !== undefined && !nomadById.has(sb0) && isObj(starbases)) {
      ownerId = starbaseOwner((starbases as Record<string, any>)[sb0]);
    }

    // Waystation markers: ANY starbase in the system's list that's one. (Arc
    // ships are handled after this loop — they're never in these lists.)
    for (const sbId of sysStarbases) {
      const nomad = nomadById.get(sbId);
      if (nomad && nomad.kind === "waystation") {
        markers.push({ x: coord.x, y: coord.y, ownerId: nomad.ownerId, kind: nomad.kind });
      }
    }

    indexById.set(id, systems.length);
    systems.push({ x: coord.x, y: coord.y, ownerId });

    for (const lane of toArr(sys.hyperlane)) {
      // Keep each lane once (each side lists the other): only the id < to side.
      if (isObj(lane) && typeof lane.to === "number" && id < lane.to) rawLanes.push([id, lane.to]);
    }
  }
  if (systems.length === 0) return null;

  const lanes: Array<[number, number]> = [];
  for (const [a, b] of rawLanes) {
    const ia = indexById.get(a);
    const ib = indexById.get(b);
    if (ia !== undefined && ib !== undefined) lanes.push([ia, ib]);
  }

  // Arc ships: in a system (origin = system id) → that system's coordinate;
  // in deep space (no origin) → the ship's own coordinate IS galactic.
  for (const arc of arcships) {
    const sysIdx = arc.origin !== null ? indexById.get(arc.origin) : undefined;
    if (sysIdx !== undefined) {
      const s = systems[sysIdx]!;
      markers.push({ x: s.x, y: s.y, ownerId: arc.ownerId, kind: "arcship" });
    } else if (arc.x !== null && arc.y !== null) {
      markers.push({ x: arc.x, y: arc.y, ownerId: arc.ownerId, kind: "arcship" });
    }
  }

  return { systems, lanes, markers };
}
