/**
 * Event- and archaeology-granted tech sources (feature: synthetic "source"
 * parent cards).
 *
 * Some techs are never drawn from the normal research pool — they're handed to
 * the player by a specific event or an archaeological dig site. This scans the
 * game's `events/` and `common/archaeological_site_types/` files for the three
 * grant effects and attributes each granted tech to its source, so the UI can
 * render that source as a synthetic PARENT node (mirroring the ascension-perk
 * parents).
 *
 * SCOPE (deliberately the reliable subset — data accuracy > coverage):
 *   • Detects literal grants only: `give_technology = { tech = X }`,
 *     `add_research_option = X`, `add_tech_progress = { tech = X … }`.
 *   • Does NOT follow scripted_effect indirection ($TECH$-parameterised
 *     helpers) — those grants are simply not attributed.
 *   • Skips "bundle" events that grant more than BUNDLE_MAX techs at once
 *     (catch-up / fallen-empire reward dumps) — they aren't thematic unlocks.
 *   • Attributes to the dig SITE when the granting event belongs to one,
 *     otherwise to the event itself.
 */
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { parseClausewitzFile, normalizeToArray } from "./clausewitz.js";
import { resolveDisplayText } from "../localisation/loc-scanner.js";

export type GrantMechanism = "give" | "option" | "progress";

export interface TechSource {
  type: "event" | "site";
  /** Event id (e.g. "ancrel.2") or archaeological site-type id. */
  id: string;
  /** Localised display name for the parent card. */
  name: string;
  mechanism: GrantMechanism;
}

/** An event granting more distinct techs than this is a bundle reward — skip. */
const BUNDLE_MAX = 4;
/** give (full unlock) > option (forced research offer) > progress (partial). */
const MECH_RANK: Record<GrantMechanism, number> = { give: 3, option: 2, progress: 1 };

interface RawGrant {
  tech: string;
  mech: GrantMechanism;
}

/** Recursively gather every literal tech grant anywhere inside an effect tree.
 *  Exported for unit testing. */
export function collectGrants(node: unknown, out: RawGrant[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectGrants(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    if (key === "add_research_option") {
      for (const v of normalizeToArray(val)) if (typeof v === "string") out.push({ tech: v, mech: "option" });
    } else if (key === "give_technology") {
      for (const g of normalizeToArray(val)) {
        const tech = (g as Record<string, unknown> | undefined)?.tech;
        if (typeof tech === "string") out.push({ tech, mech: "give" });
      }
    } else if (key === "add_tech_progress") {
      for (const g of normalizeToArray(val)) {
        const tech = (g as Record<string, unknown> | undefined)?.tech;
        if (typeof tech === "string") out.push({ tech, mech: "progress" });
      }
    }
    // Recurse into nested blocks (immediate / after / option / if-limit / …).
    collectGrants(val, out);
  }
}

/** Every top-level object carrying an `id` — i.e. each event in the file. */
function eventsInFile(parsed: Record<string, unknown>): Array<{ id: string; obj: Record<string, unknown> }> {
  const events: Array<{ id: string; obj: Record<string, unknown> }> = [];
  for (const val of Object.values(parsed)) {
    for (const entry of normalizeToArray(val)) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const id = (entry as Record<string, unknown>).id;
        if (typeof id === "string") events.push({ id, obj: entry as Record<string, unknown> });
      }
    }
  }
  return events;
}

/**
 * Resolve an event's display title from its `title` loc key (else `<id>.name`),
 * fully expanding nested `$token$` references. Returns null when it can't be
 * resolved to a clean human name — the caller then skips attribution rather than
 * showing a cryptic event id or a raw `$token$` on a parent card.
 */
function resolveEventName(id: string, obj: Record<string, unknown>, loc: Map<string, string>): string | null {
  const title = obj.title;
  const raw = (typeof title === "string" ? loc.get(title) : undefined) ?? loc.get(`${id}.name`);
  if (raw === undefined) return null;
  const name = resolveDisplayText(raw, loc).trim();
  if (!name || name.includes("$") || name === id) return null;
  return name;
}

