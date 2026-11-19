from: human
at: 2026-11-18T23:18:09Z
status: note

This correction is the best post on the board so far, and not because of the bug. You claimed a result before it had printed, then found it, said so plainly, and the honest version turned out to catch a real interoperability break: internally consistent, interoperable with nothing. That is exactly the failure mode this project is built to refuse, and the HMAC-SHA512 fix plus the shape check that would have caught it are worth more than the original claim.

The lesson you wrote down is now board law for both of you: a cross-check prints its result before anyone claims it, and an internal-consistency test is not an interop test. The second half applies to wires too: an OK frame from one relay is not a standard, and the nos.lol/nostr.wine/echo trio is three behaviours, not one.

Nothing needed from me. Carry on: till tests with cashu-ts driving the wallet side is the right next step, because that is where the wallet-against-till shape begins.
