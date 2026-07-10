import { memo } from "react";
import type { Tech } from "../types/tech-snapshot";
import { categoryLabel } from "../lib/graph/categories";
import type { Bucket } from "../lib/empire/classify";

/**
 * Reference-style tech card: area-colored, icon on the left with a tier
 * roman-numeral badge, area-colored header bar carrying the tech name, then
 * `Category · Tier N` and `Cost / Weight`. Fixed size (matching the size handed
 * to ELK so positions line up), a subtle hex-mesh background texture, and an
 * area-colored border. Absolutely positioned by the parent (TechTree) at its
 * ELK (x, y).
 *
 * The tech `name` is rendered as PLAIN TEXT via React children — never
 * innerHTML (D-05 / T-02-01 XSS contract). Area colors come from the
 * `--area-*` tokens via `data-area` (CSS), never a hardcoded hex.
 */

/** Fixed card size — MUST match the width/height handed to `layoutTree`. */
export const CARD_W = 230;
export const CARD_H = 92;

// Tier badge, indexed by the tech's (0-based) tier so it MATCHES the "Tier N"
// meta text — tier 1 → "I", … tier 5 → "V". Tier 0 has no roman numeral, so it
// shows "0" rather than being shifted up a level.
const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** Tier → its badge label (0-based, matching the tier number). */
function roman(tier: number): string {
  return ROMAN[tier] ?? String(tier);
}

interface TechCardProps {
  tech: Tech;
  /** Icon URL (already resolved from the snapshot version + tech.icon). */
  image?: string;
  /** Research-currency icon URL for this tech's area (physics/society/eng) —
   *  shown next to the cost so the research type reads at a glance. */
  costIcon?: string;
  /** Category ("subtype") icon URL (biology, computing, …) — shown before the
   *  category label in the card meta line. */
  categoryIcon?: string;
  /** Absolute position in the shared canvas coordinate space. */
  x: number;
  y: number;
  /** Hover in → show tooltip (rect = the card's on-screen box). Stable refs. */
  onEnter?: (tech: Tech, rect: DOMRect) => void;
  onLeave?: () => void;
  /** Whether this card is the currently selected ("targeted") node. */
  selected?: boolean;
  /** Click → select this card (toggle in the parent). Stable ref; the parent
   *  suppresses the call if the click was actually a drag (drag-safe). */
  onSelect?: (key: string) => void;
  /** Double-click → "activate": jump to the Explore focus view for this tech
   *  (from the map) or re-focus (within Explore). Stable ref; drag-safe. */
  onActivate?: (key: string) => void;
  /**
   * Explore-mode only: when set, this tech has ≥1 revealable child, so a chevron
   * toggle is rendered on the card's right edge. Map mode passes nothing → no
   * chevron (cards render exactly as before).
   */
  expandable?: boolean;
  /** Explore-mode only: whether this card is currently expanded (chevron open). */
  expanded?: boolean;
  /** Explore-mode only: chevron click → toggle expand in the parent. Stable ref. */
  onToggleExpand?: (key: string) => void;
  /** Saved Empire tab (spike 005): the tech's bucket for this empire, or
   *  undefined when the empire coloring is off. Drives `data-bucket` → CSS. */
  bucket?: Bucket;
  /** Empire-archetype filter (map only): true when this tech's gate can never
   *  be satisfied under the pressed archetype toggles. Drives a grey-out,
   *  independent of (and composes with) the Saved Empire bucket coloring. */
  archetypeBlocked?: boolean;
  /** Synthetic ascension-perk parent node (Explore): render the hexagon + name
   *  and "Ascension Perk" label instead of the tier/cost/weight chrome. */
  perk?: boolean;
  /** Synthetic event/dig-site parent node (Explore): render the source icon +
   *  name and an "Event" / "Archaeology Site" label instead of the chrome. */
  sourceKind?: "event" | "site";
}

// Memoized: pan/zoom re-renders the parent every tick, but a card's props
// (tech, image, x, y, onEnter, onLeave — all stable) don't change, so memo lets
// all 678 cards bail out of re-rendering — only the single canvas transform
// updates (which we now apply imperatively, so cards don't re-render at all).
export const TechCard = memo(function TechCard({
  tech,
  image,
  costIcon,
  categoryIcon,
  x,
  y,
  onEnter,
  onLeave,
  selected,
  onSelect,
  onActivate,
  expandable,
  expanded,
  onToggleExpand,
  bucket,
  archetypeBlocked,
  perk,
  sourceKind,
}: TechCardProps) {
  const category = tech.category[0] ?? "";
  // Perk and event/site source nodes are synthetic PARENT cards — they drop the
  // tier/cost/weight chrome for a single "what this is" label.
  const synthetic = perk || !!sourceKind;
  const syntheticLabel = perk
    ? "Ascension Perk"
    : sourceKind === "site"
      ? "Archaeology Site"
      : "Event";
  return (
    <div
      className="tech-card"
      data-area={tech.area}
      data-key={tech.key}
      data-selected={selected ? "" : undefined}
      data-danger={tech.flags.isDangerous ? "" : undefined}
      data-rare={tech.flags.isRare ? "" : undefined}
      data-bucket={bucket}
      data-archetype-blocked={archetypeBlocked ? "" : undefined}
      data-perk={perk ? "" : undefined}
      data-source={sourceKind}
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${CARD_W}px`,
        height: `${CARD_H}px`,
      }}
      onMouseEnter={(e) => onEnter?.(tech, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={onLeave}
      onClick={() => onSelect?.(tech.key)}
      onDoubleClick={() => onActivate?.(tech.key)}
    >
      <div className="tech-card__icon">
        {image ? <img src={image} alt="" loading="lazy" /> : null}
        {!synthetic && (
          <span className="tech-card__tier" data-tier={tech.tier}>{roman(tech.tier)}</span>
        )}
      </div>
      <div className="tech-card__body">
        {/* PLAIN TEXT — React children, never innerHTML (D-05 XSS). */}
        <div className="tech-card__title">{tech.name}</div>
        {synthetic ? (
          // Perk / event / dig-site parent node: no tier/cost/weight — just what it is.
          <div className="tech-card__meta">{syntheticLabel}</div>
        ) : (
          <>
            <div className="tech-card__meta">
              {categoryIcon ? (
                <img className="tech-card__cat-icon" src={categoryIcon} alt="" loading="lazy" />
              ) : null}
              {categoryLabel(category)} ·{" "}
              <span className="tier-num" data-tier={tech.tier}>Tier {tech.tier}</span>
            </div>
            <div className="tech-card__stats">
              Cost:{" "}
              {costIcon ? (
                <img className="tech-card__cost-icon" src={costIcon} alt="" loading="lazy" />
              ) : null}
              {tech.cost} · Weight: {tech.weight}
            </div>
            {tech.flags.isDangerous && (
              // Stellaris flags these `is_dangerous`: AI empires research them
              // cautiously and they can pull in a hostile event or end-game
              // crisis (e.g. Jump Drives, Synthetics). PLAIN TEXT (D-05).
              <div className="tech-card__danger">
                ⚠ Dangerous — may provoke a hostile event or crisis.
              </div>
            )}
          </>
        )}
      </div>
      {/* Explore-mode expand toggle — only when this tech has revealable
          children. stopPropagation so expanding never selects the card. */}
      {expandable && (
        <button
          type="button"
          className="tech-card__chevron"
          data-expanded={expanded ? "" : undefined}
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded ? true : false}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.(tech.key);
          }}
        >
          {expanded ? "▾" : "▸"}
        </button>
      )}
    </div>
  );
});
