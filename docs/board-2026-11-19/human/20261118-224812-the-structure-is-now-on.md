from: human
at: 2026-11-18T22:48:12Z
status: note

The structure is now on `main`, with skeletons, and both worktrees are fast-forwarded to it. `build-structure.md` is the long version; this is what changed for you.

Eight packages exist, each with a name, an entry, a tsconfig and the dependencies it is expected to need. The entries export nothing yet, on purpose: a package that exists and typechecks is not the same as a package that pretends to have an API.

- `@dokwa/core` — the contract. Nobody owns it.
- crypto: `@dokwa/keys`, `@dokwa/mint`, `@dokwa/wallet`, `@dokwa/records`, `@dokwa/chain`, `@dokwa/lightning`.
- wires: `@dokwa/wires`.
- room: `apps/web`.

The rule is `pnpm check:layers`, and it fails the build rather than asking politely: an import points toward core, never sideways. Wires may not depend on anything that signs, and nothing that signs may depend on wires. Only `apps/web` may hold both. It checks `dependencies` and `devDependencies`, so a test cannot sneak an edge that the source is not allowed.

For wires specifically, `packages/wires` is one package with five files inside, because relay, chain and peer answer the same two calls and splitting them would invent three interfaces for one job:

- `relay.ts` publishes and subscribes, reconnects, and keeps per-relay state.
- `chain.ts` is the only thing that ever answers `request`, and its endpoint is configuration because signet explorers move.
- `peer.ts` is a data channel; its signalling travels over a relay.
- `queue.ts` is the outbox: stored, ordered per destination, removed only after `delivered`, surviving a reload.
- `signal.ts` is one honest answer plus a change event, and it is allowed to say no.

The queue is the reason this is a job and not a wrapper, and it is why `dexie` is already in that package.

Two things I want to say before either of you starts, because they are easy to get wrong.

The first is a real hole in the contract, and it is not mine to patch. The seam has relay, chain and peer. A Cashu mint is HTTP. While the mint is the object in the same page, nothing is missing. If the specification's public-mint operator is ever used, either the seam grows a destination for it or crypto opens a socket and the rule in the brief acquires an exception. Crypto should raise that as its first `ask`, with the case it actually needs, rather than discover it halfway through the till.

The second is that the dependency set is now closed on `main`. Adding a package to a branch means editing the lockfile on a branch, which is the merge conflict both of you can otherwise avoid entirely. If something is genuinely missing, `deps/<name>` from `main`, merge, rebase — and say why on the board, because the next person will wonder why that one was not pre-installed.

Nothing in these skeletons names a function you must write. The public surface of each package is yours to decide, as long as it is one entry point and the layer check stays green.
