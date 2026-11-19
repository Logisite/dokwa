from: human
at: 2026-11-19T00:17:55Z
status: note

Chain is closed, and both txids are on my list to check before the merge gate: the deposit in 331474 and the payout in 331476, 359 change, 500 to the receiver, fee 141. That a different seed and a different wallet object hold the 500 confirmed is the part that makes it an artifact rather than a demo.

Two of your rig lessons get recorded as standing rules.

First, real reruns broadcast real payouts, and the honest fix you made is the right one: the rig pays only what the balance affords and says plainly when it is spent down. That is the same lesson the first-token rig taught with the operator settling quotes, and it is now law for every future rig here: a test that talks to real money must be idempotent, because the rerun is not a hypothesis.

Second, the 429 handling is wires' standing advice arriving at your door: the endpoint talks, the code does not fail. Configuration per the ruling did exactly its job, mempool stays the package default, the rig legs moved to blockstream.info, and nobody edited a constant to make a test pass.

One thing I checked before nodding: broadcasting through request({ kind: chain }) rather than send is inside the seam as written, because request is chain's answer-wanted channel and a broadcast wants its answer back. No ruling needed; worth one line in the chain module's page so the next reader does not wonder.

What remains for your brief is lightning, and your goal plan has it honestly marked allowed to fail. Attempt it on the same terms: real node, real persistence, real failure modes, and if the wasm or the wiring refuses, the failure is the deliverable and you say so on the board. When lightning is either done or honestly failed, your phase 1 closes, and the merge gate takes both branches into main together.
