import { memo } from "react";
import type { Tech } from "../types/tech-snapshot";
import {
  CATEGORY_ORDER,
  CATEGORY_AREA,
  categoryLabel,
  type CategoryKey,
} from "../lib/graph/categories";

/**
 * Left navigation panel (quick 260708-2v7): the 13 tech categories grouped
 * under their 3 research areas. Each row has a checkbox to TOGGLE the category's
 * visibility (multi-select) and a clickable name to ISOLATE the tree to just
 * that category. Area headers do the same at area granularity. "Show all"
 * resets. Counts show how many techs each category has.
 *
 * Pure presentational + memoized — all filter state lives in TechTree.
 */

type Area = Tech["area"];

const AREAS: { key: Area; label: string }[] = [
  { key: "physics", label: "Physics" },
  { key: "society", label: "Society" },
  { key: "engineering", label: "Engineering" },
];

/** category keys grouped by area, preserving CATEGORY_ORDER within each area. */
const CATS_BY_AREA: Record<Area, CategoryKey[]> = {
  physics: CATEGORY_ORDER.filter((c) => CATEGORY_AREA[c] === "physics"),
  society: CATEGORY_ORDER.filter((c) => CATEGORY_AREA[c] === "society"),
  engineering: CATEGORY_ORDER.filter((c) => CATEGORY_AREA[c] === "engineering"),
};

interface CategoryNavProps {
  /** Set of currently-visible category keys. */
  active: Set<string>;
  /** category key → total tech count (stable; from the full layout). */
  counts: Record<string, number>;
  onToggleCategory: (cat: string) => void;
  onIsolateCategory: (cat: string) => void;
  onToggleArea: (area: Area) => void;
  onIsolateArea: (area: Area) => void;
  onShowAll: () => void;
}

export const CategoryNav = memo(function CategoryNav({
  active,
  counts,
  onToggleCategory,
  onIsolateCategory,
  onToggleArea,
  onIsolateArea,
  onShowAll,
}: CategoryNavProps) {
  const allActive = active.size === CATEGORY_ORDER.length;

  return (
    <nav className="category-nav" aria-label="Filter by category">
      <button
        type="button"
        className="category-nav__all"
        data-active={allActive || undefined}
        onClick={onShowAll}
      >
        Show all
      </button>

      {AREAS.map((area) => {
        const cats = CATS_BY_AREA[area.key];
        const activeInArea = cats.filter((c) => active.has(c)).length;
        const areaAll = activeInArea === cats.length;
        const areaSome = activeInArea > 0 && !areaAll;
        return (
          <div className="category-nav__group" data-area={area.key} key={area.key}>
            <div className="category-nav__area">
              <input
                type="checkbox"
                className="category-nav__check"
                checked={areaAll}
                // Partial selection → indeterminate (set imperatively via ref).
                ref={(el) => {
                  if (el) el.indeterminate = areaSome;
                }}
                onChange={() => onToggleArea(area.key)}
                aria-label={`Toggle all ${area.label} categories`}
              />
              <button
                type="button"
                className="category-nav__area-name"
                onClick={() => onIsolateArea(area.key)}
              >
                {area.label}
              </button>
            </div>

            <ul className="category-nav__cats">
              {cats.map((cat) => (
                <li className="category-nav__cat" key={cat}>
                  <input
                    type="checkbox"
                    className="category-nav__check"
                    checked={active.has(cat)}
                    onChange={() => onToggleCategory(cat)}
                    aria-label={`Toggle ${categoryLabel(cat)}`}
                  />
                  <button
                    type="button"
                    className="category-nav__cat-name"
                    data-dim={active.has(cat) ? undefined : true}
                    onClick={() => onIsolateCategory(cat)}
                    title={`Show only ${categoryLabel(cat)}`}
                  >
                    <span className="category-nav__cat-text">{categoryLabel(cat)}</span>
                    <span className="category-nav__count">{counts[cat] ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
});
