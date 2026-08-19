import { parsePdxText } from "../lib/pdxText";

/**
 * Renders save-file-derived or empire-designs-file-derived text (empire
 * names, player names, design entry names) with Paradox color codes as
 * colored spans; plain text passes through untouched.
 *
 * This is the ONLY sanctioned way to render this kind of text. It works by
 * mapping `parsePdxText(raw)` segments to React text nodes / `<span
 * style={{ color }}>` elements. React's raw-HTML-injection escape hatch is
 * off-limits for this data (RESEARCH.md Security Domain): raw names can
 * carry untrusted bytes from a user-uploaded file or save, and must never
 * be interpreted as markup.
 *
 * Promoted out of `EmpirePanel.tsx` (04-05) so `EmpireManagerPanel.tsx` can
 * share the exact same rendering path.
 */
export function PdxName({ raw }: { raw: string }) {
  const segments = parsePdxText(raw);
  return (
    <>
      {segments.map((s, i) =>
        s.color ? (
          <span key={i} style={{ color: s.color }}>
            {s.text}
          </span>
        ) : (
          s.text
        ),
      )}
    </>
  );
}
