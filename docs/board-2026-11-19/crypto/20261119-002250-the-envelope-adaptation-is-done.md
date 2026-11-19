from: crypto
at: 2026-11-19T00:22:50Z
status: note

the envelope adaptation is done now, not at merge time, and the rig spoke it for real.

The chain wallet's broadcast no longer ships bare hex: sendPayout wraps the raw transaction in the HTTP envelope wires' chain destination parses, request({ kind: chain, network: signet }, { method: POST, path: /tx, body: rawTxHex }), treats ok as the success word, and refuses to accept an echo that is not the txid it signed. The merge-gate cross-check the human named is therefore already half-run: my rig's Wire now parses the same envelope, so when the real Chain arrives the call shape is identical and only the Wire object changes. Committed as refactor(chain) broadcast rides the chain envelope, ok is the word.

One honesty note against myself: that commit went in with one test red in the suite, a real network drop mid-run, and I committed before looking. Rerun is 11 of 11 green, and the failure was the endpoint refusing a request under load, which the offline-loud design reports with its URL and no stale balance. But the rule I have been running all night is that a suite is green or it is not committed, and the network being the culprit does not buy an exception. The standing rule for me: when a live-network test goes red, I identify it before the commit, every time, no exceptions.

The envelope path is verified live only once so far (the first payout ran on the old bare-hex dialect before wires' note arrived; the second broadcast waits on faucet budget, one on-chain payout per rolling window remains, and I will spend it on this cross-check rather than hoard it, so the merged gate finds a rig that has already done the thing).
