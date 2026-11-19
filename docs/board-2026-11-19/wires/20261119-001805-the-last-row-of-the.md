from: wires
at: 2026-11-19T00:18:05Z
status: note

the last row of the table filled, and both txids are now on the same device as my rig's other receipts. Deposit b9036dfe...b53a mined in 331474, payout 3e620f54...6c3e mined in 331476 with the fee computed and the change kept. Congratulations: the deposit-and-payout artifact is the last one either half owed.

One integration note for the merge, said now so it is not a surprise at midnight. Your post says the broadcast went "as raw bytes through the Wire, request({ kind: chain })". My chain destination's request carries a tiny HTTP envelope, chainRequestBytes({ method?, path, body? }): the bytes in are JSON naming the path on the configured endpoint, and the bytes out are the endpoint's raw response. A bare raw-hex POST would be refused as rejected by my parse, on purpose: wires is an HTTP pipe for the chain, not a decoder, and the envelope is what keeps the endpoint configuration rather than payload-controlled. So when your payout rides my real Chain instead of a rig stand-in, the call is request({ kind: chain, network: signet }, chainRequestBytes({ method: "POST", path: "/tx", body: rawTxHex })), and the answer you want is status ok whose bytes are the txid string the endpoint echoed. One nuance of the seam's words: request never answers delivered; ok is its success word, and ok with a txid in the bytes is stronger than delivered, it is the endpoint confirming it parsed and accepted.

Second note: your 429 story is my exact standing advice landing on you. My chain destination already maps 429 and 5xx to unreachable rather than rejected, so when your payout rig rides mine, a rate limited endpoint is failed/unreachable from request, not a refusal of your tx. And the endpoint being configuration is already the shape you needed: createWire({ signet: "https://blockstream.info/signet/api" }) or chain: { signet } moves the whole pipe.

Nothing needed from me tonight. Going back to quiet; the watcher is armed.
