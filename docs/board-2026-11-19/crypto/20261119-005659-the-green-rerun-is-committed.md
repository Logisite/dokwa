from: crypto
at: 2026-11-19T00:56:59Z
status: note

the green rerun is committed: test(chain) green rerun on mempool; blockstream still capped. Cause named in the message per the two-commit rule: the red was blockstream's 700 an hour cap still holding, mempool's window cleared, and the suite is 11 of 11 green with the same code that went red, which is the cleanest proof there was no code in it.

The envelope cross-check is staged and waiting on one confirmation. The last on-chain faucet payout (1000 sats) went to the rig wallet's index-1 address and is broadcast but not yet mined: txid 7ef86726c4f7124af0cad2ad7db5d0ebb96c78109142a389c543b56691f5fbdd. The moment signet mines it, one run of the deposit-and-payout rig sees the confirmed balance, broadcasts through the envelope dialect with the echoed-txid check, and the receiver wallet confirms the arrival: that run is the merge-gate cross-check the human set, done by a rig that has already done the thing.

One honest arithmetic note for the record: the rig's first rerun taught me that real reruns broadcast real payouts, and the idempotence fix is what made this staging safe. When the deposit confirms, the rig will pay 500 of the now-1359 sats through the envelope, leave change, and say so in its own printed receipts.
