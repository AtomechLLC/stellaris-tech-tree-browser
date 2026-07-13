/**
 * Paradox text-format codes. Player/empire names from a .sav can embed color
 * escapes: `\x11<letter>` pushes a color, `\x11!` pops it (the game also
 * accepts `§` as the escape char in localisation). A rainbow nickname like
 * "Xelnath" arrives as `\x11RX\x11!\x11Ye\x11!…` — one colored letter at a
 * time. `\x13<name>` embeds an inline icon (we strip those).
 *
 * `parsePdxText` → colored segments for rich display; `stripPdxCodes` → plain
 * text for contexts that can't take markup (<select> options, tooltips).
 */

/** Stellaris text color codes → CSS colors (community-documented palette;
 *  close-enough approximations — the point is R reads red, Y reads yellow). */
const PDX_COLORS: Record<string, string> = {
  B: "#4f9dff", // blue
  C: "#4fd0ff", // cyan
  E: "#5ad9c1", // teal
  G: "#4fce4f", // green
  H: "#ffb84f", // orange (highlight)
  L: "#c8a26a", // ochre/brown
  M: "#d95fd9", // magenta/purple
  P: "#ff9dc4", // pink
  R: "#ff4f4f", // red
  S: "#e8a33d", // dark orange
  T: "#c9ced6", // light grey
  W: "#ffffff", // white
  Y: "#ffe14f", // yellow
  g: "#8a8f98", // dark grey
};

// Control chars built via fromCharCode so no invisible literals live in this
// file (editors/diff tools tend to mangle raw 0x11/0x13 bytes).
const COLOR_ESCAPE = String.fromCharCode(0x11); // save-file color escape
const COLOR_ESCAPE_LOC = "§"; // localisation color escape
const ICON_ESCAPE = String.fromCharCode(0x13); // inline icon token

export interface PdxSegment {
  color: string | null;
  text: string;
}

/** Split a raw string into colored segments (color = CSS color or null). */
export function parsePdxText(raw: string): PdxSegment[] {
  const segments: PdxSegment[] = [];
  const colorStack: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      segments.push({ color: colorStack[colorStack.length - 1] ?? null, text: buf });
      buf = "";
    }
  };
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === COLOR_ESCAPE || ch === COLOR_ESCAPE_LOC) {
      const code = raw[i + 1];
      i++; // consume the code char too
      if (code === "!") {
        flush();
        colorStack.pop();
      } else if (code && PDX_COLORS[code]) {
        flush();
        colorStack.push(PDX_COLORS[code]!);
      }
      // Unknown code: drop the escape pair, keep surrounding text as-is.
      continue;
    }
    if (ch === ICON_ESCAPE) {
      // Inline icon token: \x13<word> — skip the whole token.
      while (i + 1 < raw.length && /\w/.test(raw[i + 1]!)) i++;
      continue;
    }
    buf += ch;
  }
  flush();
  return segments;
}

/** Plain text with all color/icon codes removed (same rule stellarmaps uses). */
export function stripPdxCodes(raw: string): string {
  return parsePdxText(raw)
    .map((s) => s.text)
    .join("");
}
