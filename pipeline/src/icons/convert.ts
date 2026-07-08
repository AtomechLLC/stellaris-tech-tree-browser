/**
 * DDS -> WebP icon conversion (DATA-04, D-11, D-12) + placeholder fallback (D-13).
 *
 * Implements the VERIFIED chain from RESEARCH.md's "Verified icon conversion
 * chain" code example exactly:
 *   1. `execFileSync('magick', [ddsPath, pngTempPath])` -- DDS -> PNG via
 *      ImageMagick's native DDS coder. ARGUMENT ARRAY, never a shell string,
 *      no `shell: true` -- this is the T-04-01 mitigation. gameRoot-derived
 *      paths are user-configurable (D-15) and must never be concatenated
 *      into a shell command.
 *   2. `sharp(pngTempPath).webp({ lossless: true }).toFile(webpOutPath)` --
 *      PNG -> lossless WebP (D-11), preserving alpha where the source
 *      actually has non-uniform alpha data (libvips correctly omits a
 *      fully-opaque alpha channel from the WebP output as a lossless-safe
 *      optimization -- verified in this plan's research pass against real
 *      corpus files: a fully-opaque DXT5 icon loses no information by
 *      dropping alpha, while a genuinely-transparent DXT3 icon keeps it).
 *
 * Verified end-to-end in RESEARCH.md and re-confirmed in this plan against
 * real Stellaris 4.5.0 icons spanning uncompressed 24/32bpp, DXT1, DXT3, and
 * DXT5 -- all convert cleanly at native 52x52 resolution. No texconv
 * fallback is implemented for v1; ImageMagick's DDS coder already handles
 * every compression variant observed in the 864-file corpus. If a future
 * game patch introduces a fidelity issue ImageMagick can't handle, texconv
 * (Microsoft DirectXTex, Windows-only) is the documented contingency (D-12)
 * -- swap the `execFileSync('magick', ...)` call for a `execFileSync('texconv', ...)`
 * equivalent; no other part of this chain would need to change.
 */
import { execFileSync } from "node:child_process";
import { unlinkSync, copyFileSync } from "node:fs";
import sharp from "sharp";

/**
 * Converts a single DDS icon to a lossless WebP via ImageMagick (DDS -> PNG)
 * then sharp (PNG -> WebP). The intermediate PNG temp file is removed after
 * conversion regardless of outcome.
 *
 * Throws if `magick` is not on PATH or the DDS is unreadable (T-04-03) --
 * the caller (assemble.ts, per D-13) is responsible for catching a failure
 * here and falling back to the shipped placeholder rather than failing the
 * whole build.
 */
export async function convertDdsToWebp(ddsPath: string, pngTempPath: string, webpOutPath: string): Promise<void> {
  try {
    // ARGUMENT ARRAY -- never a shell string; no shell: true (T-04-01 mitigation).
    execFileSync("magick", [ddsPath, pngTempPath]);
    await sharp(pngTempPath).webp({ lossless: true }).toFile(webpOutPath);
  } finally {
    try {
      unlinkSync(pngTempPath);
    } catch {
      // Best-effort cleanup -- a missing/already-removed temp file is not an error.
    }
  }
}

/**
 * Writes the shipped placeholder icon to `destPath` for a tech with no
 * resolvable icon source (D-13: warn, never fail the build). The caller
 * logs the warning; this helper only performs the file copy.
 */
export function writePlaceholderIcon(placeholderPath: string, destPath: string): void {
  copyFileSync(placeholderPath, destPath);
}
