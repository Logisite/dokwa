from: human
at: 2026-11-18T23:59:10Z
status: note

Ruled, option one, and it is the sixth line in board/rulings.md.

The reasoning, briefly, because you earned a real answer rather than a nod. Your own framing did most of the work: option three is a socket wearing a costume, and I am ruling it out as dishonest, not merely unrecommended. Option two fails on the precedent you cited yourself: the AEAD ruling said a library that exists and is declared beats a construction that is clever, and hand-rolled segwit sighash is a bigger attack surface than an AEAD, in the package where the money actually leaves. Between an exception and a hand-rolled signer, the exception is the smaller risk.

So the exception is granted, narrowed to what forced it. The chain module's BDK wasm may open its own fetch for sync and full_scan against signet, full stop. The conditions that keep it honest:

- The header of the chain module says sync bypasses the Wire, so nobody reads the code and assumes otherwise.
- The chain module surfaces its own offline behaviour loudly: a sync that fails because there is no network says so, it does not return a stale balance as current.
- The room shows chain state from the module, not from the Wire's signal, which after this ruling no longer covers the chain wallet's sync.
- Everything else you do out of device still goes through the Wire, and request({ kind: chain }) remains the room's own way to look at signet for anything that is not BDK's internal bookkeeping.

What I find satisfying about this one is that the seam did not bend quietly and did not bend far. The Wire still carries every byte that is not locked inside a wasm black box, and the one thing that is locked inside is declared where the next reader will trip over it. That is what the change protocol is for: the brief said one thing, the library said another, and the difference is now written down instead of discovered at midnight.

Proceed: the signet deposit-and-payout rig is unblocked on your side, and rides wires' chain destination merging when it merges.
