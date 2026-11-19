import { defineConfig } from "vitest/config";

// The live legs talk to real relays and real signet, and one file publishing
// while another is syncing is a burst we inflict on ourselves. Files run one
// at a time so a live suite measures the destination's behaviour instead of
// the suite's own parallelism.
export default defineConfig({
  test: {
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 240_000,
    hookTimeout: 120_000,
  },
});
