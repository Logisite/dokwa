# dokwa

A neighborhood marketplace with its own courtroom, and a wallet that teaches you how both work.

## What problem this solves

In a local community, most commerce runs on reputation: who you are, whether you pay, whether the goods arrived. That works until it doesn't. When a dispute happens, there is no cheap way to settle it. You either eat the loss, argue in public, or involve an institution that doesn't understand the context.

At the same time, Bitcoin and Lightning are hard to learn. The tools hide their workings behind abstractions, so people can use a wallet without understanding what it trusts. That is convenient for spending and bad for learning.

dokwa addresses both with one system. It gives a community a marketplace where listings, payments, deliveries, and disputes are recorded as signed events that anyone can inspect. The same system doubles as a curriculum: the wallet is built so that using it teaches you what it does. Education is not a separate product bolted on — it is the same machinery, turned toward explaining itself.

## What the product is

Three things share one substrate of signed Nostr events:

1. **A marketplace** — neighbors list goods and skills, reserve with payments, and receive deliveries.
2. **A courtroom** — disputes over payments and handoffs are decided by cryptographic races, with one arbiter signing the result.
3. **A learning path** — the same mechanisms are presented as lessons, progressing from operating a primitive to understanding what it means.

A user can arrive as a buyer, a seller, a courier, a juror, or a learner. These are not different accounts with different databases. They are different ways of interacting with the same signed record.

## Why these belong together

The marketplace generates the disputes. The courtroom resolves them. The learning path explains why the resolution works. Separate them and each becomes weaker:

- A marketplace without a courtroom has no way to handle the conflicts it inevitably produces.
- A courtroom without a marketplace has no real cases — only demonstrations.
- A learning path without both is abstract: lessons about escrow and revocation with nothing at stake.
- An education layer that replaced the marketplace would lose the thing that makes the lessons real.

dokwa keeps all three. The learner clears the same PSBT puzzle that secures a real bounty. The arbitration mechanism that settles a dispute is the one they study. The wallet they use to trade is the wallet they learn on.

---

## Under the hood

### The record layer

Every meaningful action is a Nostr event: a listing, a reservation, a payment receipt, a handoff confirmation, a signed witness note, a verdict. Events are tagged with the people and things they concern (`p` tags for participants, `t` tags for categories, `e` tags for the event being replied to). Because events are signed and stored across multiple relays, no single neighbor can quietly edit the history.

Relays are transport, not authority. The client connects to several, keeps a fresh local view, and can still verify recent blocks if its primary relay goes down.

### The custody layer

Funds live in two places, deliberately:

- **The court's channel** holds pooled savings. It is the permanent exhibit — long-lived, self-custodied, watchtower-guarded.
- **Ecash in the court** holds daily "coffee money." It is blind-signed, unlinkable, and short-lived.

A five-key grant committee controls the pool: funds release only on a majority of revocable keys, so no single person can empty it. A locksmith rotates the ecash bearer secret hourly, and a traffic-light oracle notarizes each rotation with a since-filtered signal note proving exactly when the old key was revoked. The difference matters: `get_info` testimony about ecash expires with the hour, while the channel exhibit is immortal. Every disputed receipt must therefore be tied to the key that was valid when it was signed.

### The dispute layer

When two parties claim the same reservation or challenge a signature, the court runs one of two races:

- **Who paid first** — each neighbor's blind-signed token arrives as a `payment_received` in an isolated sub-wallet; the winner's ecash is reissued with a fresh blinding factor nobody can link.
- **Whose blind signature is genuine** — the sub-wallet whose blind signature unblinds first wins; the loser's tokens are melted into a fossil-record event on a censoring relay.

A blinding magician supplies the secret and reveals it only by signing a kind-1 event after the `payment_sent` prediction lands, so the reveal is timed evidence rather than an early giveaway.

The two races would otherwise produce competing claims. A fraud-detection arbiter double-verifies every signature — against the notarized current bearer key and the signed witness notes in the courtroom chain — emits an alert on anomalous patterns for the security log, and signs **one canonical result**. That signed result is the verdict.

### The enforcement layer

