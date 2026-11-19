# @dokwa/wires: the one page

What crosses the edge of the device, in one file. Implement `Wire`, inject it,
and everything outside the page is a destination with three possible answers.

## The calls

```ts
import { createWire } from "@dokwa/wires";

const wire = createWire({
  signet: "https://mempool.space/signet/api",  // the chain endpoint, config not code
  queue:  { dbName: "dokwa:wires" },           // the outbox lives here, survives reloads
  peer:   { signaller },                       // see "peers", below
});

send(to, bytes)      // fire and forget; the outbox is always in the path
request(to, bytes)   // needs an answer now; chain only
onBytes(handler)     // (from: Destination, bytes: Uint8Array) in arrival order, unopened
onSignal(handler)    // (online: boolean); first call is the current answer, not a change
pending()            // [{ id, to, queuedAt }] for a screen that says "waiting"
```

## The three answers

| Answer | What it means | What the caller may assume |
|---|---|---|
| `delivered` | the destination took the bytes | nothing about durability. A relay that accepted and later forgot is discovered by reading back, never by this word. Use `wire.verifyRelay(url, eventId)` when taken must become kept. |
| `failed` | the destination answered and refused | `rejected`: final, not queued, said again on `onResult`. `unreachable`: the destination could not be spoken to at all, or is throttling: queued, retried with capped backoff. `timeout`: spoken to, no answer in time: queued, retried. |
| `later` | stored in the outbox and not yet delivered | it survives reloads and closed tabs, keeps its order per destination, and empties itself when signal returns. It is visible in `pending()` until a human clears it; it never expires by age. |

`onResult` reports the ends a `send` could not report live: every `delivered`
and every final `rejected` comes back through it with the queue item's id.

## What the queue promises

- `later` is stored, not dropped, not lost, and not a tight loop: per
  destination, oldest first, backoff capped.
- Order per destination, never across destinations.
- `rejected` leaves the queue (the destination refused these bytes; retrying
  forever would be a lie). `unreachable` and `timeout` stay queued.
- A refused payload is announced on `onResult` before it is forgotten.
- The queue never invents duplicates: a send that races a drain answers
  `later` rather than attempting the same bytes twice.

## What signal promises

One honest answer. The browser's `navigator.onLine` is a hint, the probe is a
real request to a real endpoint (default: the signet tip), and a probe that
fails, hangs or throws answers `false`. Optimism here is a bug: a `false`
that was really true only costs a delay, a `true` that was really false turns
a recoverable moment into a lost sale.

## Destinations

**Relay** (`{ kind: "relay", url }`): a Nostr relay over WebSocket. Wires
speaks the frame protocol and nothing else: publishes, waits for the OK,
subscribes, replays subscriptions after a reconnect, and hands every incoming
frame back as unopened bytes. A throttle ("not acceptable at this point") is
a window, not a wall: it maps to `unreachable` and the queue keeps trying.
A policy no ("restricted") is a wall: `rejected`, final.

**Chain** (`{ kind: "chain", network: "signet" }`): `request` only. The bytes
in are a tiny envelope, `chainRequestBytes({ method?, path, body? })`, the
bytes out are the endpoint's raw response. Wires is an HTTP pipe here, not a
chain interpreter; the endpoint is configuration because explorers move.

**Peer** (`{ kind: "peer", id }`): one ordered reliable WebRTC data channel,
bytes in and bytes out, no framing added. The receiver frames; a chunk may be
split or merged by any other transport and that is still the receiver's job.
The id is whatever both sides call each other; the room learns it from the
code handshake and names the peer. Wires never signs, so signalling is an
injection point: `setPeerSignaller({ send, onSignal })` carries offers,
answers and ICE over whatever transport the key holder chooses, usually the
same relay the app already publishes to.

## What wires never does

- looks inside a payload. Bytes are bytes; a special case for one kind is a
  bug, and crypto rejects what is wrong, not wires.
- imports anything that signs. The signaller is handed in from above.
- promises durability. `delivered` means taken; `verifyRelay` is how taken
  becomes kept.

## Verified against the real world

- publish, subscribe, read-back and OK-refusal on real public relays
  (nos.lol, nostr.wine, postman echo), subscription replay across a real
  disconnect, real signet lookups, txids and raw tx hex through `request`,
  the outbox surviving a reload with the network cut at a real dead endpoint
  and draining in order, honest probes both up and down, and two real
  browser tabs carrying byte-exact payloads over one data channel with the
  framing done by the receiver. See `packages/wires/test` and
  `packages/wires/testbed`.

## Plain words

The vocabulary here comes from a few standards and from the product's shop
metaphor. In one line each:

- **destination**: one of the three places bytes can go: a relay, the chain,
  or a peer.
- **relay**: a public websocket server that keeps and forwards events.
- **chain**: the Bitcoin network, reached through an HTTP explorer API; the
  only destination that answers a question.
- **peer**: another phone, joined over a direct data channel.
- **signaller**: whatever carries the connection text (offer, answer and the
  network addresses) between two phones. Today a relay; in the code path, two
  QR codes.
- **offer / answer**: the two pieces of connection text one side proposes and
  the other confirms.
- **ICE**: the browser's process of finding a workable network path between
  two devices. A **candidate** is one address it might use.
- **trickle / complete**: send candidates as they are found (trickle), or
  wait until they are all found and put them inside the offer or answer text
  (complete), so a single code carries everything. A code has no side channel,
  so the code path uses complete, with a five second cap so an unreachable
  address server cannot hang it.
- **till**: the venue's cash register in the product's language: the device
  that holds the ecash and hands out tokens. Not a wire concept.
- **ecash / token**: bearer money; the value the till hands out.
- **outbox / queue**: the stored list of sends that have not been delivered
  yet. `later` means "in here".
- **signal**: whether a real request to a real endpoint succeeds right now.
