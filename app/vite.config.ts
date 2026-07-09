import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pure static SPA — no server/router (D-01/D-02). Default root/publicDir.
export default defineConfig({
  plugins: [react()],
  // Allow Cloudflare quick-tunnel hosts (e.g. *.trycloudflare.com) to reach the
  // dev server for sharing local previews. Leading dot = match any subdomain.
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
});
