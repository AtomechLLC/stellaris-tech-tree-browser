import type { Tech } from "../types/tech-snapshot";
import { categoryLabel } from "../lib/graph/categories";
import { describeWeightModifiers } from "../lib/graph/weight";

/**
 * Hover tooltip — the reference tool's detail popover: name + meta, then
 * sectioned Description / Required Technologies (with icons) / Unlocks / Leads
 * To, with colored section headers. Positioned `fixed` beside the hovered card
 * (flips left if there's no room). All text plain (React children, never
 * innerHTML — D-05). Clausewitz markup (§colour codes, £sprites£, literal \n,
 * unresolved $KEY$) is stripped so raw formatting never leaks into the UI.
 */

const TOOLTIP_W = 320;
const LEADS_TO_MAX = 10;

/** Strip Clausewitz/Jomini formatting so only readable text remains. */
function clean(s: string): string {
  return s
    .replace(/§[A-Za-z!]/g, "") // §H / §Y / §! colour codes
    .replace(/£[^£\s]*£?/g, "") // £sprite£ icon tags
    .replace(/\\n/g, " ") // literal backslash-n
    .replace(/\s+/g, " ")
    .trim();
}

/** A value worth showing: not empty and not a raw `$KEY$` placeholder. */
function isReadable(s: string | null | undefined): s is string {
  const t = (s ?? "").trim();
  return t.length > 0 && !/^\$[^$]*\$$/.test(t);
}

interface Ref {
  key: string;
  name: string;
  icon?: string;
  area?: string;
}

