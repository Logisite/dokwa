import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // This package owns the live signet legs: never grab more than two
    // workers, so a run cannot starve the other agents or burst the shared
    // explorers. The per-test timeouts stay explicit in the rigs.
    maxWorkers: 2,
    minWorkers: 1,
    fileParallelism: false,
  },
});
