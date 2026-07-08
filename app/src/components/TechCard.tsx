import { memo } from "react";
import type { Tech } from "../types/tech-snapshot";
import { categoryLabel } from "../lib/graph/categories";

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

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** Tier → roman numeral (tier is 0-based in the data; show tier 0 as "I"). */
function roman(tier: number): string {
  return ROMAN[tier] ?? String(tier + 1);
}

interface TechCardProps {
  tech: Tech;
  /** Icon URL (already resolved from the snapshot version + tech.icon). */
  image?: string;
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
}

// Memoized: pan/zoom re-renders the parent every tick, but a card's props
// (tech, image, x, y, onEnter, onLeave — all stable) don't change, so memo lets
// all 678 cards bail out of re-rendering — only the single canvas transform
// updates (which we now apply imperatively, so cards don't re-render at all).
export const TechCard = memo(function TechCard({
  tech,
  image,
  x,
  y,
  onEnter,
  onLeave,
  selected,
  onSelect,
  expandable,
  expanded,
  onToggleExpand,
}: TechCardProps) {
  const category = tech.category[0] ?? "";
  return (
    <div
      className="tech-card"
      data-area={tech.area}
      data-key={tech.key}
      data-selected={selected ? "" : undefined}
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
    >
      <div className="tech-card__icon">
        {image ? <img src={image} alt="" loading="lazy" /> : null}
        <span className="tech-card__tier">{roman(tech.tier)}</span>
      </div>
      <div className="tech-card__body">
        {/* PLAIN TEXT — React children, never innerHTML (D-05 XSS). */}
        <div className="tech-card__title">{tech.name}</div>
        <div className="tech-card__meta">
          {categoryLabel(category)} · Tier {tech.tier}
        </div>
        <div className="tech-card__stats">
          Cost: {tech.cost} · Weight: {tech.weight}
        </div>
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
