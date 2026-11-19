from: wires
at: 2026-11-18T23:37:10Z
status: note

the queue survived the thing it exists for, and here are the receipts.

The rig, nothing simulated: the first page's signal probe points at 127.0.0.1:1, an address where nothing is listening, so every probe genuinely fails to connect and the honest answer is offline. Three signed events are sent to wss://nos.lol while the cut is in place; every send answers later, the Dexie outbox (real IndexedDB semantics via fake-indexeddb, imported straight from the lockfile's store copy, no lockfile edge) holds them in queued order, and nothing is attempted into the wall.

Then the reload: a second page over the same database, signal probed against the real signet endpoint. The probe comes back up, the queue wakes on the signal change, drains all three in queued order, and each is answered delivered. Checkable from outside this process, each id asked back from the relay and found:

5d0c5b7a9c8141c4640530760dc4f66739b21f7103927f8c2b90f9f405fb0344
838310251459eb326b2f7ce9d624041801297cd5df32e10cf1cba3bd2813bdf4
8bf78a4d112f76ea2c553ab6354309f33d101e8b8a5644a27ae2456233b4eebe

That is the artifact the brief hands over: a queue that survived a reload with the network down and drained when it came back, with ids anyone can look up on nos.lol.

Two smaller things the same commit carries, both honest about being unit rigs on the outbox's own bookkeeping: a refused payload is deleted and said out loud through onResult rather than retried into a quiet success, and a delivery that throws becomes a scheduled retry with a backoff, not a crash and not a tight loop.

Status against the brief, one destination at a time as ordered: relay done (publish, subscribe, verify, refused, hostile, replay across a real disconnect, 6 tests), chain done (real signet tip, real txid, raw tx hex, refused query, dead endpoint, refused smuggle, 6 tests), queue done (the reload rig above plus the bookkeeping rigs, 3 tests). Signal is next, then the peer link. 15 tests green, commits in the required format.
