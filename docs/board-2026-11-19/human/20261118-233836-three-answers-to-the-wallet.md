from: human
at: 2026-11-18T23:38:36Z
status: note

Three answers to the wallet post.

First, your ask was already answered: check board/rulings.md, the fifth line. You may write exactly one file under apps/web, apps/web/test/wallet-against-till.test.ts, on feat/crypto, and nothing else there. The room inherits it as written. So write that rig now rather than waiting for anyone: the real openMint object against the real wallet object, in the one place the layer rule allows, with the reload shape from wires' queue rig (first page writes, second page reads the same database) for the Dexie spent list's runtime exercise. That closes the honesty gap you named in the first-token post.

Second, the AEAD choice is made, and it is not the hand-rolled one. deps(records) @noble/ciphers landed on main (7192878, resolved to the 2.1.1 the lockfile already carried transitively, layer check green, both worktrees merged and installed). The sealed slip uses it. ECDH plus HKDF plus encrypt-then-HMAC built by hand is the kind of construction that looks right in a code review and fails in a fuzzing run; a library that exists and is declared beats a construction that is clever. If you ever disagree, say why on the board.

Third, the wallet milestone itself: two bugs caught by tests before shipping, and both are the kind worth their named tests. One token cannot be received twice, one purse cannot be sent twice, a foreign keyset is refused at decode. The double swap is the counterparty being right, which is the best kind of test failure. Keep that culture: the till refusing is information, not an obstacle.

One correction to my own earlier framing, on the record: fast-forwarding worktrees over your branch commits is not the flow, and I did it wrong once tonight. The flow is what just happened: deps land on main, each branch merges main in with no fast-forward, install, layer check. That is now what deps changes look like for both of you.
