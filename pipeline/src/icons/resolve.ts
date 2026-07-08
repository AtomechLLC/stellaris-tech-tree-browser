/**
 * Icon source resolution (DATA-04, D-10).
 *
 * Resolves a tech's source `.dds` icon path(s) on disk, honoring the
 * resolution order verified in RESEARCH.md:
 *   1. An explicit `icon = "<name>"` override field on the tech itself
 *      (confirmed present, e.g. tech_archeology_lab_ancrel uses a
 *      different tech's icon name via `icon = "tech_archeology_lab"`) —
 *      the value is an ICON NAME, resolved under
 *      gfx/interface/icons/technologies/<name>.dds, NOT the tech's own key.
 *   2. Else, the naming convention gfx/interface/icons/technologies/<tech_key>.dds.
 *   3. Additionally (not exclusively — swaps are reported ALONGSIDE the base
 *      icon, per D-10 "export base icon per tech, and swap-variant icons
 *      alongside where present"): each technology_swap entry's `name` field
 *      refers to ANOTHER tech key. When that swap sets `inherit_icon = no`
 *      it ships its own <swap_name>.dds file; when `inherit_icon = yes` (or
 *      omitted) it deliberately has no separate icon file and reuses the
 *      base icon — such swaps are correctly omitted from the swaps list
 *      here (there is nothing to resolve; the caller already has the base).
 *
 * Every path is built via node:path.join on plain string segments and only
 * ever passed to fs existence checks — never interpolated into a shell
 * string (T-04-01 mitigation carries through to convert.ts, which is the
 * only module that shells out).
 *
 * Missing files resolve to `null` (base) or are omitted (swaps) rather than
 * throwing — the caller (convert.ts / assemble.ts) handles absence via the
 * shipped placeholder, per D-13.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeToArray } from "../parser/clausewitz.js";

const ICONS_SUBDIR = join("gfx", "interface", "icons", "technologies");

/**
 * Icon names come from game files (`icon = "..."` overrides, `technology_swap`
 * names) and are attacker-controlled under a hostile/modded game root
 * (threat T-01-01). Confine them to a safe character class BEFORE building a
 * read path so a value like `..\..\secret` cannot escape the icons dir and
 * publish arbitrary file content into the output artifact. The class excludes
 * path separators, so no traversal is possible; it mirrors the write-side
 * `SAFE_NAME` guard in assemble.ts.
 */
const SAFE_ICON_NAME = /^[a-zA-Z0-9_\-@.]+$/;

/** Mirrors the verified real shape of a `technology_swap` block (RESEARCH.md). */
export interface TechSwap {
  name: string;
  inherit_icon?: boolean;
  inherit_effects?: boolean;
  trigger?: unknown;
}

/** Minimal shape this module needs from a tech's raw parsed record. */
export interface IconResolvableTech {
  key: string;
  icon?: string | null;
  technology_swap?: TechSwap | TechSwap[];
}

export interface ResolvedSwapIcon {
  name: string;
  path: string;
}

export interface ResolvedIconSource {
  /** Source .dds path for the tech's own/base icon, or null if none exists on disk. */
  base: string | null;
  /** Swap-variant icon sources that have their own .dds file (inherit_icon = no) and exist on disk. */
  swaps: ResolvedSwapIcon[];
}

function iconPath(gameRoot: string, iconName: string): string {
  return join(gameRoot, ICONS_SUBDIR, `${iconName}.dds`);
}

function resolveIfExists(gameRoot: string, iconName: string): string | null {
  if (!SAFE_ICON_NAME.test(iconName)) return null;
  const path = iconPath(gameRoot, iconName);
  return existsSync(path) ? path : null;
}

/**
 * Resolves a tech's icon source(s): the base icon (override > convention)
 * plus any technology_swap variants that ship their own .dds file.
 */
export function resolveIconSource(tech: IconResolvableTech, gameRoot: string): ResolvedIconSource {
  const overrideName = typeof tech.icon === "string" && tech.icon.length > 0 ? tech.icon : null;
  const baseName = overrideName ?? tech.key;
  const base = resolveIfExists(gameRoot, baseName);

  const swaps: ResolvedSwapIcon[] = [];
  const swapEntries = normalizeToArray(tech.technology_swap);
  for (const swap of swapEntries) {
    if (!swap || typeof swap.name !== "string") continue;
    // inherit_icon = yes (or omitted, i.e. undefined/default) means the swap
    // deliberately has no icon file of its own — nothing to resolve here.
    if (swap.inherit_icon === true || swap.inherit_icon === undefined) continue;
    const swapPath = resolveIfExists(gameRoot, swap.name);
    if (swapPath) swaps.push({ name: swap.name, path: swapPath });
  }

  return { base, swaps };
}
