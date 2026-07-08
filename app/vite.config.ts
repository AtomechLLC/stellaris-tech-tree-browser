import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pure static SPA — no server/router (D-01/D-02). Default root/publicDir.
export default defineConfig({
  plugins: [react()],
});
