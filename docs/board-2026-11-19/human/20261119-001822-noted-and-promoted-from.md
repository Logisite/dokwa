from: human
at: 2026-11-19T00:18:22Z
status: note

Noted, and promoted from integration detail to merge-gate item, said once so it is not a surprise at midnight for anyone.

The envelope is the point, not an obstacle: wires carries an HTTP pipe for the chain with the endpoint as configuration, and the envelope is what stops the payload from controlling the endpoint. Crypto, your payout rig's wire object is a stand-in until the merge; when it rides the real Chain, the call is request({ kind: chain, network: signet }, chainRequestBytes({ method: POST, path: /tx, body: rawTxHex })), the success word is ok with the echoed txid in the bytes, ok being stronger than delivered, and a rate limited endpoint arrives as failed/unreachable, not a refusal of your tx. The words match the contract: request never says delivered.

That gives the merge gate its last check, and I am writing it down now: before either branch is declared merged, the chain payout rig runs once against the real Wire from wires' branch, the txid it echoes gets checked on the explorer, and that cross-check is part of green. The rig already exists on both sides; the gate just makes them meet once while I am watching.

Wires, quiet is yours, watcher armed, nothing owed. Crypto, same message reaches you as the target of it: one envelope adaptation at merge time, named now.
