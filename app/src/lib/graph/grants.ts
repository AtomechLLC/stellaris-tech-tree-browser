/**
 * Grant-line formatter — upgrades the snapshot's raw unlock strings into
 * wiki-style effect lines at render time:
 *
 *   "army_damage_mult: 0.05"       → "+5% Army Damage"
 *   "planet_crime_mult: -0.15"     → "−15% Planet Crime"
 *   "country_edict_fund_add: 20"   → "+20 Country Edict Fund"
 *   "espionage"                    → "Unlocks Espionage"
 *
 * The currently-shipped v4.5.0 snapshot predates the pipeline's own formatter
 * (unlocks.ts::formatStatGrant — which additionally resolves the game's
 * `mod_<key>` localisation for exact stat names); this mirrors its VALUE
 * conventions so users get readable lines without a data regen, and becomes a
 * harmless no-op passthrough once regenerated data ships pre-formatted lines.
 * Anything that doesn't match the raw `key: value` / bare-token shapes passes
 * through untouched. PURE (unit-tested, no DOM).
 */

/** Title Case a snake_case token ("all_technology_research_speed" →
 *  "All Technology Research Speed"). */
function prettifyToken(token: string): string {
  return token
    .split("_")
    .filter(Boolean)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Raw stat line: `some_modifier_key: -0.15` (key must be a bare token). */
const STAT_LINE = /^([A-Za-z][A-Za-z0-9_]*): (-?\d+(?:\.\d+)?)$/;
/** Bare feature-flag token: `espionage`, `sustain_cosmic_storm_unlocked`. */
const BARE_TOKEN = /^[a-z][a-z0-9_]*$/;

/**
 * Format one numeric stat as a wiki-style effect line. Value convention
 * (mirrors the game/wiki): `_add`-style modifiers are flat numbers, everything
 * else is a percentage — with "flat when |v| ≥ 2" as the tiebreak for the few
 * unsuffixed flat stats (add_base_country_intel, restored_node_bonus_skill).
 */
function formatStat(key: string, value: number): string {
  const name = prettifyToken(key.replace(/_(add|mult)$/, "").replace(/^add_/, ""));
  const flat = /_add$/.test(key) || /^add_/.test(key) || Math.abs(value) >= 2;
  // Clean float noise (0.05 * 100 → 5.000000000000001).
  const num = flat ? value : Math.round(value * 10000) / 100;
  const sign = num < 0 ? "−" : "+";
  return `${sign}${Math.abs(num)}${flat ? "" : "%"} ${name}`;
}

/** Upgrade one raw grant line to display form (pass-through when already readable). */
export function formatGrantLine(line: string): string {
  const stat = line.match(STAT_LINE);
  if (stat) return formatStat(stat[1], Number(stat[2]));
  if (BARE_TOKEN.test(line)) {
    const stripped = line.replace(/^(unlock|allow)_/, "").replace(/_unlocked$/, "");
    return `Unlocks ${prettifyToken(stripped)}`;
  }
  return line;
}

/**
 * Split a formatted line into its leading value ("+5%", "−20", …) and the rest,
 * so the UI can emphasize the number. Null parts when the line has no leading
 * signed value (an "Unlocks …" line or free text).
 */
export function splitGrantValue(line: string): { value: string | null; rest: string } {
  const m = line.match(/^([+−]\d[\d.,]*%?)\s(.+)$/);
  return m ? { value: m[1], rest: m[2] } : { value: null, rest: line };
}
