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
}

export function TechCard({ tech, image, x, y }: TechCardProps) {
  const category = tech.category[0] ?? "";
  return (
    <div
      className="tech-card"
      data-area={tech.area}
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${CARD_W}px`,
        height: `${CARD_H}px`,
      }}
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
    </div>
  );
}