A bug-bounty watchtower punishes cheating channels by day and, at midnight, swaps recovered sats into blind-signed IOUs a federation of guardians cannot link back to the exploit report. Those recovered funds refill the bounty pool. A bug-bounty escape room — a PSBT as the puzzle, an offline bearer token as the prize, an exit invoice paid by the first node to independently verify the block — tests the system and pays the tester.

### The learning layer

The mechanisms above are exposed to learners in a fixed order. Each lesson requires performing the operation, not reading about it:

1. **Escape room** — construct and sign a PSBT. The prize is an offline bearer token; the exit invoice is paid by the first node to verify the block.
2. **Notarized key rotation** — rotate a key and read the notarized note that proves when the old one died.
3. **Dual custody** — hold funds both ways and see which adversary each protects against.
4. **Races** — compete in HTLC arrival and blind-signature unblinding.
5. **Magician** — use a payment event as a secret-reveal trigger.
6. **Arbiter** — verify a signature rather than trusting a reply.
7. **Doorbell** — authorize a courier against a block your own node confirmed minutes ago.
8. **Timed escrow** — release `expires_at` against a matching zap receipt.
9. **Key-hygiene guide** — revocation keys and blinding factors as two secret scalars, each defending against a different adversary.
10. **Stealth read grant** — query historical records without revealing which records exist; earn a progress credential that doesn't leak which modules you failed.
11. **Concealed campaign pubkey** — the anonymous issuer behind lesson and bounty rewards.

The first eight are mechanical: operate the primitive. The last three are conceptual: understand what the primitive means. A learner finishes able to use the wallet and explain it.

---

## How a session works

1. A grant committee releases community savings into the court's channel.
2. Sellers post listings as tagged notes; buyers reserve with zaps. Coffee money sits in ecash, larger value in the channel.
3. The locksmith rotates the bearer secret hourly; the oracle notarizes it.
4. A courier arrives; the doorbell checks the payment proof against a recently confirmed block from the user's own node.
5. For a larger listing, escrow expires the moment a matching zap receipt confirms the milestone.
6. A dispute triggers a race; the arbiter double-verifies and signs one verdict.
7. Recovered sats from cheating channels refill the bounty pool; the escape room tests the next contributor.
8. A learner moves through the same flow in lesson form, on signet, with nothing at stake.

## What makes it more than the sum of its parts

The mechanisms are chained, not collected:

- No grant committee → no pool → no channel exhibit → nothing to dispute about.
- No notarized rotation → nobody knows which key signed a receipt → the arbiter cannot verify → the races have no winner → disputes stall → deliveries cannot be authorized.
- No signed witness notes → witnesses can be impersonated → the arbiter's check is meaningless.
- No magician → no secret producer, no fresh blinding factor, no timed reveal.
- No arbiter → two races, two competing results, no verdict.
- No escrow → every large listing becomes a manual court case.
- No watchtower or escape room → no enforcement, no testing, no funded bounties.
- No learning layer → the community can use the system but cannot understand or extend it.

Each strange piece has one job that no other piece does, and the courtroom is where all of them have to agree. The learning layer exists so the next person can maintain that agreement.

---

## Setup

```bash
git clone <repo> dokwa
cd dokwa
docker compose up
```

One command starts the app, a local relay, and a signet/regtest node with seed data: a few listings, three neighbors, a funded grant committee, and a sample dispute awaiting arbitration.

## What this is not

- **Not a payments app.** The wallet is infrastructure for a marketplace and a classroom, not the product itself.
- **Not a social network.** Events are records, not a feed.
- **Not primarily education.** Education runs alongside the marketplace and courtroom; it does not replace them.
- **Not anonymous by default.** Content is confidential where encrypted, but metadata and IPs are visible to relays.

## Constraints it is designed for

- Mid-range phones and low bandwidth — signed events are small, and only what is needed is fetched.
- Local context — Wolof and French copy, mobile-money-shaped flows, no assumption of banking infrastructure.
- Secure defaults — proven libraries (BDK, LDK, Cashu), no PII in logs, least-privilege keys, no mockups where a real integration fits.

## Metrics

- Listings posted and reservations completed per week
- Disputes opened, time to verdict, and reversal rate
- Delivery authorizations against recently confirmed blocks
- Lessons completed and wallet operations performed on signet
- Bounty sats recovered and reissued as unlinkable IOUs
