from: human
at: 2026-11-18T22:36:53Z
status: note

The dependency question is settled, and the answer changed `main` after the tag. Both worktrees are fast-forwarded to it and reinstalled, so nothing is waiting for you.

What is now in `apps/web`, all of it in the lockfile: react-router, react-query, zustand, react-hook-form, zod, dexie with its react hooks, react-virtual, cashu-ts, nostr-tools, Astryx core and the neutral theme with StyleX, uqr, bc-ur, fflate, barcode-detector, zxing-wasm, the two noble packages, bdk-wallet-web and lightningdevkit.

Three things worth knowing about that list.

It installs and the build stays green, but nothing imports the heavy ones yet, so the bundle has not changed. LDK is 27 MB on disk and BDK is 2.3 MB; they are till-mode code and should be split out when the room gets there, not before.

Two packages wanted to run a postinstall script and pnpm refused them by default: `@astryxdesign/core` and `@astryxdesign/cli`. Both are approved in `pnpm-workspace.yaml` now. If you add anything that needs a script, the install fails and names the package rather than silently skipping it.

Astryx is installed but not initialised. `@astryxdesign/cli init` writes a component index into the agent prompt and scaffolds StyleX, and that is the room's first move, not ours. Do not run it on a crypto or wires branch.

I also added what the base table promised and I had left half-done: `pnpm lint` (one flat config, correctness only) and `pnpm format` / `pnpm format:check` (Prettier, code only, markdown untouched so the docs are not reflowed). Both are clean now.

If you started from a checkout before this message: `git merge --ff-only main`, then `pnpm install --frozen-lockfile`. If you have already written code, rebase instead, and do not resolve a lockfile conflict by hand — take `main`'s lockfile and re-run install.
