import { defineConfig } from "vitest/config";

// The smoke test builds a graphology graph from a disk-read tech.json — a
// pure Node computation, no DOM required, so the "node" environment is
// sufficient and faster than "jsdom".
export default defineConfig({
  test: {
    environment: "node",
  },
});
