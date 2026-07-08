import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { TechSnapshot, Tech } from "../types/tech-snapshot";
import { layoutTree, type TreeLayout } from "../lib/tree/layoutTree";
import { TechCard, CARD_W, CARD_H } from "./TechCard";
import { EdgeLayer } from "./EdgeLayer";
import { Legend } from "./Legend";
import { LoadingOverlay } from "./LoadingOverlay";
import { ErrorOverlay } from "./ErrorOverlay";

/**
 * Interactive DOM tech tree. Runs `layoutTree` once (async ELK, in an effect),
 * then renders DOM cards + an SVG edge layer inside ONE CSS-transformed
 * `.tree-canvas`. Pan = drag on the viewport (translate state); zoom = wheel
 * toward the cursor + buttons (scale, clamped). Because cards and edges share
 * the canvas coordinate space, pan/zoom is a single CSS transform — no
 * per-frame position sync, no projection, no culling, no camera.
 *
 * Area filter tabs (All / Physics / Society / Engineering) filter which
 * nodes+edges render; area is otherwise conveyed by card COLOR (ELK optimizes
 * crossings freely — no forced area bands, matching the reference).
 */

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 1.15;

type Area = Tech["area"];

const AREA_TABS: { key: "all" | Area; label: string }[] = [
  { key: "all", label: "All" },
  { key: "physics", label: "Physics" },
  { key: "society", label: "Society" },
  { key: "engineering", label: "Engineering" },
];

type LayoutState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; layout: TreeLayout };

interface Transform {
  x: number;
  y: number;
  scale: number;
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function TechTree({ snapshot }: { snapshot: TechSnapshot }) {
  const [state, setState] = useState<LayoutState>({ status: "loading" });
  const [areaFilter, setAreaFilter] = useState<"all" | Area>("all");
  const [transform, setTransform] = useState<Transform>({ x: 40, y: 40, scale: 0.4 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  // Icon base path derived from the snapshot's OWN version (WR-02) — a future
  // game-patch snapshot needs no edit here.
  const iconBase = `/data/${snapshot.meta.gameVersion}/icons`;

  // One-shot ELK layout inside the loading state (D-08) — never re-run on
  // pan/zoom. A throw here surfaces the error state, not a blank screen.
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    layoutTree(snapshot, CARD_W, CARD_H)
      .then((layout) => {
        if (!cancelled) setState({ status: "ready", layout });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot]);

  // Filter nodes/edges by the active area tab (area shown by card color; the
  // layout itself is area-agnostic — ELK optimizes crossings, no forced bands).
  const filtered = useMemo(() => {
    if (state.status !== "ready") return null;
    const { layout } = state;
    if (areaFilter === "all") return layout;
    const nodes = layout.nodes.filter((n) => n.tech.area === areaFilter);
    const visible = new Set(nodes.map((n) => n.key));
    const edges = layout.edges.filter((e) => visible.has(e.from) && visible.has(e.to));
    return { ...layout, nodes, edges };
  }, [state, areaFilter]);

  // ── Pan (pointer drag on the viewport) ────────────────────────────────────
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: transform.x,
        originY: transform.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [transform.x, transform.y],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setTransform((t) => ({
      ...t,
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    }));
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }, []);

  // ── Zoom toward the cursor (wheel) ────────────────────────────────────────
  const onWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    setTransform((t) => {
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextScale = clampZoom(t.scale * factor);
      const ratio = nextScale / t.scale;
      // Keep the graph point under the cursor fixed while scaling.
      return {
        scale: nextScale,
        x: cursorX - (cursorX - t.x) * ratio,
        y: cursorY - (cursorY - t.y) * ratio,
      };
    });
  }, []);

  // ── Button zoom (centered on the viewport) ────────────────────────────────
  const zoomBy = useCallback((factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 0;
    const cy = rect ? rect.height / 2 : 0;
    setTransform((t) => {
      const nextScale = clampZoom(t.scale * factor);
      const ratio = nextScale / t.scale;
      return {
        scale: nextScale,
        x: cx - (cx - t.x) * ratio,
        y: cy - (cy - t.y) * ratio,
      };
    });
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: 40, y: 40, scale: 0.4 });
  }, []);

  if (state.status === "loading") return <LoadingOverlay />;
  if (state.status === "error") {
    return <ErrorOverlay onRetry={() => setState({ status: "loading" })} />;
  }

  const layout = filtered ?? state.layout;

  return (
    <div className="tech-tree">
      <div className="area-tabs" role="tablist" aria-label="Filter by research area">
        {AREA_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={areaFilter === tab.key}
            className="area-tab"
            data-area={tab.key === "all" ? undefined : tab.key}
            data-active={areaFilter === tab.key || undefined}
            onClick={() => setAreaFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="tree-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <div
          className="tree-canvas"
          style={{
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
          }}
        >
          <EdgeLayer
            edges={layout.edges}
            nodes={layout.nodes}
            width={layout.width}
            height={layout.height}
          />
          {layout.nodes.map((node) => (
            <TechCard
              key={node.key}
              tech={node.tech}
              image={node.tech.icon ? `${iconBase}/${node.tech.icon}` : undefined}
              x={node.x}
              y={node.y}
            />
          ))}
        </div>

        <div className="zoom-controls" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={resetView} aria-label="Reset view">
            ⟲
          </button>
        </div>

        <Legend />
      </div>
    </div>
  );
}
