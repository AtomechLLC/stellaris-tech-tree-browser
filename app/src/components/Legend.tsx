import {
  CATEGORY_ORDER,
  CATEGORY_AREA,
  CATEGORY_LABEL,
  type CategoryKey,
} from "../lib/graph/categories";

/**
 * Bottom-left overlay legend (UI-SPEC App Shell Layout). Updated for quick
 * 260707-we6: the swimlanes are CATEGORIES nested within the 3 research areas,
 * so the legend now groups the 13 category names under their area's color —
 * making clear that a lane == a category and its color == its parent area.
 * Reuses CATEGORY_ORDER/LABEL/AREA (single source of truth); swatch colors are
 * CSS classes reading --area-* tokens — no hardcoded hex.
 */
const AREAS = [
  { key: "physics", label: "Physics" },
  { key: "society", label: "Society" },
  { key: "engineering", label: "Engineering" },
] as const;

// Precompute the category list per area, preserving CATEGORY_ORDER.
const CATEGORIES_BY_AREA: Record<string, CategoryKey[]> = {
  physics: [],
  society: [],
  engineering: [],
};
for (const key of CATEGORY_ORDER) {
  CATEGORIES_BY_AREA[CATEGORY_AREA[key]].push(key);
}

export function Legend() {
  return (
    <div className="legend">
      {AREAS.map(({ key, label }) => (
        <div className="legend__group" key={key}>
          <div className="legend__row legend__row--area">
            <span className={`legend__swatch legend__swatch--${key}`} />
            <span className="legend__label legend__label--area">{label}</span>
          </div>
          <div className="legend__categories">
            {CATEGORIES_BY_AREA[key].map((cat) => (
              <span className="legend__category" key={cat}>
                {CATEGORY_LABEL[cat]}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
