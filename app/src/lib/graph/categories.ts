import type { Tech } from "../../types/tech-snapshot";

/**
 * Single source of truth for the 13 tech categories that become swimlanes,
 * nested within the 3 research areas. Reused by:
 *   - swimlanes.ts  (lane ordering + geometry)
 *   - CategoryAxis  (lane labels)
 *   - TechCardOverlay (card `Category – Tier` line)
 *   - Legend        (category grouping)
 *
 * Order is authoritative: area order top→bottom is physics → society →
 * engineering (matches the game's own research-area order and the existing
 * area-band remap), and within each area the categories are listed in the
 * order they should stack vertically. Verified counts against
 * app/public/data/v4.5.0/tech.json (see PLAN Data facts).
 */

type Area = Tech["area"];

/** The 13 category keys in swimlane stacking order (top→bottom). */
export const CATEGORY_ORDER = [
  // physics
  "computing",
  "field_manipulation",
  "particles",
  // society
  "biology",
  "statecraft",
  "military_theory",
  "new_worlds",
  "archaeostudies",
  "psionics",
  // engineering
  "industry",
  "materials",
  "propulsion",
  "voidcraft",
] as const;

export type CategoryKey = (typeof CATEGORY_ORDER)[number];

/** category key → its parent research area (drives area grouping + color). */
export const CATEGORY_AREA: Record<CategoryKey, Area> = {
  computing: "physics",
  field_manipulation: "physics",
  particles: "physics",
  biology: "society",
  statecraft: "society",
  military_theory: "society",
  new_worlds: "society",
  archaeostudies: "society",
  psionics: "society",
  industry: "engineering",
  materials: "engineering",
  propulsion: "engineering",
  voidcraft: "engineering",
};

/** category key → Title-Case display name for labels/cards/legend. */
export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  computing: "Computing",
  field_manipulation: "Field Manipulation",
  particles: "Particles",
  biology: "Biology",
  statecraft: "Statecraft",
  military_theory: "Military Theory",
  new_worlds: "New Worlds",
  archaeostudies: "Archaeostudies",
  psionics: "Psionics",
  industry: "Industry",
  materials: "Materials",
  propulsion: "Propulsion",
  voidcraft: "Voidcraft",
};

/** Ordered category index (0..12) — stable rank used to sort lanes. */
export const CATEGORY_INDEX: Record<string, number> = Object.fromEntries(
  CATEGORY_ORDER.map((key, i) => [key, i]),
);

/**
 * Human-safe display label for any category key, falling back to a
 * Title-Cased version of the raw key if the game ever adds a category not yet
 * in CATEGORY_LABEL (so an unknown category renders readably instead of a
 * blank/undefined label). Plain text only.
 */
export function categoryLabel(key: string): string {
  const known = CATEGORY_LABEL[key as CategoryKey];
  if (known) return known;
  return key
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}
