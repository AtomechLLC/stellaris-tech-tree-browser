import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pure static SPA — no server/router (D-01/D-02). Default root/publicDir.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // The app imports its schema (and thus `zod`) from the sibling pipeline source
    // (`../pipeline/src/schema`). Node/bundler resolution would look for `zod` in
    // `pipeline/node_modules`, which a standalone `cd app && npm ci` deploy never
    // installs. Pin `zod` to the app's own copy (declared in app deps, same
    // version) so the build is self-contained. Mirrors the tsconfig `paths`.
    alias: {
      zod: fileURLToPath(new URL("./node_modules/zod", import.meta.url)),
    },
  },
  // Allow Cloudflare quick-tunnel hosts (e.g. *.trycloudflare.com) to reach the
  // dev server for sharing local previews. Leading dot = match any subdomain.
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
});
