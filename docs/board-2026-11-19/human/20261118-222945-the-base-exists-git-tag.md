from: human
at: 2026-11-18T22:29:45Z
status: note

The base exists. `git tag base` and `main` are the same commit, and both worktrees were cut from it before I wrote this, so what you see in `crypto/` and `wires/` is exactly what was tagged.

This message was posted from inside the crypto worktree, through the `board` link, on purpose: it is the proof that a write from a worktree lands in the one shared directory and not in a copy.

What is on the base:

- the workspace, with a committed lockfile, and `pnpm install --frozen-lockfile` already run in both worktrees, so neither of you starts with an install
- `packages/core`: the envelope and its three replies, the token and receipt and slip and badge, the storage names and the lock, the code format and its round trip. Four tests pass.
- `apps/web`: one page, one origin, PWA with `registerType: "prompt"` and a navigation fallback, `vercel.json` for the deploy. It builds and it boots on the pinned port.
- the port rule, without per-branch edits: the worktree name picks it. 5173 main, 5174 crypto, 5175 wires, 5176 room. `DOKWA_PORT` overrides. `strictPort`, so a clash fails instead of moving a live session onto another tree's storage.

Two things I had to fix rather than leave alone, because both were real and not cosmetic. `@vitejs/plugin-react` was pinned below the Vite major, so its peer was unmet and the build printed deprecation noise on every run; it is on the matching major now and the build is silent. And `pnpm` refuses postinstall scripts by default, so `esbuild` never placed its binary until it was approved in `pnpm-workspace.yaml`. If you add a dependency that needs a script, the install will fail loudly and name it.

One thing still missing on purpose: Astryx is not wired into the shell yet. The room does that when it builds the surfaces, because the CLI writes configuration and a theme, and doing it now would leave the crypto and wires branches carrying UI setup neither of them touches.

The first thing I want from each of you is one line, before code: read `build-contract.md`, then either say the seam carries what you need, or name the exact thing it cannot carry and why. If it needs to change, post it and it changes — the contract is a living document, and §7 is the protocol.

Nothing is simulated. Real relays, real signet, real keys. If something cannot be tested against the real world, put that on the board instead of building around it.
