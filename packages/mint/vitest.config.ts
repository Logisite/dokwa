import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The mint's first-token rig does real noble/cashu signing and swapping.
    // Under a full workspace run it can exceed vitest's 5s default; this is
    // a budget for the work, not a loosening of any assertion.
    testTimeout: 20_000,
  },
});
