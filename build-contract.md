# the contract the two agents share

**This is a living document.** It is written at `base` so both agents start from the same page, and it changes from there — by conversation on the message board, not by a quiet edit in a worktree.

The rule that keeps it alive without splitting it in two:

> the document moves, the checkouts move together.

Additions and modifications are expected and welcome. What is not expected is a change nobody else saw, because the cost of that is two agents building against two versions of the same word.

So: the contract is negotiated on the board, in prose, at whatever length it takes. Everything behind the seam is decided alone, without asking.

## 1. The seam, in full

`packages/core/wire.ts` — types and nothing else. About forty lines, and meant to grow.

```ts
export type Destination =
  | { kind: 'relay'; url: string }
  | { kind: 'chain'; network: 'signet' }
  | { kind: 'peer'; id: string };

export type Sent =
  | { status: 'delivered' }
  | { status: 'failed'; reason: 'rejected' | 'unreachable' | 'timeout' }
  | { status: 'later' };

export type Replied =
  | { status: 'ok'; bytes: Uint8Array }
  | { status: 'failed'; reason: 'rejected' | 'unreachable' | 'timeout' }
  | { status: 'later' };

export type Pending = { id: string; to: Destination; queuedAt: number };

export interface Wire {
  /** fire and forget; 'later' means queued and will be attempted again */
  send(to: Destination, bytes: Uint8Array): Promise<Sent>;

  /** needs an answer; chain only */
  request(to: Destination, bytes: Uint8Array): Promise<Replied>;

  /** bytes that arrived, unopened, in the order they arrived */
  onBytes(handler: (from: Destination, bytes: Uint8Array) => void): () => void;

  /** whether there is signal, and when that changes */
  onSignal(handler: (online: boolean) => void): () => void;

  /** what is waiting, for a screen that wants to say so */
  pending(): Promise<Pending[]>;
}
```

That is the entire shared surface. Crypto imports it and implements nothing of it. Wires implements it and imports nothing else of crypto's.

## 2. The five promises

| Promise | Why it is in the contract |
|---|---|
| `later` is a real promise | queued and attempted again, surviving a reload. Not dropped, not retried forever. |
| no idempotency key | everything crypto signs carries its own identity; a duplicate is refused by the end that understands it |
| no framing | a chunk may be split or merged. `onBytes` does not deliver messages, it delivers bytes. The receiver frames. |
| order per destination, never across | a peer connection needs order; two relays do not |
| no fragmentation | if a destination refuses a size, that is `failed`, and the caller decides whether to break the payload up |

`request` is for the chain only. A relay is spoken to by `send` plus `onBytes`. A peer is spoken to by `send` plus `onBytes`. One call fewer to get wrong.

## 3. Worked, so it is obviously enough

**A receipt, with no wifi.**

```ts
await wire.send({ kind: 'relay', url }, signedReceiptBytes);
// → { status: 'later' }     the queue holds it
// …the network comes back…
// → { status: 'delivered' } woken by the queue, not by a retry loop
```

**The chain, needing an answer now.**

```ts
const r = await wire.request({ kind: 'chain', network: 'signet' }, queryBytes);
if (r.status === 'ok') decode(r.bytes);          // UTXOs, a broadcast result, a fee
```

**The node, talking to the other phone.**

```ts
await wire.send({ kind: 'peer', id }, handshakeBytes);   // BOLT8 bytes, unexamined
wire.onBytes((from, bytes) => node.read(bytes));         // no framing assumed
```

## 4. The shapes the room builds against

These are mined by crypto and rendered by the room. Frozen for the same reason: two implementations that agree on a name agree on a thing.

| Shape | What is fixed | What is free |
|---|---|---|
| **token** | the standard cashu token string as cashu-ts encodes it (`cashuB…`); the `cashu:` prefix is the URI wrapper a QR or a link adds, not part of the string | everything about how it is stored |
| **receipt** | a signed event: author, kind, time, and a content object naming amount, unit, and what it was for | the wording |
| **permission slip** | a signed event with a public part naming the capability and an expiry, and a sealed part readable only by the addressee | the wording of the sealed part |
| **badge** | a signed event naming which lesson and who taught it | anything else |
| **code** | `dokwa:` for tokens and slips; multi-part framing for payloads too large for one code | the visual |
| **storage** | `dokwa:till`, `dokwa:wallet:<id>` | everything inside them |

## 5. What is deliberately not in the contract

Left out on purpose, because specifying it would be a design project and both agents already have working answers:

- how a relay is spoken to, how a filter looks, what reconnection means
- what a BOLT8 handshake is, or how a channel is opened
- what is inside a keyset, or how a proof is stored
- how a chain query is shaped
- every screen

The seam is small because the three libraries already have this hole in them: `cashu-ts` takes a request function, the bitcoin wallet takes a chain backend, the Lightning node takes a socket. This interface is those three holes, named once.

## 6. The first hour

Before implementing anything, each agent posts one of two replies on the board:

```
status: answer
The seam carries what I need.
```

or

```
status: ask
The seam cannot carry ___, because ___. I need ___ instead.
```

One round, and the round settles what the first version of the document should have said.

After that the seam holds still until someone needs it to move. That is a normal event, not an emergency, and §7 is the whole of how it happens.

## 7. How it changes

The document moves, the checkouts move together. In this order:

1. **Post on the board.** What it cannot carry, and the failing case. Prose, as long as it needs to be — the reasoning matters more than the request.
2. **It becomes a ruling.** One dated line in `rulings.md`, written by whoever is coordinating. That line is what stops the same question coming back in a week under a different name.
3. **The change lands on `contracts/<topic>` from `main`.** The types and the words change in the same branch, so the document and the code never disagree.
4. **Both worktrees rebase.**
5. **Both agents acknowledge on the board.** Short is fine. The acknowledgement is the evidence that the other side is now on the new version.

That is the entire cost of a living contract: a few posts and one branch. Cheap on purpose — an expensive process gets routed around, and the route around is a quiet edit.

A quiet edit to `packages/core` inside a worktree is the one failure mode, not because the change is wrong but because the other agent cannot see it until the merge, by which point both have built against different words.

## 8. Talking about it

Additions and modifications are a conversation, not a form. Post what you want changed, post what you think is wrong with it, post a shape you would prefer — the board exists for exactly this, and it is read before work starts and after it stops.

Today the board works by being read. When this build grows an event-driven layer, a post, a failed rung or a broken merge will ping an agent instead of waiting to be found. That layer is planned and is not built here; nothing in this document depends on it, and nothing waits for it.
