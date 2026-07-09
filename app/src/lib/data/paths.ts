/**
 * URL for a file under the generated `data/` directory, honoring Vite's deploy
 * base (`import.meta.env.BASE_URL`, which always ends with "/").
 *
 * So it resolves correctly whether the app is hosted at the root ("/" → wp1.host,
 * a user/org page, or a custom domain) OR at a GitHub PROJECT-page subpath
 * ("/<repo>/"). The `base` is set at build time via the `base` Vite option
 * (see vite.config.ts / the `VITE_BASE` env in the Pages workflow).
 */
export function dataUrl(relPath: string): string {
  return `${import.meta.env.BASE_URL}data/${relPath.replace(/^\/+/, "")}`;
}
