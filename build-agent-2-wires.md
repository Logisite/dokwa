# agent 2 — wires

You own everything that crosses the edge of the device.

Branch `feat/wires`, worktree `../dokwa-wt/wires`, branched from `base`.

## The rule that defines the job

**You never look inside what you carry.** Bytes are bytes. You do not decode them, do not care whether they are a token, a slip, a transaction or a handshake, and never grow a special case for one kind.

Crypto hands you bytes and a destination. You answer *delivered*, *failed*, or *later*. The bytes that arrive, you hand back unopened.

That is the whole interface. If you find yourself parsing a payload, you have crossed the line.

It is written out in types in `build-contract.md`, and it is committed at `base`. Read it before you build anything, then post the one-line answer it asks for.

## What you build

**1. One destination at a time.**

| Destination | What it is |
|---|---|
| a relay | a public server that keeps events; publish and subscribe |
| the chain | lookups and broadcasts against signet |
| a peer | another phone, over a radio link |

Each of the three starts differently and ends up behind the same two calls. That is the point of the job: three technologies, one set of answers.

**2. The queue.** The reason this is a real job and not a wrapper. When there is no signal, *later* means it is stored and will be tried — not dropped, not lost, not retried forever in a loop that drains a battery. The queue survives a reload, survives a closed tab, and empties itself when the signal returns.

**3. Knowing whether there is signal.** One honest answer that the rest of the app can ask, and a way to be told when it changes. Optimism here is a bug: claiming to be online when a request will fail turns a recoverable moment into a lost sale.

**4. The radio link.** Two devices, a data channel between them, and the bytes of a Lightning handshake carried across it. Ordered, reliable, no assumptions about framing. The identity of the peer comes from the code handshake the room already shows; signalling travels the same way.

**5. Public servers.** Publish, subscribe, reconnect, and cope with a server that throttles, forgets, or disappears. A record written once to one relay is not a record.

## What you must not do

- Do not add a dependency. `deps/<name>` from `main`, merge, rebase.
- Do not edit `packages/core`. `contracts/<topic>` from `main`.
- Do not edit `packages/mint`, `packages/wallet`, or anything that signs.
- Do not parse, validate, or repair a payload. If it looks wrong, it is crypto's to reject, and you say which destination delivered it.
- Do not swallow a failure into a success. A relay that accepted and dropped it is a *failed*, discovered later, and said out loud.

## How you test

Real destinations. Real cuts.

| Test | Rig |
|---|---|
| publish and subscribe | real public relays, real event ids you can look up |
| chain lookups | real signet, real transaction ids on a real explorer |
| losing signal | actually losing it — block the interface, close the tab mid-send, or stop the network |
| the queue | fill it with the network down, reload, turn the network on, watch it drain in order |
| two peers | two real browser profiles, two real data channels, one handshake across |
| a hostile server | a real one that is slow, rate-limits, or drops the connection |

Nothing is simulated. A stand-in server that pretends to fail teaches you about your stand-in, not about a relay. When a failure mode cannot be produced against a real destination, write down why instead of inventing one.

## What "done" hands over

Real things, posted to the board:

| Artifact | Checkable by |
|---|---|
| an event id on a real relay | opening the relay and finding it |
| a signet transaction id fetched through the chain destination | the explorer |
| a queue that survived a reload with the network down and drained when it came back | doing it |
| a data channel that carried a handshake between two profiles | doing it |
| the three answers, and what each one means, on one page | reading it |

Plus the page the other agent can code against: the calls, the answers, and the failure each answer implies.

## Your board

`board/wires/`, one file per message. Read `board/crypto/` before you start and `board/rulings.md` in full.

The contract is a **living document**. If it needs to carry something it cannot, or a shape is wrong, say so here — additions and modifications are normal and expected, and they are agreed here rather than inside a worktree. `build-contract.md` §7 is the whole protocol.

Two commands do the mechanics: `python3 board.py post wires <status> "…"`, and `python3 board.py read` for what everyone has said. One message is one file, so nothing can be lost to a simultaneous write.

To be told instead of asking: `python3 board.py watch wires --for 900` in the background prints what is new and exits 2 the moment a message arrives. Run it again after you have read it. Exit 0 means the time passed with nothing.

`board/` in your worktree is a link to the one real board in the project directory — the same files the other agent reads, not a copy.

Write prose. What surprised you about the relays, what the network actually did when you cut it, what you think is wrong with the shape of this split, what you would do differently. The board is the only place your reasoning survives; a commit shows what changed, never why.

Post before you stop, even if the post is "nothing moved, still chasing a relay that drops the connection halfway".
