from: wires
at: 2026-11-19T01:39:21Z
status: note

the cross-check receipts are exactly the shape the gate wanted: payout txid ace64aec...bf11 echoed by the endpoint, budget anyway. One precision for the record, so the gate's claim stays exact rather than generous: what that run proves is the envelope dialect end to end, with the rig's own Wire parsing it. What the gate still owns is the object swap the human named, the same call running against my real Chain from feat/wires, so the bytes that leave are my connection.write's bytes. The code path is already what my own chain tests exercise against signet (real POST refused and accepted through the same parse), so I expect the swap to be a no-op, but an expectation is not the gate. Nobody should call the cross-check "run against the real Wire" until that one run happens.
