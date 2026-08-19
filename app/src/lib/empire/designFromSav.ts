/**
 * Save → design extractor (D-06/D-07, plan 04-04).
 *
 * Maps a save's `country` / `species_db` / `leaders` / `planets` /
 * `galactic_object` tables onto the `DesignEntry` contract (`designSchema.ts`,
 * plan 04-01) so any empire in a loaded `.sav` — player or AI — can be added
 * to the user's custom empire designs as a complete, game-loadable entry.
 *
 * `toArr`/`isObj` are re-declared here (not imported from `savLoad.ts`)
 * because `savLoad.ts` imports THIS module in plan 04-04's Task 2 — importing
 * back would be a cycle.
 */
import type { DesignEntry, DesignFlag, DesignRuler, DesignSpecies, LocName } from "./designSchema";
import { parseLocName } from "./designSchema";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function toArr<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
function isYes(v: unknown): boolean {
  return v === true || v === "yes";
}

/** `home_planet.reference` uses the u32 "none" sentinel when a species has no
 *  recorded home planet — never resolve a planet lookup against it. */
const HOME_PLANET_NONE = 4294967295;

/**
 * Habitable-class allowlist for `resolvePlanetClass`. `country.capital` can
 * resolve to a non-habitable body (measured: a normal, non-degenerate sampled
 * empire's capital resolved to `pc_b_star`, a STAR — see RESEARCH.md Pitfall
 * 5). Do not simplify this guard away; the star-capital case is a committed
 * test in designFromSav.test.ts.
 */
const HABITABLE_PLANET_CLASSES = new Set([
  "pc_continental",
  "pc_ocean",
  "pc_tropical",
  "pc_arid",
  "pc_desert",
  "pc_savannah",
  "pc_alpine",
  "pc_tundra",
  "pc_arctic",
  "pc_gaia",
  "pc_nuked",
  "pc_machine",
  "pc_hive",
  "pc_city",
  "pc_relic",
  "pc_habitat",
  "pc_ringworld_habitable",
]);

function locNameOrKey(v: unknown, fallbackKey: string): LocName {
  return parseLocName(v) ?? { key: fallbackKey };
}
function locNameOrEmpty(v: unknown): LocName {
  return locNameOrKey(v, "");
}

/** `species_db[ref]` — the raw tagged id (e.g. 536870913) is a valid key as-is;
 *  never mask or index-adjust it. Returns null when absent; the caller then
 *  returns null overall (a design with no species is not describable). */
function resolveSpecies(root: Record<string, any>, ref: number): Record<string, any> | null {
  const db = root.species_db;
  if (!isObj(db)) return null;
  const entry = (db as Record<string, unknown>)[String(ref)];
  return isObj(entry) ? entry : null;
}

function buildSpecies(species: Record<string, any>): DesignSpecies {
  const traitsBlock = species.traits;
  const traits = isObj(traitsBlock)
    ? toArr((traitsBlock as Record<string, any>).trait).filter((t): t is string => typeof t === "string")
    : [];
  return {
    class: typeof species.class === "string" ? species.class : "",
    portrait: typeof species.portrait === "string" ? species.portrait : "",
    species_name: locNameOrEmpty(species.name),
    species_plural: locNameOrEmpty(species.plural),
    species_adjective: locNameOrEmpty(species.adjective),
    name_list: typeof species.name_list === "string" ? species.name_list : "",
    gender: typeof species.gender === "string" ? species.gender : "not_set",
    traits,
  };
}

/**
 * `country.ruler` is a numeric leader id into `leaders`. Two branches (both
 * exercised by tests — Pitfall 4): a leader carrying a `design` snapshot is
 * used directly (byte-shape-exact match for the design file's `ruler={}`);
 * otherwise a ruler block is synthesized from the leader's own fields, with
 * the portrait/texture/attachment/clothes sliders defaulted to 0. A ruler id
 * that resolves to nothing in `leaders` still yields a valid default block —
 * this never throws and never returns a partial ruler.
 */
