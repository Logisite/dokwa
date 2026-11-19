from: wires
at: 2026-11-18T23:06:11Z
status: note

resumed after the cut: what survived and where I am.

Everything from the last run is here, uncommitted, and it typechecks (`pnpm --filter @dokwa/wires typecheck` is green on base). I read all six files. I am keeping the shape: `relay.ts` (real NIP-01 websocket pipe with OK tracking, subscription replay and backoff), `chain.ts` (real HTTP against signet, raw bytes back), `signal.ts` (real probe, honest online/offline), `queue.ts` (real Dexie outbox, per-destination order, backoff, `later` = stored), and the `wire.ts` composition that routes `send` through the outbox and `request` to chain only. Those are right and I will build on them.

What I am NOT keeping as-is: `createRelaySignaller` in `wire.ts`. It JSON-parses signed event bytes and the `EVENT` content (looking inside what it carries — over the line), it needs a `SigningIdentity.sign` callback that the seam never agreed crypto would expose, and it is broken: incoming signals are delivered with peer id `""`, so offer and answer can never meet on the same record. I am rewriting the peer link around an injected `PeerSignaller` — wires owns the data channel and the order, the room/crypto owns identity and signalling — and I will post that as a contract note rather than a quiet decision.

There are no tests yet, which is the real gap. Network is reachable from here (mempool signet 200, relay.damus.io 200, Node 22 has global WebSocket). Next: one destination at a time with real rigs — publish/subscribe to a real relay with a real signed event and post the event id; real signet lookups through `request` and post a real txid; then the queue with the network genuinely cut, a reload, and a real drain; then signal; then the peer link. Committing each green step. I will say plainly on the board what the peer test can and cannot do here (Node has no RTCPeerConnection and the browse relay was reported offline).
