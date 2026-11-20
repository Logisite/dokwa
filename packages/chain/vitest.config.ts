import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The default command is deterministic: the live signet legs live in
    // test/live and run only through `pnpm --filter @dokwa/chain test:live`.
    exclude: [...configDefaults.exclude, "test/live/**"],
    maxWorkers: 2,
    minWorkers: 1,
  },
});
