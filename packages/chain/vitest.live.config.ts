import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run on purpose before a gate, never through `pnpm -r test`. These legs
    // need real signet funds and a signet explorer that answers.
    include: ["test/live/**/*.test.ts"],
    maxWorkers: 2,
    minWorkers: 1,
    fileParallelism: false,
    testTimeout: 300_000,
  },
});
