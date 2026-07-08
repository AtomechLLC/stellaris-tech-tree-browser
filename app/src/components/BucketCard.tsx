import { memo } from "react";
import type { BucketId } from "../lib/tree/layoutTree";
import { CARD_W, CARD_H } from "./TechCard";

/**
 * Synthetic Explore-mode "bucket" root card (quick 260708-6bk).
 *
 * Renders one of the five grouping roots — [Insight], [Dangerous],
 * [Repeatable], [Archaeology], [Event] — that collapse the ~150 non-starting
 * no-prerequisite techs so the initial Explore column stays short. It is NOT a
 * real tech: no icon/cost/tier, no hover tooltip, no selection. Clicking it (or
 * its chevron) just toggles expansion, revealing its grouped roots to the right.
 *
 * Deliberately distinct from `TechCard` (dashed neutral card, bracketed label,
 * a per-bucket accent via `data-bucket`) so it reads as a category, not a tech.
 * Absolutely positioned by the parent at the layout (x, y), same box size as a
 * real card so columns/edges line up. All text is PLAIN via React children.
 */

interface BucketCardProps {
  /** The synthetic layout node key, e.g. "bucket:insight". */
  nodeKey: string;
  bucketId: BucketId;
  /** Display label, rendered bracketed as "[label]". */
  label: string;
  /** One-line descriptor of what the bucket groups. */
  descriptor: string;
  /** How many shown-eligible roots this bucket currently groups. */
  count: number;
  /** Absolute position in the shared canvas coordinate space. */
  x: number;
  y: number;
  /** Whether the bucket has ≥1 revealable root (else the chevron is hidden). */
  expandable: boolean;
  /** Whether the bucket is currently expanded (chevron open). */
  expanded: boolean;
  /** Toggle expansion. Stable ref; parent suppresses drag-clicks upstream. */
  onToggle: (key: string) => void;
}

export const BucketCard = memo(function BucketCard({
  nodeKey,
  bucketId,
  label,
  descriptor,
  count,
  x,
  y,
  expandable,
  expanded,
  onToggle,
}: BucketCardProps) {
  const toggle = () => {
    if (expandable) onToggle(nodeKey);
  };
  return (
    <div
      className="bucket-card"
      data-bucket={bucketId}
      data-key={nodeKey}
      data-expanded={expanded ? "" : undefined}
      role="button"
      tabIndex={0}
      aria-expanded={expandable ? expanded : undefined}
      aria-label={`${label} — ${count} tech${count === 1 ? "" : "s"}`}
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${CARD_W}px`,
        height: `${CARD_H}px`,
      }}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div className="bucket-card__body">
        {/* PLAIN TEXT — React children, never innerHTML. */}
        <div className="bucket-card__title">[{label}]</div>
        <div className="bucket-card__meta">{descriptor}</div>
        <div className="bucket-card__count">
          {count} tech{count === 1 ? "" : "s"}
        </div>
      </div>
      {expandable && (
        <span className="bucket-card__chevron" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
      )}
    </div>
  );
});