export function TechTooltip({
  tech,
  techByKey,
  iconBase,
  anchor,
  onJump,
  onPointerEnter,
  onPointerLeave,
}: {
  tech: Tech;
  techByKey: Map<string, Tech>;
  iconBase: string;
  anchor: DOMRect;
  /** Jump the map/explore view to the clicked Required / Leads-To tech. */
  onJump?: (key: string) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const category = tech.category[0] ?? "";
  const resolve = (key: string): Ref => {
    const t = techByKey.get(key);
    return {
      key,
      name: t?.name ?? key,
      icon: t?.icon ? `${iconBase}/${t.icon}` : undefined,
      area: t?.area,
    };
  };
  const prereqs = tech.prerequisites.map(resolve);
  const leadsTo = tech.unlocks.leadsTo.map(resolve);

  // A Required / Leads-To row. Clickable (jumps the view to that tech) whenever
  // it resolves to a REAL tech — synthetic parents (perk:/event:) and unknown
  // keys stay static. Uses a <button> for keyboard access; CSS makes it look
  // like the row. Icon/name are plain text/children (never innerHTML — D-05).
  const renderRef = (p: Ref) => {
    const icon = p.icon ? (
      <img src={p.icon} alt="" loading="lazy" />
    ) : (
      <span className="tech-tooltip__prereq-dot" />
    );
    // Real tech keys are `tech_…` (no colon); synthetic parents (perk:/src:…)
    // aren't map nodes, so they stay non-clickable.
    const jumpable = !!onJump && !p.key.includes(":") && techByKey.has(p.key);
    if (jumpable) {
      return (
        <li key={p.key}>
          <button
            type="button"
            className="tech-tooltip__prereq tech-tooltip__prereq--link"
            data-area={p.area}
            onClick={() => onJump!(p.key)}
            title={`Jump to ${p.name}`}
          >
            {icon}
            <span className="tech-tooltip__prereq-name">{p.name}</span>
            <span className="tech-tooltip__prereq-go" aria-hidden>
              ↗
            </span>
          </button>
        </li>
      );
    }
    return (
      <li className="tech-tooltip__prereq" data-area={p.area} key={p.key}>
        {icon}
        <span className="tech-tooltip__prereq-name">{p.name}</span>
      </li>
    );
  };
  const description = isReadable(tech.description) ? clean(tech.description!) : null;
  const unlocks = tech.unlocks.grants.map(clean).filter(isReadable);
  // "What boosts your chance of drawing this tech" — readable lines from the raw
  // weight_modifier block (has_technology names resolved via techByKey).
  const weightMods = describeWeightModifiers(tech.weightModifierRaw, techByKey);

  // Place to the right of the card if it fits, otherwise to its left.
  const placeRight = anchor.right + 12 + TOOLTIP_W <= window.innerWidth;
  const left = placeRight ? anchor.right + 12 : anchor.left - 12 - TOOLTIP_W;
  // Anchor near the card's top, but never start lower than ~1/3 down the
  // viewport — that guarantees a tall tooltip has most of the screen height to
  // grow into, instead of being starved (and forced to scroll) when the hovered
  // card sits low. `maxHeight` then fills from `top` to the viewport bottom, so
  // the tooltip grows as tall as its content needs. "If it can't fit, make it
  // bigger" — it only scrolls when content exceeds nearly the whole viewport.
  const top = Math.max(8, Math.min(anchor.top, Math.round(window.innerHeight * 0.34)));
  const maxHeight = window.innerHeight - top - 8;

  return (
    <div
      className="tech-tooltip"
      data-area={tech.area}
      style={{ left: `${left}px`, top: `${top}px`, width: `${TOOLTIP_W}px`, maxHeight: `${maxHeight}px` }}
      role="tooltip"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      <div className="tech-tooltip__title">{tech.name}</div>
      <div className="tech-tooltip__meta">
        {categoryLabel(category)} ·{" "}
        <span className="tier-num" data-tier={tech.tier}>Tier {tech.tier}</span> · Cost{" "}
        <img
          className="tech-tooltip__cost-icon"
          src={`${iconBase}/_research_${tech.area}.webp`}
          alt={`${tech.area} research`}
          title={`${tech.area} research`}
        />
        {tech.cost} · Weight {tech.weight}
      </div>

      {(tech.dlc || tech.flags.isRare || tech.flags.isDangerous) && (
        <div className="tech-tooltip__badges">
          {tech.dlc && <span className="tech-badge tech-badge--dlc">{tech.dlc}</span>}
          {tech.flags.isRare && <span className="tech-badge tech-badge--rare">Rare</span>}
          {tech.flags.isDangerous && <span className="tech-badge tech-badge--danger">Dangerous</span>}
        </div>
      )}

      <section className="tech-tooltip__sec">
        <div className="tech-tooltip__sec-title">Research Weight</div>
        <div className="tech-tooltip__weight-base">Base weight {tech.weight}</div>
        {weightMods.length > 0 && (
          <ul className="tech-tooltip__weight-mods">
            {weightMods.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {description && (
        <section className="tech-tooltip__sec">
          <div className="tech-tooltip__sec-title">Description</div>
          <p className="tech-tooltip__desc">{description}</p>
        </section>
      )}

      {prereqs.length > 0 && (
        <section className="tech-tooltip__sec">
          <div className="tech-tooltip__sec-title">Required Technologies</div>
          <ul className="tech-tooltip__prereqs">{prereqs.map(renderRef)}</ul>
        </section>
      )}

      {unlocks.length > 0 && (
        <section className="tech-tooltip__sec">
          <div className="tech-tooltip__sec-title">Unlocks</div>
          <ul className="tech-tooltip__effects">
            {unlocks.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      {leadsTo.length > 0 && (
        <section className="tech-tooltip__sec">
          <div className="tech-tooltip__sec-title">Leads To</div>
          <ul className="tech-tooltip__prereqs">
            {leadsTo.slice(0, LEADS_TO_MAX).map(renderRef)}
            {leadsTo.length > LEADS_TO_MAX && (
              <li className="tech-tooltip__prereq tech-tooltip__prereq--more">
                +{leadsTo.length - LEADS_TO_MAX} more
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
