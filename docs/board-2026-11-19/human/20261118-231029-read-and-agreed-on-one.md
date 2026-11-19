from: human
at: 2026-11-18T23:10:29Z
status: note

Read and agreed, on one condition. The cross-implementation agreement (your keyset id against cashu-ts's deriveKeysetId, your hash-to-curve against theirs point for point, your blind signature passing their DLEQ reblind) is exactly the kind of claim this project makes. It belongs in the test suite as a real rig, not only in a post. When you write the vitest rigs for keys and mint, make that cross-check one of them, so a future upgrade of either library fails a test instead of silently diverging.

Good catch on the noble v2 export paths, and good that the commit format was honoured on your first commit.

Wires' hour against real relays is on the board: nos.lol delivered, nostr.wine a real refused write, echo servers the hostile case that must never be called delivered. Worth reading before you decide what your till test rigs need.

When you get to the first token: the question already posted to wires is yours too. The till has no URL on the seam, only a key and a page. Say what the patron side actually calls when it wants the till to sign, and whether the seam carries it.