function resolveRuler(
  root: Record<string, any>,
  rulerId: number | null,
  species: Record<string, any> | null,
): DesignRuler {
  const leaders = root.leaders;
  const leader = rulerId !== null && isObj(leaders) ? (leaders as Record<string, unknown>)[String(rulerId)] : undefined;

  if (isObj(leader) && isObj(leader.design)) {
    const d = leader.design as Record<string, any>;
    const dName = isObj(d.name) ? (d.name as Record<string, any>) : {};
    return {
      gender: typeof d.gender === "string" ? d.gender : "not_set",
      name: {
        full_names: locNameOrEmpty(dName.full_names),
        use_full_regnal_name: isYes(dName.use_full_regnal_name),
      },
      portrait: typeof d.portrait === "string" ? d.portrait : "",
      texture: typeof d.texture === "number" ? d.texture : 0,
      evolution_mask: typeof d.evolution_mask === "number" ? d.evolution_mask : 0,
      attachment: typeof d.attachment === "number" ? d.attachment : 0,
      clothes: typeof d.clothes === "number" ? d.clothes : 0,
      trait: typeof d.trait === "string" ? d.trait : "",
      leader_class: typeof d.leader_class === "string" ? d.leader_class : "official",
    };
  }

  if (isObj(leader)) {
    const traits = toArr(leader.traits).filter((t): t is string => typeof t === "string");
    const trait = traits.find((t) => t.startsWith("leader_trait_")) ?? traits[0] ?? "";
    return {
      gender: typeof leader.gender === "string" ? leader.gender : "not_set",
      name: { full_names: locNameOrEmpty(leader.name), use_full_regnal_name: false },
      portrait:
        typeof leader.portrait === "string"
          ? leader.portrait
          : species && typeof species.portrait === "string"
            ? species.portrait
            : "",
      texture: 0,
      evolution_mask: 0,
      attachment: 0,
      clothes: 0,
      trait,
      leader_class: typeof leader.class === "string" ? leader.class : "official",
    };
  }

  // Ruler id missing from `leaders` entirely — safe defaults, never null.
  return {
    gender: "not_set",
    name: { full_names: { key: "" }, use_full_regnal_name: false },
    portrait: species && typeof species.portrait === "string" ? species.portrait : "",
    texture: 0,
    evolution_mask: 0,
    attachment: 0,
    clothes: 0,
    trait: "",
    leader_class: "official",
  };
}

/**
 * `planet_class` candidates in order: the founder species' home planet, then
 * the country's current capital. Accepts the first candidate in the habitable
 * allowlist; otherwise falls back to `pc_continental` (Pitfall 5 — a capital
 * can resolve to a star, e.g. the measured `pc_b_star` case).
 */
function resolvePlanetClass(
  root: Record<string, any>,
  species: Record<string, any> | null,
  country: Record<string, any>,
): string {
  const planetsTable = isObj(root.planets) ? (root.planets as Record<string, any>).planet : null;
  const candidateIds: number[] = [];

  const homePlanet = species && isObj(species.home_planet) ? (species.home_planet as Record<string, any>) : null;
  if (homePlanet && typeof homePlanet.reference === "number" && homePlanet.reference !== HOME_PLANET_NONE) {
    candidateIds.push(homePlanet.reference);
  }
  if (typeof country.capital === "number") candidateIds.push(country.capital);

  if (isObj(planetsTable)) {
    for (const id of candidateIds) {
      const planet = (planetsTable as Record<string, unknown>)[String(id)];
      if (isObj(planet) && typeof planet.planet_class === "string" && HABITABLE_PLANET_CLASSES.has(planet.planet_class)) {
        return planet.planet_class;
      }
    }
  }
  return "pc_continental";
}

/** `planet_name` from the capital planet's current name; `system_name` from
 *  the capital's system (`galactic_object[coordinate.origin].name`). Neither
 *  has a reliable "original starting name" source in the save — both default
 *  to `{ key: "" }` when unresolvable. */
function resolveCapitalNames(
  root: Record<string, any>,
  country: Record<string, any>,
): { planet_name: LocName; system_name: LocName } {
  const planetsTable = isObj(root.planets) ? (root.planets as Record<string, any>).planet : null;
  const capitalId = typeof country.capital === "number" ? country.capital : null;
  const capitalPlanet =
    capitalId !== null && isObj(planetsTable) ? (planetsTable as Record<string, unknown>)[String(capitalId)] : null;

  const planet_name = isObj(capitalPlanet) ? locNameOrEmpty(capitalPlanet.name) : { key: "" };

  let system_name: LocName = { key: "" };
  if (isObj(capitalPlanet) && isObj(capitalPlanet.coordinate) && typeof capitalPlanet.coordinate.origin === "number") {
    const galObjs = root.galactic_object;
    const sys = isObj(galObjs) ? (galObjs as Record<string, unknown>)[String(capitalPlanet.coordinate.origin)] : null;
    if (isObj(sys)) system_name = locNameOrEmpty(sys.name);
  }
  return { planet_name, system_name };
}

