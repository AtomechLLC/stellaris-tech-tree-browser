import { useEffect, useMemo, useRef, useState } from "react";
import { categoryLabel } from "../lib/graph/categories";

/**
 * F-Find overlay (quick 260708-4y2): a centered search box that jumps to any
 * tech — INCLUDING filtered-out ones — serving the #1 use case (find a tech →
 * see its unlock path). Autofocused input, case-insensitive `includes` match
 * against tech names, top ~12 matches as rows (icon + name + `Category · Tier`,
 * area-colored left border). Keyboard: ↑/↓ move the active row, Enter picks it,
 * Esc closes; rows are also clickable. Purely presentational — all jump/select
 * logic lives in `TechTree.onPick`.
 */

const MAX_RESULTS = 12;

/** One searchable tech (a flattened projection of Tech, incl. hidden ones). */
export interface FindEntry {
  key: string;
  name: string;
  category: string;
  tier: number;
  area: string;
  icon: string | null;
  /** Formatted effect lines ("+5% Research Speed", "Unlocks Espionage") — also
   *  searched, so "survey speed" surfaces the techs that grant it. */
  effects: string[];
}

interface FindOverlayProps {
  techs: FindEntry[];
  iconBase: string;
  onPick: (key: string) => void;
  onClose: () => void;
}

export function FindOverlay({ techs, iconBase, onPick, onClose }: FindOverlayProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus the input on mount so the user can type immediately after `F`.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Name matches rank first; then techs whose EFFECT lines match ("survey
  // speed" → the techs granting it), carrying the matched line for the row.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const byName = techs.filter((t) => t.name.toLowerCase().includes(q));
    const named = new Set(byName.map((t) => t.key));
    const byEffect: Array<FindEntry & { matchedEffect?: string }> = [];
    if (byName.length < MAX_RESULTS) {
      for (const t of techs) {
        if (named.has(t.key)) continue;
        const hit = t.effects.find((e) => e.toLowerCase().includes(q));
        if (hit) byEffect.push({ ...t, matchedEffect: hit });
        if (byName.length + byEffect.length >= MAX_RESULTS) break;
      }
    }
    return [...byName, ...byEffect].slice(0, MAX_RESULTS) as Array<
      FindEntry & { matchedEffect?: string }
    >;
  }, [query, techs]);

  // Keep the active row in range as results change (a new query resets to 0).
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[activeIndex];
      if (pick) onPick(pick.key);
    }
  };

  return (
    <div
      className="find-overlay"
      role="dialog"
      aria-label="Find a technology"
      // Click the backdrop (not the panel) closes the overlay.
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="find-box">
        <input
          ref={inputRef}
          type="text"
          className="find-box__input"
          placeholder="Find a technology or effect…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search technologies by name or effect"
          autoComplete="off"
          spellCheck={false}
        />

        {query.trim() && (
          <ul className="find-box__results">
            {results.length === 0 && <li className="find-box__empty">No matches</li>}
            {results.map((t, i) => (
              <li
                key={t.key}
                className="find-box__result"
                data-area={t.area}
                data-active={i === activeIndex || undefined}
                onPointerEnter={() => setActiveIndex(i)}
                onClick={() => onPick(t.key)}
              >
                {t.icon ? (
                  <img
                    className="find-box__icon"
                    src={`${iconBase}/${t.icon}`}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="find-box__icon find-box__icon--empty" />
                )}
                <span className="find-box__name">
                  {t.name}
                  {/* Why this tech matched: the effect line the query hit. */}
                  {t.matchedEffect && (
                    <span className="find-box__effect">{t.matchedEffect}</span>
                  )}
                </span>
                <span className="find-box__meta">
                  {categoryLabel(t.category)} · Tier {t.tier}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
