/** Strips a known id prefix, unslugs, and Title-Cases a raw Stellaris id
 *  (e.g. `ethic_fanatic_militarist` → "Fanatic Militarist",
 *  `ethic_absolute_militarist` → "Absolute Militarist"). No localisation for
 *  these lives in the snapshot, so this humanizes the raw key. */
export function humanizeId(id: string): string {
  return id
    .replace(/^(auth_|origin_|ethic_|civic_|ap_|sp_)/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