/** `country.flag` read defensively into the `DesignFlag` shape. Colors are
 *  copied as-is — padding the array to six slots is the serializer's job
 *  (04-03), not this module's. */
function resolveFlag(country: Record<string, any>): DesignFlag {
  const flag = isObj(country.flag) ? (country.flag as Record<string, any>) : {};
  const icon = isObj(flag.icon) ? (flag.icon as Record<string, any>) : {};
  const background = isObj(flag.background) ? (flag.background as Record<string, any>) : {};
  return {
    icon: {
      category: typeof icon.category === "string" ? icon.category : "",
      file: typeof icon.file === "string" ? icon.file : "",
    },
    background: {
      category: typeof background.category === "string" ? background.category : "",
      file: typeof background.file === "string" ? background.file : "",
    },
    colors: toArr(flag.colors).filter((c): c is string => typeof c === "string"),
  };
}

/**
 * Map a save country to a complete `DesignEntry`, or `null` when the country
 * is too degenerate to describe (no `government` block, or no resolvable
 * founder species).
 *
 * `opts.displayName` becomes the entry's `key` — the design file's `key` is
 * the plain design name the game editor shows, which for a save-derived
 * empire is the already-resolved `SavedEmpire.name`. `opts.ethics` is the
 * already-resolved ethics list from `savLoad.ts` (including its pop-group
 * fallback); it's used only when `country.ethos.ethic` is absent.
 */
export function extractDesignFromCountry(
  root: Record<string, any>,
  countryId: number,
  opts: { displayName: string; ethics: string[] },
): DesignEntry | null {
  const countries = root.country;
  const country = isObj(countries) ? (countries as Record<string, unknown>)[String(countryId)] : undefined;
  if (!isObj(country)) return null;

  const gov = country.government;
  if (!isObj(gov)) return null; // no government block → not a describable entry

  const founderRef = typeof country.founder_species_ref === "number" ? country.founder_species_ref : null;
  const species = founderRef !== null ? resolveSpecies(root, founderRef) : null;
  if (!species) return null; // no resolvable founder species → not a describable entry

  const rulerId = typeof country.ruler === "number" ? country.ruler : null;
  const ruler = resolveRuler(root, rulerId, species);
  const planet_class = resolvePlanetClass(root, species, country);
  const { planet_name, system_name } = resolveCapitalNames(root, country);

  // Ethics live under `ethos = { ethic = "x" ethic = "y" }` (singular,
  // repeated key), matching savLoad.ts's own gotcha comment. Fall back to the
  // caller's already-resolved (pop-group-aware) ethics list when absent —
  // do not re-implement that aggregation here.
  let ethics: string[] = [];
  if (isObj(country.ethos)) {
    ethics = toArr((country.ethos as Record<string, any>).ethic).filter((e): e is string => typeof e === "string");
  }
  if (ethics.length === 0) ethics = opts.ethics;

  const design: DesignEntry = {
    key: opts.displayName,
    ship_prefix: locNameOrKey(country.ship_prefix, "ISS"),
    species: buildSpecies(species),
    name: locNameOrKey(country.name, opts.displayName),
    adjective: locNameOrKey(country.adjective, opts.displayName),
    authority: typeof gov.authority === "string" ? gov.authority : "",
    government: typeof gov.type === "string" ? gov.type : "",
    is_nomadic: isYes(country.is_nomadic),
    planet_name,
    planet_class,
    system_name,
    initializer: "",
    graphical_culture: typeof country.graphical_culture === "string" ? country.graphical_culture : "",
    city_graphical_culture:
      typeof country.city_graphical_culture === "string" ? country.city_graphical_culture : "",
    empire_flag: resolveFlag(country),
    ruler,
    spawn_as_fallen: false,
    ignore_portrait_duplication: false,
    room: typeof country.room === "string" ? country.room : "default_room",
    spawn_enabled: true,
    ethics,
    civics: toArr(gov.civics).filter((c): c is string => typeof c === "string"),
    origin: typeof gov.origin === "string" ? gov.origin : "",
  };

  // advisor_voice_type is present on only a minority of countries — omit the
  // key entirely when absent (never emit an empty-string placeholder).
  if (typeof country.advisor_voice_type === "string") {
    design.advisor_voice_type = country.advisor_voice_type;
  }

  // secondary_species: intentionally omitted. No save-side source field was
  // located during research (RESEARCH.md Open Question 1 / 04-CONTEXT.md
  // Deferred Ideas) — the resulting entry is still game-loadable without it.
  // `designSchema.ts` keeps the field optional so a future extractor can
  // populate it without a schema change.

  return design;
}
