# dokwa — file structure

`docs/dokwa-spec.md` says what the product is. `docs/dokwa-stack.md` says what it is built with. `build-timeline.md` says in what order. This says where code lives, which agent owns it, and which direction an import is allowed to point.

## 1. Three jobs, seven packages, one shared

The split is by dependency set, not by agent. Two packages belong together when they need the same things installed and can be tested without the same wasm; they are apart when putting them together would make a wallet download a Lightning node.

```
packages/
├── core/         @dokwa/core        the contract — types, naming, lock, code format
├── keys/         @dokwa/keys        one identity, one signer, seal and open
├── mint/         @dokwa/mint        the venue's issuer: keyset, issue, spent list, swap
├── wallet/       @dokwa/wallet      holding, sending, receiving, verifying ecash
├── records/      @dokwa/records     receipts, slips, badges, the lesson gate
├── chain/        @dokwa/chain       BDK: descriptor, address, deposit, payout
├── lightning/    @dokwa/lightning   LDK: node, keys, persistence
└── wires/        @dokwa/wires       the Wire: relay, chain, peer, queue, signal

apps/web/                            the room: screens, composition, PWA
```

| package | why it is separate |
|---|---|
| `keys` | tokens, receipts, slips, badges, descriptors and messages all sign with one identity. One signer, or five that drift. |
| `mint` / `wallet` | two sides of one trust boundary. The test that matters is the wallet against the till, and it needs both importable. |
| `records` | signed objects that are not money. They must not drag cashu or wasm into a unit test. |
| `chain` / `lightning` | the two wasm modules, with different sizes and different failure modes. Apart, the room can load one without the other, and a failed Lightning node does not take the chain wallet with it. |
| `wires` | one implementation of one interface. Relay, chain and peer inside it are files, not packages, because they answer the same two calls. |
| `core` | the only shared thing. It depends on nothing. |

## 2. The arrows

```
        apps/web
   ┌───┬───┼────┬────────┬───────────┬─────────┐
 mint wallet records chain  lightning  wires   keys
   └───┴───┴────┴────────┴───────────┘         │
              core  ◄──────────── keys ◄────────┘

  crypto  does not import wires
  wires   does not import crypto
```

`packages/core/src/wire.ts` is the only thing both sides know. Wires implements `Wire`; crypto takes a `Wire` as a constructor argument. Neither imports the other, and a change to one cannot break the other's build.

The rule, in one line: **an import points toward `core`, never sideways.**

## 3. Who owns what

| path | owner | how it changes |
|---|---|---|
| `packages/keys` … `packages/lightning` | crypto | directly, on `feat/crypto` |
| `packages/wires` | wires | directly, on `feat/wires` |
| `apps/web` | room | directly, on `feat/room` |
| `packages/core` | nobody | `contracts/<topic>` from `main`, merged, then rebased onto |
| `pnpm-lock.yaml` | `main` | `deps/<name>` from `main`, merged, then rebased onto |

A package is created entirely on its own branch: `package.json`, `tsconfig.json`, `src/`. Nothing shared is edited, because `pnpm-workspace.yaml` already covers `packages/*`. That is what lets two agents add packages at the same time without a merge conflict in a file neither of them owns.

## 4. One entry per package

Every package exposes one file and nothing else:

```json
"exports": { ".": "./src/index.ts" }
```

Internals are not reachable from outside. A screen cannot import `packages/mint/src/spent.ts` even if it wants to, which is how "write down the calls the room is allowed to make" is enforced by the build rather than by a document.

## 5. Where the three meet

Exactly one file: `apps/web/src/lib/boot.ts`.

```ts
const wire = createWire({ /* queue, signal */ });
const keys = await openKeys({ role: "till" });
const mint = openMint({ keys, db: dbName("till") });     // the mint is in this page
const chain = await createChainWallet({ keys, wire });   // wire injected, never imported
const wallet = openWallet({ keys, wire });               // the same code the patron runs
```

Screens call `lib/`, never a package directly. A screen that computes a balance is a second implementation of the balance.

Till-only wasm is loaded there, lazily, so wallet mode does not pay for a Lightning node:

```ts
const { createLightningNode } = await import("@dokwa/lightning");
```

## 6. Where tests live

| test | where |
|---|---|
| signing maths, spent list, sealing | `packages/<own>/test`, vitest, no browser |
| the wallet against the till | `apps/web/test`, the only place allowed to import both |
| relays, queue, peer channel | `packages/wires/test`, real destinations |
| a deposit and a payout | `packages/chain/test`, real signet |
| the night, offline, install, camera | `apps/web`, a real browser at phone size |

No fixtures that invent data. A token in a test came from a real mint call; an address came from a real descriptor; an event id can be looked up.

## 7. What is not shared

- **storage:** `core` names the databases and the lock; each package opens its own store under that name. Nothing talks to another package's tables.
- **transport:** only the `Wire` type crosses the seam. There is no HTTP client in crypto, and no codec in wires.
- **UI:** nothing outside `apps/web` knows a screen exists.

## 8. The question this structure cannot answer

The seam has three destinations: relay, chain, peer. A Cashu mint is reached over HTTP.

While the mint is the object in the same page, nothing is missing: the wallet calls it in process, and the event runs with the radio off. If a remote or public mint is used — one of the operators the specification keeps open — then either the seam grows a mint destination, or crypto opens a socket and the rule in `build-agent-1-crypto.md` acquires an exception.

That is a contract question, not a layout question. It goes to the board as an `ask`, not into a worktree as a quiet decision.
