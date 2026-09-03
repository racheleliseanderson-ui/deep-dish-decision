import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/pipeline/**/*.test.mjs"],
    // These import node:test, which vitest cannot bundle. package.json runs them
    // under `node --test`. resolve-targets was added to that command and not to
    // this list, so `vitest run` has been failing on it ever since — one red
    // suite is enough to stop anyone reading the other four.
    exclude: [
      "**/node_modules/**",
      "scripts/pipeline/level-records.test.mjs",
      "scripts/pipeline/parse-hours.test.mjs",
      "scripts/pipeline/resolve-targets.test.mjs",
    ],
  },
});
