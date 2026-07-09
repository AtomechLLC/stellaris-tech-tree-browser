import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { RefObject } from "react";

/**
 * Horizontal + vertical scrollbars for the pan/zoom canvas. The canvas pans via
 * a single imperative CSS transform (no React re-render per pan), so these bars
 * can't be native overflow scrollbars — instead each is a thin track + thumb
 * that mirrors the current transform, and dragging a thumb (or clicking its
 * track) calls back with a new transform. The parent drives `update()` from its
 * `applyTransform` so the thumbs track every pan/zoom; the bars auto-hide on an
 * axis with no overflow. Pointer events are stopped so a thumb drag never starts
 * a canvas pan.
 */

interface Transform {
  scale: number;
  x: number;
  y: number;
}

export interface ScrollbarsHandle {
  update: () => void;
}

interface Props {
  /** Unscaled canvas content size (the layout width/height). */
  contentW: number;
  contentH: number;
  viewportRef: RefObject<HTMLDivElement | null>;
  transformRef: RefObject<Transform>;
  applyTransform: (t: Transform) => void;
}

const BAR = 10; // track thickness (px)
const GUTTER = BAR + 2; // reserved corner so the two bars don't overlap
const MIN_THUMB = 28; // smallest thumb so it stays grabbable when zoomed far out

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const MapScrollbars = forwardRef<ScrollbarsHandle, Props>(function MapScrollbars(
  { contentW, contentH, viewportRef, transformRef, applyTransform },
  ref,
) {
  const hBarRef = useRef<HTMLDivElement>(null);
  const vBarRef = useRef<HTMLDivElement>(null);
  const hThumbRef = useRef<HTMLDivElement>(null);
  const vThumbRef = useRef<HTMLDivElement>(null);
  // Active thumb drag; null when idle. Geometry is frozen at drag start (scale
  // and content don't change mid-drag), so moves are a cheap linear map.
  const dragRef = useRef<{
    axis: "x" | "y";
    startClient: number;
    startTranslate: number;
    range: number; // (trackLen - thumbLen): thumb travel in px
    maxScroll: number; // hidden content px on this axis
  } | null>(null);

  // Reposition + resize both thumbs from the current transform. Called every
  // pan/zoom tick (via the imperative handle) and on layout/resize.
  const update = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const t = transformRef.current;

    const axis = (
      contentPx: number,
      viewPx: number,
      translate: number,
      bar: HTMLDivElement | null,
      thumb: HTMLDivElement | null,
      horizontal: boolean,
    ) => {
      if (!bar || !thumb) return;
      const scaled = contentPx * t.scale;
      const trackLen = (horizontal ? vw : vh) - GUTTER;
      const overflow = scaled > viewPx + 1 && trackLen > MIN_THUMB;
      bar.style.display = overflow ? "block" : "none";
      if (!overflow) return;
      const thumbLen = Math.max(MIN_THUMB, (viewPx / scaled) * trackLen);
      const maxScroll = scaled - viewPx;
      const scrolled = clamp(-translate, 0, maxScroll);
      const posFrac = maxScroll > 0 ? scrolled / maxScroll : 0;
      const pos = posFrac * (trackLen - thumbLen);
      if (horizontal) {
        thumb.style.width = `${thumbLen}px`;
        thumb.style.transform = `translateX(${pos}px)`;
      } else {
        thumb.style.height = `${thumbLen}px`;
        thumb.style.transform = `translateY(${pos}px)`;
      }
    };

    axis(contentW, vw, t.x, hBarRef.current, hThumbRef.current, true);
    axis(contentH, vh, t.y, vBarRef.current, vThumbRef.current, false);
  }, [contentW, contentH, viewportRef, transformRef]);

  useImperativeHandle(ref, () => ({ update }), [update]);
  // Re-sync whenever the content size (layout/filter) changes.
  useEffect(() => {
    update();
  }, [update]);

  // ── Thumb drag ────────────────────────────────────────────────────────────
  const onThumbDown = useCallback(
    (axis: "x" | "y") => (e: React.PointerEvent<HTMLDivElement>) => {
      const vp = viewportRef.current;
      if (!vp) return;
      e.stopPropagation();
      e.preventDefault();
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      const t = transformRef.current;
      const horizontal = axis === "x";
      const scaled = (horizontal ? contentW : contentH) * t.scale;
      const viewPx = horizontal ? vw : vh;
      const trackLen = (horizontal ? vw : vh) - GUTTER;
      const thumbLen = Math.max(MIN_THUMB, (viewPx / scaled) * trackLen);
      dragRef.current = {
        axis,
        startClient: horizontal ? e.clientX : e.clientY,
        startTranslate: horizontal ? t.x : t.y,
        range: trackLen - thumbLen,
        maxScroll: scaled - viewPx,
      };
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* no active pointer to capture (e.g. synthetic event) */
      }
    },
    [contentW, contentH, viewportRef, transformRef],
  );

  const onThumbMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      e.stopPropagation();
      const client = d.axis === "x" ? e.clientX : e.clientY;
      const dScroll = d.range > 0 ? ((client - d.startClient) / d.range) * d.maxScroll : 0;
      const translate = clamp(d.startTranslate - dScroll, -d.maxScroll, 0);
      const t = transformRef.current;
      applyTransform(
        d.axis === "x" ? { ...t, x: translate } : { ...t, y: translate },
      );
    },
    [applyTransform, transformRef],
  );

  const onThumbUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }, []);

  // Click on the track (not the thumb) → page the view toward the click point.
  const onTrackDown = useCallback(
    (axis: "x" | "y") => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return; // let thumb handle its own clicks
      const vp = viewportRef.current;
      if (!vp) return;
      e.stopPropagation();
      const horizontal = axis === "x";
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      const t = transformRef.current;
      const scaled = (horizontal ? contentW : contentH) * t.scale;
      const viewPx = horizontal ? vw : vh;
      const trackLen = (horizontal ? vw : vh) - GUTTER;
      const thumbLen = Math.max(MIN_THUMB, (viewPx / scaled) * trackLen);
      const barRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickPos = (horizontal ? e.clientX - barRect.left : e.clientY - barRect.top) - thumbLen / 2;
      const range = trackLen - thumbLen;
      const posFrac = range > 0 ? clamp(clickPos / range, 0, 1) : 0;
      const maxScroll = scaled - viewPx;
      const translate = -(posFrac * maxScroll);
      applyTransform(horizontal ? { ...t, x: translate } : { ...t, y: translate });
    },
    [contentW, contentH, viewportRef, transformRef, applyTransform],
  );

  return (
    <>
      <div
        ref={hBarRef}
        className="map-scrollbar map-scrollbar--h"
        style={{ display: "none" }}
        onPointerDown={onTrackDown("x")}
      >
        <div
          ref={hThumbRef}
          className="map-scrollbar__thumb"
          onPointerDown={onThumbDown("x")}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          onPointerCancel={onThumbUp}
        />
      </div>
      <div
        ref={vBarRef}
        className="map-scrollbar map-scrollbar--v"
        style={{ display: "none" }}
        onPointerDown={onTrackDown("y")}
      >
        <div
          ref={vThumbRef}
          className="map-scrollbar__thumb"
          onPointerDown={onThumbDown("y")}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          onPointerCancel={onThumbUp}
        />
      </div>
    </>
  );
});
