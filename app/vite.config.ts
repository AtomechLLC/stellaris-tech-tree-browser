import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pure static SPA — no server/router (D-01/D-02). Default root/publicDir.
export default defineConfig({
  // Deploy base. "/" for root hosting (wp1.host, a user/org page, a custom
  // domain); set VITE_BASE="/<repo>/" when building for a GitHub PROJECT page so
  // asset + data URLs resolve under the subpath (see .github/workflows).
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  // Allow Cloudflare quick-tunnel hosts (e.g. *.trycloudflare.com) to reach the
  // dev server for sharing local previews. Leading dot = match any subdomain.
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
});
