import type { TechSnapshot, Tech } from "../../types/tech-snapshot";

/**
 * Event / dig-site "source" parent nodes for Explore.
 *
 * Some techs aren't researched — they're granted by a specific event or an
 * archaeological dig site (see pipeline/src/parser/event-grants.ts, which writes
 * `tech.source`). To make that visible, we synthesize a SOURCE pseudo-tech per
 * referenced source and prepend it to each granted tech's prerequisites, so the
 * source renders as a PARENT card of the tech — exactly like the ascension-perk
 * parents. Augments only the Explore snapshot; the banded Map keeps the real one.
 */

/** Node-key prefix for a synthetic source pseudo-tech (never a real tech). */
export const SOURCE_PREFIX = "src:";
export const isSourceKey = (key: string): boolean => key.startsWith(SOURCE_PREFIX);

/** "event" | "site" for a synthetic source key, or null if it isn't one. */
export function sourceKindOf(key: string): "event" | "site" | null {
  if (!isSourceKey(key)) return null;
  const kind = key.slice(SOURCE_PREFIX.length).split(":")[0];
  return kind === "event" || kind === "site" ? kind : null;
}

/** Stable key for a tech's source: `src:<type>:<id>`. */
function sourceKey(source: NonNullable<Tech["source"]>): string {
  return `${SOURCE_PREFIX}${source.type}:${source.id}`;
}

/** A source pseudo-tech — carries the source icon + name; everything else neutral. */
function makeSourceTech(source: NonNullable<Tech["source"]>): Tech {
  return {
    key: sourceKey(source),
    area: "physics",
    category: [],
    tier: 0,
    cost: 0,
    weight: 0,
    prerequisites: [],
    unlocks: { grants: [], leadsTo: [] },
    dlc: null,
    flags: {
      isRare: false,
      isDangerous: false,
      isRepeatable: false,
      isStarting: false,
      isInsight: false,
    },
    name: source.name,
    description: source.type === "site" ? "Archaeology Site" : "Event",
    icon: source.type === "site" ? "_source_site.webp" : "_source_event.webp",
    gate: null,
    source: null,
  };
}

/**
 * Return a snapshot where every event/site-granted tech gains its source as a
 * (first) prerequisite, plus one synthetic source pseudo-tech per referenced
 * source. Returns the original snapshot unchanged when nothing has a source.
 */
export function augmentSnapshotWithEventSources(snapshot: TechSnapshot): TechSnapshot {
  const techs: Record<string, Tech> = {};
  const sourcesUsed = new Map<string, NonNullable<Tech["source"]>>();
  for (const [key, tech] of Object.entries(snapshot.techs)) {
    if (tech.source) {
      const sk = sourceKey(tech.source);
      sourcesUsed.set(sk, tech.source);
      techs[key] = { ...tech, prerequisites: [sk, ...tech.prerequisites] };
    } else {
      techs[key] = tech;
    }
  }
  if (sourcesUsed.size === 0) return snapshot;
  for (const [sk, source] of sourcesUsed) techs[sk] = makeSourceTech(source);
  return { ...snapshot, techs };
}
