import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { RefObject } from "react";
import { CARD_LEFT_PAD, COL_EXTRA, TIER_COUNT } from "../lib/tree/layoutTree";
import { CARD_W } from "./TechCard";

/**
 * Tier ruler — a fixed strip along the top of the map viewport labelling the
 * tier COLUMNS ("Tier 0" … "Tier 5"). The swimlane bands label categories on
 * the vertical axis, but nothing labelled the horizontal one. Labels are
 * positioned imperatively from the shared pan/zoom transform (like the
 * scrollbars/zoom readout — no React re-render per pan tick). Map mode only.
 */

interface Transform {
  scale: number;
  x: number;
  y: number;
}

export interface TierRulerHandle {
  update: () => void;
}

interface Props {
  viewportRef: RefObject<HTMLDivElement | null>;
  transformRef: RefObject<Transform>;
}

const COL_W = CARD_W + COL_EXTRA;

export const TierRuler = forwardRef<TierRulerHandle, Props>(function TierRuler(
  { viewportRef, transformRef },
  ref,
) {
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);

  const update = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const t = transformRef.current;
    for (let tier = 0; tier < TIER_COUNT; tier++) {
      const el = labelRefs.current[tier];
      if (!el) continue;
      // Column center in canvas coords → screen x.
      const cx = (CARD_LEFT_PAD + tier * COL_W + CARD_W / 2) * t.scale + t.x;
      const visible = cx > 24 && cx < vw - 24;
      el.style.display = visible ? "" : "none";
      if (visible) el.style.transform = `translateX(${Math.round(cx)}px)`;
    }
  }, [viewportRef, transformRef]);

  useImperativeHandle(ref, () => ({ update }), [update]);
  useEffect(() => {
    update();
  }, [update]);

  return (
    <div className="tier-ruler" aria-hidden>
      {Array.from({ length: TIER_COUNT }, (_, tier) => (
        <span
          key={tier}
          ref={(el) => {
            labelRefs.current[tier] = el;
          }}
          className="tier-ruler__label"
          data-tier={tier}
        >
          Tier {tier}
        </span>
      ))}
    </div>
  );
});
