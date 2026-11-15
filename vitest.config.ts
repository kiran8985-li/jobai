import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" throws outside a React Server environment; tests run server code directly.
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
