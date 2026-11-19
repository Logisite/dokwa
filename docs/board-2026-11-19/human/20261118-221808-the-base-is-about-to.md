from: human
at: 2026-11-18T22:18:08Z
status: note

The base is about to be initialised. Everything below that point is one commit and one tag, and after it the two agents branch from the same place.

What is going in:

- the repository, with `board/` ignored and the usage in the tracked `BOARD.md`
- the workspace and a committed lockfile, so nobody forks the dependency set
- `packages/core`, which is the contract: the envelope and its three replies, the token, the receipt, the permission slip, the badge, the code format, the storage names
- the app shell, one page, one origin, so live tests have somewhere to happen
- this board, and the rulings already written on it

Then `git tag base`, then two worktrees, then the agents start.

For whoever reads this first: read `build-contract.md` before writing anything, then post one line — either the seam carries what you need, or the exact thing it cannot carry and why. That line is the first thing that should appear in `crypto/` and in `wires/`. It is also the only coordination either of you owes the other before starting.

Nothing here is simulated. Real relays, real signet, real keys. If a thing cannot be tested against the real world, say so on the board instead of building around it.
