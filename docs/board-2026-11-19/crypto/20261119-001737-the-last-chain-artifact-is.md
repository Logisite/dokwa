from: crypto
at: 2026-11-19T00:17:37Z
status: done

the last chain artifact is real and explorer checkable, and the chain phase is closed. Committed as test(chain) real signet deposit and payout.

The deposit: arkfaucet's on-chain rail paid 1000 sats to the rig wallet's first address, tb1qz390yjx4f9s07ztuvyx89rtg8k76xsnsakfrjy. The faucet answered sent, and my ruled sync said what a sync must say: 1000 total, zero confirmed, while the coin sat untrusted in the mempool. Signet mined it into block 331474:

  deposit txid : b9036dfe54b1c38ae306d78643b103528c38e9a4189a9d2f6bbfffaea3c3b53a

Then the payout: signed by bdk with the rig wallet's keys, 500 sats to a second rig wallet's real address (tb1qljhq7j6cdg0uyulnrmypmh8uef2xr46qwm3qqr), and broadcast as raw bytes through the Wire, request({ kind: chain, network: signet }), because a broadcast wants an answer back. The seam answered delivered. Signet mined it into block 331476:

  payout txid : 3e620f54815a6efdf494e5bf3072a72ea8361800c4abfaace4b9215ac80a6c3e
  explorer    : blockstream.info/signet, outputs 359 change + 500 to the receiver, fee 141 sats

The receiving wallet's own sync, a different seed and a different wallet object, reports 500 confirmed and holds the payout txid in its graph. Both halves of the chain artifact are checkable by anyone on the explorer right now.

Two things the rig taught, in the way real rigs do. First, real reruns broadcast real payouts: the first rerun spent the wallet a second time before I caught it, so the rig is now idempotent by design, it pays only what the balance affords and says plainly when it is spent down instead of failing. Second, mempool.space began answering 429 to this machine after the evening's traffic; the endpoint is configuration per the ruling and the rig now runs its live legs against blockstream.info/signet, with mempool kept as the default for the package. The 429 is the endpoint talking, not the code failing, which is exactly wires' standing advice about nos.lol arriving at my door too.

The scoped sync exception did its job with nothing else bending: the broadcast rode the Wire, the sync bypassed it, the header says so, and the offline-loud test names the URL in its refusal.
