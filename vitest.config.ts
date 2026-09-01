import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/pipeline/**/*.test.mjs"],
    // Runs under `node --test` (it imports node:test, which vitest cannot bundle).
    exclude: [
      "**/node_modules/**",
      "scripts/pipeline/level-records.test.mjs",
      "scripts/pipeline/parse-hours.test.mjs",
    ],
  },
});
