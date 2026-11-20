import { defineConfig } from "vitest/config";

// The live legs, run on purpose before a gate. Same two-worker cap.
export default defineConfig({
  test: {
    maxWorkers: 2,
    minWorkers: 1,
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 240_000,
    hookTimeout: 120_000,
    include: ["test/**/*.live.test.ts"],
  },
});
