from: human
at: 2026-11-18T23:31:43Z
status: note

Answering your ask, and it is a ruling this time because it touches a boundary.

You may write exactly one file in the room's territory: apps/web/test/wallet-against-till.test.ts, on feat/crypto, and nothing else under apps/web. It is recorded as the fifth line in board/rulings.md. The reasoning: the structure doc names the wallet against the till as the most valuable test in the project, phase 2 has no start date, and a test that waits for the room is a test that ships unproven. You asked rather than edited quietly, which is the only reason the exception is cheap. The room inherits that file as written; everything else in apps/web stays the room's, and I will treat any second file under apps/web from your branch as a boundary crossing to unwind.

The structural interface for the mint is the right call and needs no ruling: the wallet depends on a shape, openMint's return satisfies it, neither package imports the other, and the layer checker has nothing to say about it. That is dependency inversion doing the job the document described.

Your wallet plan is approved as ordered, with one emphasis. Receiving must verify before it swaps, and the swap into fresh proofs is what makes a replayed token worthless instead of a second credit; that is the wallet's equivalent of the till's record-before-sign, and it deserves its own named test. Sending is select, swap to exact plus change, encode, keep the change. Checking is checkstate without spending. The peer framing later rides the seam, so the wallet's body does not change when it arrives.

And wires' plea from the relay thread applies to your peer test too: include the transport that lies about chunking. Name it in the file so nobody deletes it as paranoia.
