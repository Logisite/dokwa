# What the Trustline-style product actually is

*(From the two stitched outputs, Iteration 1 idea 1 + Iteration 2 idea 2.)*

A **community trust platform** — a place where a group can keep records, hold money, and settle disputes without trusting any single person or institution to be the keeper of the truth.

## The core idea

Everything that matters — a claim, a payment, a verdict, a measurement — is written as a **signed note** on Nostr relays. Anyone can verify who wrote it and that it wasn't changed. There's no central database to trust or lose.

So instead of "the market committee's notebook says X," you get "here is the signed event, here are the four relays that hold it, check it yourself."

## What you'd actually do with it

- **Record something** — a goal scored, a payment made, a weather reading, a signal-timing notice. It becomes a signed event with references to the people and things involved.
- **Hold value two ways** — the dashboard shows you what you're trusting: a watchtower guarding channel funds, or a mint backing blind-signed ecash. It compares them side by side so the trade-off is explicit rather than hidden.
- **Settle a dispute** — a deadline is set by an HTLC timelock, a zap receipt acts as the public exhibit, and the verdict is attached to the original event. A penalty can be a signed piece of community service — a review pinned to the record — rather than a fine.
- **Verify offline** — two devices can hand a bearer token between them and confirm it's valid without a network.
- **Learn the system** — a kiosk demonstrates revocation using a proof-of-possession check, and a testbed lets people experiment with fake payloads instead of real money.

## What makes it unusual

Most systems ask you to trust the operator. This one tries to make the trust **visible and comparable**: you can see that one part relies on cryptography and another on a mint's promise, and you choose. Even the odd bits have a logic — the policy engine that only allows batch operations on Tuesdays publishes a signed explanation of its refusal, so a rule being applied is itself an auditable event.

## The closest analogy

A **public notary, a small-claims court, a wallet dashboard, and a town noticeboard** — all built out of signed notes that anyone can inspect. The courtroom in the output is literal: the evidence is an event, the alibi is a filter, and the exhibit is a receipt. Nothing is accepted because an authority said so; it's accepted because the signature checks out.

It's not a new kind of money or a new social network — it's the **record-keeping and enforcement layer** that a community could run on top of Bitcoin, Lightning, and Nostr.
