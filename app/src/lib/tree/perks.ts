import type { TechSnapshot, Tech } from "../../types/tech-snapshot";

/**
 * Ascension-perk parent nodes for Explore.
 *
 * Some techs are gated behind an ascension perk (`potential = { has_ascension_perk
 * = ap_… }`) rather than a prerequisite tech — the "Become the Crisis" / Cosmogenesis
 * (a.k.a. Ambition / Crisis) lines. To make that requirement visible, we synthesize a
 * PERK pseudo-tech per referenced perk and prepend it to each gated tech's
 * prerequisites, so the perk's hexagon renders as a PARENT card of the tech and the
 * rest of the layout treats it like any other node.
 *
 * This augments only the snapshot handed to the Explore layouts (browse + focus);
 * the banded Map keeps the real snapshot.
 */

/** Node-key prefix for a synthetic perk pseudo-tech (never a real tech). */
export const PERK_PREFIX = "perk:";
export const isPerkKey = (key: string): boolean => key.startsWith(PERK_PREFIX);

/** Localised perk display names (from the game loc). */
const PERK_NAMES: Record<string, string> = {
  ap_cosmogenesis: "Cosmogenesis",
  ap_become_the_crisis: "Galactic Nemesis",
};

/** Pretty-print an unknown perk id ("ap_foo_bar" → "Foo Bar"). */
function prettify(perkId: string): string {
  return perkId
    .replace(/^ap_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** First `has_ascension_perk` value in a gate tree, or null. */
function perkOfGate(gate: Tech["gate"]): string | null {
  if (!gate) return null;
  if (gate.op === "leaf") {
    return gate.trigger === "has_ascension_perk" ? String(gate.value) : null;
  }
  for (const child of gate.children) {
    const p = perkOfGate(child);
    if (p) return p;
  }
  return null;
}

/** A perk pseudo-tech — carries the hexagon icon + name; everything else neutral. */
function makePerkTech(perkId: string): Tech {
  return {
    key: `${PERK_PREFIX}${perkId}`,
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
    name: PERK_NAMES[perkId] ?? prettify(perkId),
    description: "Ascension perk",
    icon: `_perk_${perkId}.webp`,
    gate: null,
    source: null,
  };
}

/**
 * Return a snapshot where every perk-gated tech gains its perk as a (first)
 * prerequisite, plus one synthetic perk pseudo-tech per referenced perk. Returns
 * the original snapshot unchanged when nothing is perk-gated.
 */
export function augmentSnapshotWithPerks(snapshot: TechSnapshot): TechSnapshot {
  const techs: Record<string, Tech> = {};
  const perksUsed = new Set<string>();
  for (const [key, tech] of Object.entries(snapshot.techs)) {
    const perk = perkOfGate(tech.gate);
    if (perk) {
      perksUsed.add(perk);
      techs[key] = { ...tech, prerequisites: [`${PERK_PREFIX}${perk}`, ...tech.prerequisites] };
    } else {
      techs[key] = tech;
    }
  }
  if (perksUsed.size === 0) return snapshot;
  for (const perk of perksUsed) techs[`${PERK_PREFIX}${perk}`] = makePerkTech(perk);
  return { ...snapshot, techs };
}
