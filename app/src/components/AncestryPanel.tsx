import { useMemo } from "react";
import type { Tech } from "../types/tech-snapshot";
import { categoryLabel } from "../lib/graph/categories";
import {
  computeAncestry,
  hasHiddenAncestor,
  ancestryColumns,
  areaOf,
  type AncestryNode,
} from "../lib/graph/ancestry";

/**
 * Hidden-ancestry drill-down panel (quick 260708-4io).
 *
 * When a card is selected AND at least one of its recursive prerequisites is
 * hidden by the current category filter, this fixed overlay shows the selected
 * tech's ENTIRE upstream inheritance tree so the filter-removed dependencies
 * stay visible / hoverable / selectable. Rendered as depth-columns: the deepest
 * prerequisites on the left, the selected tech on the far right. Hidden
 * ancestors are marked (dashed border + a "hidden" dot). Mini-cards reuse the
 * card hover pathway (→ TechTooltip) and click to re-root the drill-down.
 *
 * All names are PLAIN TEXT via React children (D-05) — never innerHTML.
 */

/** Panel geometry — a fixed overlay clamped into the viewport. */
const PANEL_W = 360;
const PANEL_MAX_H = 520;
const GAP = 16; // gap between the panel and the selected card's rect
const MARGIN = 8; // min gap from the viewport edges

interface AncestryPanelProps {
  /** The selected tech key (drill-down root). */
  selectedKey: string;
  /** Currently-shown category keys — drives the hidden flag. */
  active: Set<string>;
  /** key → Tech lookup (shared with the tooltip). */
  techByKey: Map<string, Tech>;
  /** Icon base URL (`/data/<version>/icons`). */
  iconBase: string;
  /** The selected card's on-screen rect — the panel anchors to its left. */
  anchor: DOMRect;
  /** Hover a mini-card → show its tooltip (reuses the card hover pathway). */
  onEnter?: (tech: Tech, rect: DOMRect) => void;
  onLeave?: () => void;
  /** Click a mini-card → re-root the drill-down on that ancestor. */
  onSelect?: (key: string) => void;
}

/**
 * Returns null (renders nothing) unless the selected tech has a filter-hidden
 * recursive ancestor — the panel only exists to surface hidden dependencies.
 */
export function AncestryPanel({
  selectedKey,
  active,
  techByKey,
  iconBase,
  anchor,
  onEnter,
  onLeave,
  onSelect,
}: AncestryPanelProps) {
  // Recompute only when the selection, filter, or data change (not on hover/pan).
  const columns = useMemo(() => {
    const nodes = computeAncestry(selectedKey, active, techByKey);
    if (!hasHiddenAncestor(nodes)) return null; // nothing hidden → no panel
    return ancestryColumns(nodes);
  }, [selectedKey, active, techByKey]);

  if (!columns) return null;

  // Place to the LEFT of the card; if there's no room, flip to its right. Clamp
  // the top into the viewport so a tall panel stays fully on screen.
  const placeLeft = anchor.left - GAP - PANEL_W >= MARGIN;
  const left = placeLeft
    ? anchor.left - GAP - PANEL_W
    : Math.min(anchor.right + GAP, window.innerWidth - PANEL_W - MARGIN);
  const top = Math.max(
    MARGIN,
    Math.min(anchor.top, window.innerHeight - PANEL_MAX_H - MARGIN),
  );

  return (
    <div
      className="ancestry-panel"
      style={{ left: `${left}px`, top: `${top}px`, width: `${PANEL_W}px` }}
      role="dialog"
      aria-label="Prerequisite ancestry"
    >
      <div className="ancestry-panel__header">Prerequisites (incl. hidden)</div>
      <div className="ancestry-panel__cols">
        {columns.map((col, ci) => (
          <div className="ancestry-panel__col" key={ci}>
            {col.map((node) => (
              <AncestryMiniCard
                key={node.key}
                node={node}
                iconBase={iconBase}
                isRoot={node.key === selectedKey}
                onEnter={onEnter}
                onLeave={onLeave}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A single hoverable/clickable ancestry tile (icon + plain-text name). */
function AncestryMiniCard({
  node,
  iconBase,
  isRoot,
  onEnter,
  onLeave,
  onSelect,
}: {
  node: AncestryNode;
  iconBase: string;
  isRoot: boolean;
  onEnter?: (tech: Tech, rect: DOMRect) => void;
  onLeave?: () => void;
  onSelect?: (key: string) => void;
}) {
  const { tech, hidden } = node;
  const category = tech.category[0] ?? "";
  const image = tech.icon ? `${iconBase}/${tech.icon}` : undefined;
  return (
    <button
      type="button"
      className="ancestry-mini"
      data-area={areaOf(tech)}
      data-hidden={hidden ? "" : undefined}
      data-root={isRoot ? "" : undefined}
      // Reuse the card hover pathway: pass the tech + this tile's rect so the
      // shared TechTooltip anchors to the mini-card exactly like a real card.
      onMouseEnter={(e) => onEnter?.(tech, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={onLeave}
      onClick={() => onSelect?.(tech.key)}
    >
      <span className="ancestry-mini__icon">
        {image ? <img src={image} alt="" loading="lazy" /> : null}
      </span>
      <span className="ancestry-mini__body">
        {/* PLAIN TEXT — React children, never innerHTML (D-05 XSS). */}
        <span className="ancestry-mini__name">{tech.name}</span>
        <span className="ancestry-mini__meta">
          {categoryLabel(category)} · Tier {tech.tier}
        </span>
      </span>
      {hidden && <span className="ancestry-mini__hidden-dot" aria-label="hidden by filter" />}
    </button>
  );
}
