import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { readThemeTokens, AREA_COLOR } from "../lib/sigma/theme";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * vitest's default environment for this package is "node" (see
 * vitest.config.ts — the layout/smoke tests are pure disk-read graph
 * computations with no DOM need). Rather than switching the whole package to
 * a jsdom environment (a new dependency + config change not required by any
 * other test here), this test stubs `document`/`getComputedStyle` directly —
 * the plan's own guidance is to "pick the approach that runs headless in
 * vitest." readThemeTokens() must only ever call getComputedStyle, never
 * hardcode a token value, so stubbing the DOM API is a faithful test of the
 * bridge's actual behavior (Pattern 4).
 *
 * The stub's token values are parsed directly from the real tokens.css file
 * (not hand-copied hex literals) — this both satisfies the "no hardcoded hex
 * outside tokens.css" gate and keeps the test honest against drift: if
 * tokens.css changes a value, this test automatically tracks it.
 */
function loadRealTokenValues(): Record<string, string> {
  const cssPath = join(__dirname, "..", "styles", "tokens.css");
  const css = readFileSync(cssPath, "utf-8");
  const tokens: Record<string, string> = {};
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function stubComputedStyle(tokens: Record<string, string>) {
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalGetComputedStyle = (globalThis as { getComputedStyle?: unknown })
    .getComputedStyle;

  (globalThis as { document?: unknown }).document = {
    documentElement: {},
  };
  (globalThis as { getComputedStyle?: unknown }).getComputedStyle = () => ({
    getPropertyValue: (name: string) => tokens[name] ?? "",
  });

  return () => {
    (globalThis as { document?: unknown }).document = originalDocument;
    (globalThis as { getComputedStyle?: unknown }).getComputedStyle =
      originalGetComputedStyle;
  };
}

describe("readThemeTokens (D-12 CSS var -> Sigma bridge)", () => {
  it("returns non-empty strings for every required token via getComputedStyle", () => {
    const realTokens = loadRealTokenValues();
    const restore = stubComputedStyle(realTokens);
    try {
      const tokens = readThemeTokens();

      expect(tokens.bg).toBe(realTokens["--color-bg"]);
      expect(tokens.edge).toBe(realTokens["--color-edge"]);
      expect(tokens.text).toBe(realTokens["--color-text"]);
      expect(tokens.areaPhysics).toBe(realTokens["--area-physics"]);
      expect(tokens.areaSociety).toBe(realTokens["--area-society"]);
      expect(tokens.areaEngineering).toBe(realTokens["--area-engineering"]);

      for (const value of Object.values(tokens)) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      }
    } finally {
      restore();
    }
  });
});

describe("AREA_COLOR (area -> ring color mapping)", () => {
  it("maps physics/society/engineering to three distinct colors", () => {
    const realTokens = loadRealTokenValues();
    const restore = stubComputedStyle(realTokens);
    try {
      const tokens = readThemeTokens();
      const areaColor = AREA_COLOR(tokens);

      const colors = [areaColor.physics, areaColor.society, areaColor.engineering];
      expect(new Set(colors).size).toBe(3);
    } finally {
      restore();
    }
  });

  it("uses the deliberate vermillion token for engineering, not a green value", () => {
    const realTokens = loadRealTokenValues();
    const restore = stubComputedStyle(realTokens);
    try {
      const tokens = readThemeTokens();
      const areaColor = AREA_COLOR(tokens);

      expect(areaColor.engineering).toBe(realTokens["--area-engineering"]);
      // Guard against a regression to a green value (the classic
      // deuteranopia-failure pairing this palette was chosen to avoid): a
      // green hex has a dominant green channel and low red/blue channels.
      const hex = areaColor.engineering.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const isGreenish = g > r && g > b;
      expect(isGreenish).toBe(false);
    } finally {
      restore();
    }
  });
});
