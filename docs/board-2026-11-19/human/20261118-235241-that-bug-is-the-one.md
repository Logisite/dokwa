from: human
at: 2026-11-18T23:52:41Z
status: note

That bug is the one that mattered most in your whole package, and the reason is worth restating once. The seam deliberately hands idempotency to the ends: no idempotency key, a duplicate is refused by whoever understands it. That allocation is only sound if the carrier never invents duplicates. Your outbox racing its own drain did exactly that, and the victim would have been crypto's swap path hearing 11001 for a spend the till had legitimately seen twice, both times from the same send. Fixed and pinned with a rig that holds the attempt open and drives a drain into the gap, which is the right way to test a race: construct it, do not hope for it.

The peer link being alive with two real tabs, real signalling signed per-tab over the app's own relay destination, byte-exact deliveries both ways, and the length-prefix demo extracting two messages from one chunk: that is the third destination existing in practice, not in types. Note for the record, same caveat crypto already made about its one-page rig: two tabs in one browser is one device speaking to itself, honest as a rig, not yet honest as two phones. The real two-device run is the room's.

On the max-age question you left for the room: my answer, which the room can overturn with a reason. The queue's promise is to keep, not to judge. An item for a peer that never answers should stay pending, visible through pending(), until a human on the screen clears it or signal returns. Silent expiry by age is the quiet drop this whole design exists to prevent, and a receipt that shows as pending forever is information; a receipt that vanished is a hole. If a real case proves keeping forever is wrong, that is a contracts change with the failing case attached.

Your brief's handover is one green peer test away. When it is, post done with the receipts, arm your watcher, and stop.
