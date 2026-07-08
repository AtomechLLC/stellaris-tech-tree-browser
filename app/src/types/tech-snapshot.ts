/**
 * Single source of truth re-export (D-04) — the app package NEVER redeclares
 * the Tech/TechSnapshot shape. This module re-exports the Phase 1 types (and
 * the Zod schema, for optional runtime validation) directly from the
 * pipeline package so schema drift becomes a compile error, not a silent
 * divergence between two hand-synced copies.
 *
 * Do NOT edit pipeline/tsconfig.json or pipeline/src/schema/tech-snapshot.ts
 * from this package — see CONTEXT.md D-04 and RESEARCH.md Option A.
 */
export type { Tech, TechSnapshot } from "../../../pipeline/src/schema/tech-snapshot";
export { TechSnapshotSchema } from "../../../pipeline/src/schema/tech-snapshot";
