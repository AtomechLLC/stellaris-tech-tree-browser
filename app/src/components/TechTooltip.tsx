import type { Tech } from "../types/tech-snapshot";
import { categoryLabel } from "../lib/graph/categories";

/**
 * Hover tooltip (quick 260708-2v7 follow-up) — the detail popover the reference
 * tool shows on mouse-over. Positioned `fixed` next to the hovered card (flips
 * to the left edge if there's no room on the right). Shows the tech's name,
 * category/tier/cost/weight, description, prerequisites, what it unlocks/leads
 * to, and any DLC/rarity flags. All text is plain (React children, never
 * innerHTML — D-05 XSS contract).
 */

const TOOLTIP_W = 300;
const LEADS_TO_MAX = 8;

/** A localised value (not a raw `$KEY$` placeholder or empty). */
function isReadable(s: string | null | undefined): s is string {
  return !!s && !/^\$[^$]*\$$/.test(s.trim());
}

export function TechTooltip({
  tech,
  nameByKey,
  anchor,
}: {
  tech: Tech;
  nameByKey: Map<string, string>;
  anchor: DOMRect;
}) {
  const category = tech.category[0] ?? "";
  const nameOf = (k: string) => nameByKey.get(k) ?? k;
  const prereqs = tech.prerequisites.map(nameOf);
  const leadsTo = tech.unlocks.leadsTo.map(nameOf);
  const grants = tech.unlocks.grants.filter(isReadable);

  // Place to the right of the card if it fits, otherwise to its left.
  const placeRight = anchor.right + 12 + TOOLTIP_W <= window.innerWidth;
  const left = placeRight ? anchor.right + 12 : anchor.left - 12 - TOOLTIP_W;
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - 320));

  return (
    <div
      className="tech-tooltip"
      data-area={tech.area}
      style={{ left: `${left}px`, top: `${top}px`, width: `${TOOLTIP_W}px` }}
      role="tooltip"
    >
      <div className="tech-tooltip__title">{tech.name}</div>
      <div className="tech-tooltip__meta">
        {categoryLabel(category)} · Tier {tech.tier} · Cost {tech.cost} · Weight {tech.weight}
      </div>

      {(tech.dlc || tech.flags.isRare || tech.flags.isDangerous) && (
        <div className="tech-tooltip__badges">
          {tech.dlc && <span className="tech-badge tech-badge--dlc">{tech.dlc}</span>}
          {tech.flags.isRare && <span className="tech-badge tech-badge--rare">Rare</span>}
          {tech.flags.isDangerous && <span className="tech-badge tech-badge--danger">Dangerous</span>}
        </div>
      )}

      {isReadable(tech.description) && (
        <p className="tech-tooltip__desc">{tech.description}</p>
      )}

      {grants.length > 0 && (
        <div className="tech-tooltip__section">
          <span className="tech-tooltip__label">Unlocks</span>
          {grants.join(", ")}
        </div>
      )}
      {prereqs.length > 0 && (
        <div className="tech-tooltip__section">
          <span className="tech-tooltip__label">Requires</span>
          {prereqs.join(", ")}
        </div>
      )}
      {leadsTo.length > 0 && (
        <div className="tech-tooltip__section">
          <span className="tech-tooltip__label">Leads to</span>
          {leadsTo.slice(0, LEADS_TO_MAX).join(", ")}
          {leadsTo.length > LEADS_TO_MAX ? ` +${leadsTo.length - LEADS_TO_MAX} more` : ""}
        </div>
      )}
    </div>
  );
}
