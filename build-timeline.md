# dokwa — build timeline

`docs/dokwa-spec.md` says what the product is. `docs/dokwa-stack.md` says what it is built with. This says **in what order**, from the base commit to the last test.

No phase carries a duration. A phase ends when an artifact exists, not when a calendar says so.

## 1. The shape

```
                     ┌── crypto ──┐
base ────────────────┤            ├── room ── tests
                     └── wires  ──┘
```

| Phase | Work | Ends when |
|---|---|---|
| 0 | the base | `base` exists, both worktrees open |
| 1 | crypto and wires, at the same time | two real artifacts on the board, both branches green |
| 2 | the room | one phone can do the whole night |
| 3 | the tests | the ladder in `build-tests.md` is climbed, or honestly stopped |

Two agents in phase 1, one in phase 2. Nothing in phase 1 depends on phase 2, and nothing in phase 2 begins until phase 1 has produced real parts to assemble.

---

## 2. Phase 0 — the base

Everything below is committed once, on `main`, before any branch exists.

| Piece | Contents |
|---|---|
| repository | `git init -b main`; `.gitignore` with `node_modules/`, `dist/`, `.vercel/`, `.env*`, and **`/board`** |
| documents | `docs/dokwa-spec.md`, `docs/dokwa-stack.md`, the earlier research |
| workspace | `pnpm-workspace.yaml`, `tsconfig`, lint, and a **committed lockfile** |
| `packages/core` | the shared contract — see §6 |
| `apps/web` | vite + react + Astryx, one page, PWA configuration, `vercel.json` |
| `board/` | created locally and ignored: `README.md`, `rulings.md`, one stream per role. The tracked usage reference is `BOARD.md` |

The stack document calls the shared package `protocol`. It is the same package, called `core` here because it holds more than a protocol: the envelope, the shapes, the storage names.

One prerequisite, found by trying it: this machine has no git identity set, so `git commit` fails before it writes anything. It needs `git config user.name` and `git config user.email` once, in the repository.

```bash
git add -A && git commit -m "base: contract, workspace, app shell, board"
git tag base

git worktree add ../dokwa-wt/crypto -b feat/crypto base
git worktree add ../dokwa-wt/wires  -b feat/wires  base
```

A worktree is a **separate checkout**, so the board in the project directory is not visible from `../dokwa-wt/crypto` unless something points at it. Each one gets a link:

```bash
ln -s ../../dokwa/board ../dokwa-wt/crypto/board
ln -s ../../dokwa/board ../dokwa-wt/wires/board
```

`/board` is anchored and ignored, so the link never appears in `git status` and git never tries to track it. Both agents then type `board/`, and both are writing to the one real directory.

`main` stays checked out in the project directory and stays the live test origin. Ports are pinned, never left to "port in use, trying the next one", because the origin is where the storage lives:

| Checkout | Port |
|---|---|
| project directory (`main`) | 5173 |
| `crypto` worktree | 5174 |
| `wires` worktree | 5175 |
| `room` worktree | 5176 |

**Gate.** `pnpm -r build` is green on `main`, `git worktree list` shows both worktrees, and each agent has read `board/README.md` and `board/rulings.md` in full before touching code.

---

## 3. Phase 1 — crypto and wires, at the same time

| | crypto | wires |
|---|---|---|
| branch | `feat/crypto` | `feat/wires` |
| owns | keys, tokens, the spent list, receipts, permission slips, badges, encryption, both wasm modules | public relays, the bitcoin network, the phone-to-phone link, the queue, whether there is signal |
| never | opens a socket | looks inside what it carries |
| brief | `build-agent-1-crypto.md` | `build-agent-2-wires.md` |

They share exactly one thing, and it is committed at `base`:

> **crypto** hands wires some bytes and a destination, and gets back *delivered*, *failed*, or *later*.
> **wires** hands crypto the bytes that arrived, unopened.

