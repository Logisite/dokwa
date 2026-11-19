import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The wallet's tests do real noble/cashu cryptography, which can take a
    // few seconds when the whole workspace runs in parallel. This is a
    // budget for the work, not a loosening of any assertion.
    testTimeout: 20_000,
  },
});
