import { useEffect, useState } from "react";
import { useSigma } from "@react-sigma/core";
import type { DirectedGraph } from "graphology";
import { categoryLabel } from "../lib/graph/categories";

// ── Tuning knobs (orchestrator: tune these in the live dev server) ──────────
/**
 * Camera-ratio LOD gate. Sigma's `camera.ratio` is INVERSE zoom: smaller =
 * more zoomed IN. When ratio < RATIO_THRESHOLD (zoomed in) we render the rich
 * HTML cards; when ratio >= RATIO_THRESHOLD (zoomed out) we render nothing and
 * the compact square Sigma tiles show through. Raise to make cards appear
 * sooner (further out); lower to require a closer zoom.
 */
const RATIO_THRESHOLD = 0.9;
/**
 * Viewport-pixel margin around the container used for culling — a node whose
 * projected position is within [−MARGIN, size+MARGIN] gets a card. Keeps cards
 * that are partially on-screen from popping at the edges while still limiting
 * DOM to on-screen nodes (tens, not 678).
 */
const CULL_MARGIN = 220;
/**
 * Card scale = clamp(BASE_RATIO / ratio, MIN..MAX). At ratio == BASE_RATIO the
 * card renders at scale 1; zooming in (smaller ratio) grows it up to CARD_MAX,
 * zooming out shrinks it down to CARD_MIN — so cards feel anchored in graph
 * space rather than fixed-size screen chrome.
 */
const CARD_BASE_RATIO = 0.5;
const CARD_SCALE_MIN = 0.55;
const CARD_SCALE_MAX = 1.6;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** Tier → roman numeral (tier is 0-based in the data; show tier 0 as "I"). */
function roman(tier: number): string {
  return ROMAN[tier] ?? String(tier + 1);
}

interface VisibleCard {
  key: string;
  /** Viewport pixel position (card is centered here). */
  screenX: number;
  screenY: number;
  scale: number;
  area: string;
  category: string;
  tier: number;
  name: string;
  cost: number;
  weight: number;
  image?: string;
}

/**
 * Zoom-LOD HTML card overlay (the headline of quick 260707-we6, Task 3).
 *
 * Renders reference-style tech cards as an absolutely-positioned HTML layer on
 * top of the Sigma canvas, ONLY when zoomed in past RATIO_THRESHOLD and ONLY
 * for on-screen nodes (viewport culling). Camera-synced exactly like
 * TierAxis.tsx — re-projects on the camera "updated" event and on "resize",
 * coalesced to one requestAnimationFrame so a burst of camera events collapses
 * into a single recompute (no per-frame layout of all 678 nodes).
 *
 * The overlay layer is pointer-events:none so pan/zoom/click still reach Sigma
 * underneath. Tech `name` is rendered as PLAIN TEXT via React children (never
 * innerHTML) — the D-05 / T-02-01 XSS contract.
 */
export function TechCardOverlay({ graph }: { graph: DirectedGraph }) {
  const sigma = useSigma();
  const [cards, setCards] = useState<VisibleCard[]>([]);

  useEffect(() => {
    const camera = sigma.getCamera();
    let rafId = 0;

    function recompute() {
      const ratio = camera.getState().ratio;

      // LOD gate: zoomed out → no cards (compact Sigma tiles show through).
      if (ratio >= RATIO_THRESHOLD) {
        setCards((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      const { width, height } = sigma.getDimensions();
      const scale = Math.min(
        CARD_SCALE_MAX,
        Math.max(CARD_SCALE_MIN, CARD_BASE_RATIO / ratio),
      );

      const next: VisibleCard[] = [];
      graph.forEachNode((key, attrs) => {
        const pos = sigma.graphToViewport({
          x: attrs.x as number,
          y: attrs.y as number,
        });
        // Cull off-screen nodes (keep only those within container + margin).
        if (
          pos.x < -CULL_MARGIN ||
          pos.x > width + CULL_MARGIN ||
          pos.y < -CULL_MARGIN ||
          pos.y > height + CULL_MARGIN
        ) {
          return;
        }
        next.push({
          key,
          screenX: pos.x,
          screenY: pos.y,
          scale,
          area: attrs.area as string,
          category: attrs.category as string,
          tier: attrs.tier as number,
          name: attrs.name as string,
          cost: attrs.cost as number,
          weight: attrs.weight as number,
          image: attrs.image as string | undefined,
        });
      });

      setCards(next);
    }

    // Coalesce a burst of camera "updated" events into one recompute per frame.
    function schedule() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        recompute();
      });
    }

    recompute();
    camera.on("updated", schedule);
    sigma.on("resize", schedule);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      camera.removeListener("updated", schedule);
      sigma.removeListener("resize", schedule);
    };
  }, [sigma, graph]);

  if (cards.length === 0) return null;

  return (
    <div className="tech-card-layer" role="presentation">
      {cards.map((card) => (
        <div
          key={card.key}
          className="tech-card"
          data-area={card.area}
          style={{
            left: `${card.screenX}px`,
            top: `${card.screenY}px`,
            transform: `translate(-50%, -50%) scale(${card.scale})`,
          }}
        >
          <div className="tech-card__icon">
            {card.image ? <img src={card.image} alt="" /> : null}
            <span className="tech-card__tier">{roman(card.tier)}</span>
          </div>
          <div className="tech-card__body">
            {/* PLAIN TEXT — React children, never innerHTML (D-05 XSS). */}
            <div className="tech-card__title">{card.name}</div>
            <div className="tech-card__meta">
              {categoryLabel(card.category)} – Tier {card.tier}
            </div>
            <div className="tech-card__stats">
              Cost: {card.cost}, Weight: {card.weight}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
