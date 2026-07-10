import type { Tech } from "../types/tech-snapshot";
import { TechInfoBody } from "./TechTooltip";

/**
 * Pinned detail panel for the SELECTED (or Explore-focused) tech. Unlike the
 * hover tooltip — which vanishes the moment the pointer leaves — this stays
 * docked (right side on desktop, bottom sheet on touch/narrow screens) until
 * the selection changes or it's dismissed. It is the only way tech details are
 * reachable on touch devices, where hover doesn't exist.
 *
 * Same `TechInfoBody` as the tooltip, so both surfaces always agree. The
 * Required / Leads-To rows keep their jump-to-tech behavior; jumping selects
 * the target, which swaps this panel to it — chain-walking a tech line without
 * ever re-hovering.
 */
export function TechDetailPanel({
  tech,
  techByKey,
  iconBase,
  onJump,
  onClose,
  onExplore,
}: {
  tech: Tech;
  techByKey: Map<string, Tech>;
  iconBase: string;
  onJump?: (key: string) => void;
  /** Dismiss the panel (selection is kept — see detailHiddenFor in TechTree). */
  onClose: () => void;
  /** Open the Explore focus view for this tech. Omitted when already focused. */
  onExplore?: () => void;
}) {
  return (
    <aside className="tech-detail" data-area={tech.area} aria-label={`${tech.name} details`}>
      <header className="tech-detail__header">
        {/* PLAIN TEXT — React children, never innerHTML (D-05). */}
        <div className="tech-detail__title">{tech.name}</div>
        <button
          type="button"
          className="tech-detail__close"
          onClick={onClose}
          aria-label="Close details"
          title="Close"
        >
          ✕
        </button>
      </header>
      {onExplore && (
        <button type="button" className="tech-detail__explore" onClick={onExplore}>
          View dependency tree
        </button>
      )}
      <div className="tech-detail__body">
        <TechInfoBody tech={tech} techByKey={techByKey} iconBase={iconBase} onJump={onJump} />
      </div>
    </aside>
  );
}
