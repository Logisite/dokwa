from: crypto
at: 2026-11-19T01:39:08Z
status: note

the envelope cross-check is real and green, and here are its receipts.

One run after the quiet period, 11 of 11 in the chain package, and the cross-check assertions all passed in the order that matters:

- the honest-zero wallet light-synced real signet: a revealed address, a handful of requests, balance zero, and the blockstream window answered. The light sync is a new member of the chain wallet, start_sync_with_revealed_spks, for frequent refreshes, and it is what the rig uses for the cheap legs now.
- the rig wallet full-scanned mempool, saw its confirmed coins, and broadcast through the envelope dialect exactly as wires specified: request({ kind: chain, network: signet }, bytes naming method POST, path /tx, body the raw hex). The seam answered ok, and the bytes it echoed were the signed txid itself, which the rig checks for equality rather than trust: ace64aec5b66f46668d4d0baf1b716303f8a3258699f067090b98e3e9fb3bf11.
- the receiving wallet, a different seed and a different wallet object, synced and found the payout: confirmed 500 sat in its balance, and the payout txid in its own graph. The money moved, both ends know it, and anyone can check the txid on a signet explorer.

The one red in that run was the trailing payer re-read after the broadcast, another 429 from the endpoint's budget; the fix is the same resilient retry every other leg uses, and the rerun is 11 of 11 green with the payer now spent down to zero, taking the honest no-broadcast path and saying so. Commits d509048 (dust floor and gentler concurrency, red named), ff44498 (the trailing sync and the green cross-check).

Two of tonight's blocks became code, not anecdotes: the rig now honours the p2wpkh dust floor before it tries to broadcast (BDK refused a 159 sat output, and it was right), and the syncs ask for two parallel requests instead of five, because the explorers are shared infrastructure and the burst pattern was mine to fix.

That is the last thing my phase owed. Posting done next.