The whole of it in types, committed at `base`: `build-contract.md`.

Everything else is inside one of the two. That is why they can start in the same minute: crypto can be written against the envelope with nothing behind it, and wires can be written against real relays and real signet without knowing what a token is.

Neither edits the other's files. A change to `packages/core` goes on a `contracts/<topic>` branch from `main`, is merged, and both worktrees rebase. A change announced API without a rebase is how two agents end up building against different contracts.

**Gate.** Both branches green on `pnpm -r test` and `pnpm -r build`, and on the board:

| From | Artifact |
|---|---|
| crypto | a real token, and a real refusal of the second spend of it |
| wires | a real relay event id, and a real signet transaction id it fetched |

Anything less is not "nearly done". The gate is the artifact.

---

## 4. Phase 2 — the room

One agent, one branch, `feat/room`, from `main` after phase 1 merges.

Two jobs, in this order.

**Wire first.** Bind the parts: the wallet's requests go to the till; the chain wallet's lookups go to wires; the pouch's socket goes to the data channel; a receipt or a slip gets signed by crypto and queued with wires. This is the smallest part of the phase and it is what tells you whether the contract held.

**Then the interface.** Every screen, the camera and the codes, first run, till mode and wallet mode, install, opening with the wifi off, and the deploy. This is the bulk.

Brief: `build-agent-3-room.md`.

**Gate.** On one origin, at phone size, in a real browser: the till hands a token to a wallet, the wallet hands it back, the till refuses a second attempt at the same token, a receipt is signed, and the page installs to a home screen and opens with the network cut.

---

## 5. Phase 3 — the tests

The ladder is its own document: `build-tests.md`.

It runs bottom to top, each rung proving the one below it. Rungs that fail are posted to the board with their number, so a later reader can see what was known and when.

---

## 6. What may not change quietly

The contract is a **living document**. It is expected to gain things and change shape as the two agents discover what it has to carry — that conversation is what the board is for, and it is welcome.

What it may not do is move without the other side knowing. `build-contract.md` §7 is the whole protocol: post, ruling, branch, rebase, acknowledge.

| Held together, not frozen | Why |
|---|---|
| the envelope and its three replies | it is the only thing two agents share |
| the token shape | two implementations agree on it or nothing interoperates |
| the receipt, slip and badge shapes | signed once, verified years later |
| the code format | cameras read what displays write |
| the storage names — `dokwa:till`, `dokwa:wallet:<id>` | origin is per port and per profile; the names are the contract |

Free without asking: everything inside a package, every screen, every file an agent owns.

Changed by conversation on the board, never by a quiet edit in a worktree: the five above.

Four rules that never stop applying:

1. **Dependencies land on `main` first.** A `pnpm add` inside a worktree forks the lockfile. If a package is genuinely needed, it goes on a `deps/<name>` branch, merges, and everyone rebases.
2. **Nothing is simulated.** Real relays, real signet, real keys, real signatures. Cutting the network is done by cutting it.
3. **A branch merges only green.** `pnpm install --frozen-lockfile`, `pnpm -r test`, `pnpm -r build`. Merged with `--no-ff` so each phase keeps its own history.
4. **Questions about the contract go on the board.** A code comment is invisible to the other agent.

---

## 7. What happens when something fails

Only one part is allowed to fail: the Lightning module inside crypto. It is beta bindings, large, and it has to survive a reload. If it does not hold, the product is what it was before it — a till that signs its own tokens against real sats — and every phase above it still ships.

Everything else failing means the phase has not ended yet, not that the timeline is wrong. A rung that cannot be climbed is a finding to post, not a reason to skip it.

---

## 8. The board

`board/` sits outside every worktree, in the project directory, and is ignored by git. Two worktrees cannot see each other's files, so this is the only shared place there is.

```
board/
├── README.md      the convention
├── rulings.md     settled decisions, one writer
├── crypto/
├── wires/
└── room/
```

One message is one file, in your own stream:

```
board/crypto/20261118-143204-token-signs.md
```

Separate files, not one appended file. Two agents appending to the same file at the same moment means the last write wins and one message disappears; creating a file is atomic, appending is not. The filename carries the time to the second, so `ls` is already in order and nothing needs a lock.

The second matters. A minute alone was tried and does not work: two messages posted in the same minute sort by their words instead of their time, and the notifier — which orders by filename — silently skipped one. Found by running it.

`rulings.md` is the exception — one file, one writer, appended. That works for the same reason in reverse: nobody else writes to it.

```
from: crypto
at: 2026-11-18T14:32:04Z
status: ask | answer | note | blocked | done
re: wires/20261118-140512

The mint signs tokens for real, and the spent list refuses a second
spend. Ask: does the chain watcher need the txid at quote time, or when
the deposit lands?
```

Reading is `ls -t board/*/`. Replying is your own next file with `re:`.

The mechanics are one command away. `board.py` at the project root writes and reads those files:

```bash
python3 board.py post crypto ask "does the seam carry a txid?"
python3 board.py post wires note -            # body from stdin
python3 board.py read                         # newest from every stream
python3 board.py read wires -n 10
```

The files are the board; the script is a convenience. Delete it and the board still works, because anything that reads a file can read it. Full usage, every flag and the exit codes: `BOARD.md`.

### Being told instead of asking

```bash
python3 board.py watch crypto --for 900
```

Run it in the background. It prints anything posted since the last time it ran, then waits. The moment a message arrives it prints it and exits **2**. If nothing arrives within `--for` seconds it exits **0**. Either way the process ends, so the agent is told rather than having to ask again — and running it once more picks up where the cursor stopped.

| Flag | Effect |
|---|---|
| `--stay` | keep following after printing instead of exiting |
| `--notify` | one summary line before each batch |
| `--all` | include your own stream |
| `--backlog N` | how many per stream to show on a first run |
| `--every N` | seconds between checks |

The timeout is not decoration. A process that never ends never reports back — an infinite tail looks exactly like a hung one. A watcher that exits is a watcher that notifies.

The cursor lives in `board/.watch/<viewer>.json`, so each viewer keeps its own place: two agents watching the same stream do not consume each other's messages. Writing is atomic — a message is written to a temporary name and linked into place, so a reader never sees half a message and two writers never share one file.

The loop, in full:

1. post, then start the watcher in the background;
2. work;
3. the watcher exits and reports what arrived;
4. read it, answer on the board;
5. start the watcher again.

### How it appears inside a worktree

As a link, never as a copy.

```
dokwa/board/                      the one real directory
dokwa-wt/crypto/board   ──────────▶  symlink to it
dokwa-wt/wires/board    ──────────▶  symlink to it
```

Because it is ignored, the link is invisible to git: no status noise, no merge, no "untracked files would be overwritten by checkout". The agent types `board/` from its own worktree, the bytes land in the real directory, and the other agent sees them the moment they are written.

A copy would be the failure this avoids. Tracked files are checked out **per worktree**, so a tracked board would give each agent its own diverging copy, reconciled only at merge — a mailbox with a delivery delay, not a conversation.

If a link ever breaks, the fallback is the absolute path: `BOARD_DIR=/home/logisiteau/projects/hacks/dokwa/board python3 board.py read`.

Three habits:

1. read the other stream before you start, and `rulings.md` in full;
2. post before you stop, even to say nothing happened;
3. **write prose** — what surprised you, what you are unsure of, what you would do differently, what you think is wrong. The board is the only place your reasoning survives; a commit shows what changed, never why.

The board is archived into `docs/` at each merge, so the record outlives the directory.

Today it works because it is read: before you start, after you stop. An event-driven layer is planned — a post, a failed rung, or a broken merge pinging an agent instead of waiting to be found — and nothing in this plan depends on it. Until it exists, reading is the mechanism.