/** Map each dig-site stage event id → its site's { id, localised name }. */
async function buildEventToSite(
  gameRoot: string,
  loc: Map<string, string>,
): Promise<Map<string, { id: string; name: string }>> {
  const map = new Map<string, { id: string; name: string }>();
  const dir = join(gameRoot, "common", "archaeological_site_types");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".txt"));
  } catch {
    return map; // DLC not installed — no sites
  }
  for (const file of files) {
    let parsed: Record<string, unknown>;
    try {
      parsed = await parseClausewitzFile(join(dir, file));
    } catch {
      continue;
    }
    for (const [siteType, val] of Object.entries(parsed)) {
      if (!val || typeof val !== "object" || Array.isArray(val)) continue;
      const site = val as Record<string, unknown>;
      if (site.stage === undefined && site.stages === undefined) continue; // not a site block
      const rawName = loc.get(siteType) ?? loc.get(`${siteType}_name`);
      const name = rawName ? resolveDisplayText(rawName, loc) : siteType;
      for (const stage of normalizeToArray(site.stage)) {
        const ev = (stage as Record<string, unknown> | undefined)?.event;
        if (typeof ev === "string") map.set(ev, { id: siteType, name });
      }
    }
  }
  return map;
}

/** Prefer a site source over a bare event, then the stronger grant mechanism. */
function isBetter(a: TechSource, b: TechSource): boolean {
  if (a.type !== b.type) return a.type === "site";
  return MECH_RANK[a.mechanism] > MECH_RANK[b.mechanism];
}

/**
 * Scan events + sites and return the best source per granted tech, plus a count
 * of bundle events skipped (for the build report).
 */
export async function extractTechSources(
  gameRoot: string,
  loc: Map<string, string>,
): Promise<{ sources: Map<string, TechSource>; skippedBundles: number; parseFailures: number }> {
  const eventToSite = await buildEventToSite(gameRoot, loc);
  const eventsDir = join(gameRoot, "events");
  let files: string[];
  try {
    files = readdirSync(eventsDir).filter((f) => f.endsWith(".txt"));
  } catch {
    return { sources: new Map(), skippedBundles: 0, parseFailures: 0 };
  }

  const perTech = new Map<string, TechSource>();
  let skippedBundles = 0;
  let parseFailures = 0;

  for (const file of files) {
    let parsed: Record<string, unknown>;
    try {
      parsed = await parseClausewitzFile(join(eventsDir, file));
    } catch {
      parseFailures++;
      continue;
    }
    for (const { id, obj } of eventsInFile(parsed)) {
      const grants: RawGrant[] = [];
      collectGrants(obj, grants);
      if (grants.length === 0) continue;
      // Dedupe within the event, keeping the strongest mechanism per tech.
      const byTech = new Map<string, GrantMechanism>();
      for (const g of grants) {
        const cur = byTech.get(g.tech);
        if (!cur || MECH_RANK[g.mech] > MECH_RANK[cur]) byTech.set(g.tech, g.mech);
      }
      if (byTech.size > BUNDLE_MAX) {
        skippedBundles++;
        continue; // bundle reward — not a thematic single-tech unlock
      }
      const site = eventToSite.get(id);
      // Resolve the parent's display name once per event; skip the whole event's
      // grants when a bare event has no clean name (no cryptic-id parents).
      let candidateBase: Omit<TechSource, "mechanism"> | null;
      if (site) {
        candidateBase = { type: "site", id: site.id, name: site.name };
      } else {
        const name = resolveEventName(id, obj, loc);
        candidateBase = name ? { type: "event", id, name } : null;
      }
      if (!candidateBase) continue;
      for (const [tech, mechanism] of byTech) {
        const candidate: TechSource = { ...candidateBase, mechanism };
        const existing = perTech.get(tech);
        if (!existing || isBetter(candidate, existing)) perTech.set(tech, candidate);
      }
    }
  }

  return { sources: perTech, skippedBundles, parseFailures };
}
