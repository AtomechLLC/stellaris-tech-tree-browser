import type { Tech } from "../../types/tech-snapshot";

/**
 * Resolved CSS-token values, bridged from tokens.css into TS/Sigma settings.
 */
export interface ThemeTokens {
  bg: string;
  surface: string;
  accent: string;
  danger: string;
  edge: string;
  text: string;
  areaPhysics: string;
  areaSociety: string;
  areaEngineering: string;
}

/**
 * D-12 CSS-var -> Sigma bridge (RESEARCH Pattern 4).
 *
 * This is the ONLY place a CSS custom-property value from tokens.css enters
 * TypeScript. Reads via `getComputedStyle(document.documentElement)` so
 * Sigma's WebGL layer and the DOM chrome share exactly one color source
 * (UIFX-01's "single token source" guarantee, extended across the
 * DOM/WebGL boundary).
 *
 * Written as a small, pure, re-callable function (no module-level caching
 * of the result) so a future v2 dark-mode toggle can re-invoke it after
 * flipping a `[data-theme]` attribute and re-apply the returned values to
 * Sigma settings + node attributes — D-12's "must not require rework"
 * clause. NOT wired to any live re-theming mechanism in Phase 2 (v2, out of
 * scope) — this function's reusability is what makes that future work cheap.
 */
export function readThemeTokens(): ThemeTokens {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();

  return {
    bg: read("--color-bg"),
    surface: read("--color-surface"),
    accent: read("--color-accent"),
    danger: read("--color-danger"),
    edge: read("--color-edge"),
    text: read("--color-text"),
    areaPhysics: read("--area-physics"),
    areaSociety: read("--area-society"),
    areaEngineering: read("--area-engineering"),
  };
}

/**
 * Maps each research area to its bridged ring color. Takes tokens as a
 * parameter (rather than re-reading getComputedStyle itself) so it stays a
 * pure function usable in both DOM and test contexts, and so it never
 * becomes a second place CSS values are read from.
 */
export function AREA_COLOR(tokens: ThemeTokens): Record<Tech["area"], string> {
  return {
    physics: tokens.areaPhysics,
    society: tokens.areaSociety,
    engineering: tokens.areaEngineering,
  };
}
