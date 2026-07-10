import type { ArchetypeFilters } from "../lib/empire/archetype";

/**
 * Empire-archetype filter bar (map only) — no save required. A single compact
 * row of icon-only toggles: three exclusive pairs (press one, its opposite
 * clears; press the active one again to go back to unconstrained) plus a
 * standalone Fauna icon. Icons render greyscale/dim when off and full color
 * when pressed — the icon alone carries the meaning (title attr + aria-label
 * for a11y), no spelled-out text label in the UI. Greys out any tech on the
 * map whose potential gate can never be satisfied under the pressed
 * combination (see lib/empire/archetype.ts). Purely presentational — all
 * filter state lives in TechTree, mirroring CategoryNav's own pattern.
 */

interface BtnDef {
  key: keyof ArchetypeFilters;
  value: boolean;
  label: string;
  icon: string;
}

// Rendered as one row in this order: Landed | Nomad | Biological | Machine |
// Alloy Ship | Bioship | Fauna. Adjacent pairs share a key with opposite values.
const BUTTONS: BtnDef[] = [
  { key: "nomadic", value: false, label: "Landed", icon: "_arch_landed" },
  { key: "nomadic", value: true, label: "Nomad", icon: "_arch_nomad" },
  { key: "machine", value: false, label: "Biological", icon: "_arch_biological" },
  { key: "machine", value: true, label: "Machine", icon: "_arch_machine" },
  { key: "bioShips", value: false, label: "Alloy Ship", icon: "_arch_alloy_ship" },
  { key: "bioShips", value: true, label: "Bioship", icon: "_arch_bioship" },
  { key: "fauna", value: true, label: "Fauna", icon: "_arch_fauna" },
];

export function ArchetypeToggles({
  filters,
  iconBase,
  onSet,
}: {
  filters: ArchetypeFilters;
  iconBase: string;
  onSet: (key: keyof ArchetypeFilters, value: boolean) => void;
}) {
  return (
    <div className="archetype-toggles" role="group" aria-label="Filter by empire archetype">
      {BUTTONS.map((b) => {
        const active = filters[b.key] === b.value;
        return (
          <button
            key={`${b.key}:${b.value}`}
            type="button"
            className="archetype-toggles__btn"
            data-active={active || undefined}
            aria-pressed={active}
            aria-label={b.label}
            title={`${b.label} only — dims techs unreachable for this archetype`}
            onClick={() => onSet(b.key, b.value)}
          >
            <img src={`${iconBase}/${b.icon}.webp`} alt="" loading="lazy" />
          </button>
        );
      })}
    </div>
  );
}
