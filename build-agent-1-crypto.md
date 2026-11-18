# agent 1 — crypto

You own every calculation and every signature that happens on the device, including both wasm modules.

Branch `feat/crypto`, worktree `../dokwa-wt/crypto`, branched from `base`.

## The rule that defines the job

**You never open a socket.** Everything that leaves this device is somebody else's problem.

When you need something from outside — a relay, the chain, the other phone — you hand it to wires as bytes and a destination, and you get back one of three answers:

| Answer | Means |
|---|---|
| delivered | it arrived |
| failed | it did not, and will not without a new attempt |
| later | no signal; it is queued and will be tried |

Wires hands you the bytes that arrived, unopened. You decode them. It never does.

That is the whole interface. If you find yourself reading a URL, opening a connection, or handling a retry, you have crossed the line.

It is written out in types in `build-contract.md`, and it is committed at `base`. Read it before you build anything, then post the one-line answer it asks for.

## What you build, in order

**1. Keys and a token.** Signing keys for the till, the signing maths for tokens, and a list of what has already been spent that refuses a second spend. Small and provable. This is the first thing that must be real.

**2. The till.** Quotes in, tokens out, tokens back. Every response is atomic with the spent list: the secret is recorded before an answer is given, so a crash cannot double-issue.

**3. The wallet.** Holding tokens, sending them, receiving them, checking whether a token is still good. This runs against the till through the envelope, and it is the same code the patron runs.

**4. Things that mean something.** A receipt for a payment. A permission slip — "this person may open the till", "this person may teach". A badge. These are signed objects; they are not money and they do not need the network to exist. A slip is encrypted to the person it is for, so only they can read it.

**5. The covered lesson.** The gate that decides whether a badge is required for a slip. It warns and it signs anyway; the owner confirms. It never silently blocks, and a missing badge is never a reason for the slip to be absent.

**6. The chain wallet.** A bitcoin wallet you hold the keys to: an address from a seed, an address per deposit, signing a payout. The chain lookups are wires; the descriptor, the keys and the signing are yours.

**7. The Lightning node.** The wasm module, the node object, its keys, and its persistence — every store written atomically, because losing node state on a reload is a forced channel close. The socket it speaks over is a data channel built by wires. Your job is that the node survives a reload; theirs is that bytes arrive.

Steps 1 to 6 are the product. Step 7 is allowed to fail, and if it fails you say so plainly and step 6 still ships.

## What you must not do

- Do not add a dependency. If you need one, it goes on `deps/<name>` from `main`, merges, and you rebase.
- Do not edit `packages/core`. Its shapes move only by agreement — post on the board. `contracts/<topic>` from `main`, merge, rebase, announce on the board.
- Do not edit anything under `apps/web`. Screens belong to the room. If a screen needs something, it needs a function.
- Do not invent a second name for a thing the contract already names.
- Do not hide a failure as a retry. If a signature is wrong, say it is wrong.

## How you test

Real keys, real signatures, real tokens, real storage. Nothing simulated.

| Test | Rig |
|---|---|
| signing maths and the spent list | vitest, no browser, same input same output |
| the wallet against the till | the real wallet library over the envelope, against the real till object |
| slips and receipts | real signatures, verified by a second independent path |
| a deposit and a payout | the real signet chain, through wires |
| a reload | a real browser, real storage, close and reopen |

The most valuable test is the one where two independent things disagree: a third-party wallet library against your till, a signature verified by different code than signed it, a token checked by a wallet that did not make it.

## What "done" hands over

Real things, posted to the board, each one checkable by someone else:

| Artifact | Checkable by |
|---|---|
| a token string, and the refusal when it is spent twice | running it against the till |
| a signed receipt with its id | verifying the signature |
| a sealed permission slip, and what it looks like to the wrong person | opening it with the wrong key and getting nothing |
| an address, and the deposit you saw arrive | the chain explorer |
| a payout transaction id | the chain explorer |
| a node that reloaded and still had its state | closing and reopening the tab |

Write down the calls the room is allowed to make, and nothing else. That page is what the room builds against.

## Your board

`board/crypto/`, one file per message. Read `board/wires/` before you start and `board/rulings.md` in full.

The contract is a **living document**. If it needs to carry something it cannot, or a shape is wrong, say so here — additions and modifications are normal and expected, and they are agreed here rather than inside a worktree. `build-contract.md` §7 is the whole protocol.

Two commands do the mechanics: `python3 board.py post crypto <status> "…"`, and `python3 board.py read` for what everyone has said. One message is one file, so nothing can be lost to a simultaneous write.

To be told instead of asking: `python3 board.py watch crypto --for 900` in the background prints what is new and exits 2 the moment a message arrives. Run it again after you have read it. Exit 0 means the time passed with nothing.

`board/` in your worktree is a link to the one real board in the project directory — the same files the other agent reads, not a copy.

Write prose. What surprised you, what you are unsure of, what you would do differently, what you think is wrong with the shape of this split. The board is the only place your reasoning survives — a commit shows what changed, never why.

Post before you stop, even if the post is "nothing moved, still on the spent list".
