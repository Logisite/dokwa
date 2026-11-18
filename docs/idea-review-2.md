# Idea generation — the other half

The first surviving idea (E) justified features **2, 6, 8, 9, 10** and the learning layer: a new merchant can receive value on day one because ecash melts into a Lightning invoice, so inbound liquidity is not a prerequisite; the wallet teaches this.

Left over: **1, 3, 4, 5, 7, 11, 12, 13, 14**.

Here is a second idea built from what those features actually *do*, not from a problem statement.

---

## Idea H — the locker bank

A neighborhood bank of shared lockers. Not a store, not a social network — a row of physical boxes with one lock each, used by couriers who need a place to drop and collect parcels during the day.

The lock is never a key. It is a **capability that exists for one hour**.

### What each feature does here

**5 — courier doorbell.** The box opens when a payment proof is checked against a block the user's own node confirmed minutes ago. The courier does not present a code; they present evidence that the drop was paid for, verified locally. Removing this and the locker is just a lock anyone can open.

**7 — resilient network interface.** The recent-block check is worthless if the local view is stale. This feature keeps channels to newly discovered relays so the doorbell still has fresh block data when the primary relay dies. Remove it and the doorbell fails exactly when it is needed most.

**3 — blinding magician.** The box's access phrase is never broadcast. It is a secret blinded with random factor `r`, and it is revealed only by signing a kind-1 event after the `payment_sent` prediction lands. So the phrase comes into existence at the moment payment lands, not before. Remove it and the phrase has to be stored somewhere — which is a password, which can be stolen.

**4 — favorite-color state query.** Members prove they belong by signing a note stating the current shared answer. The proof *is* the note, chained into the e-tagged record. This is the membership check that decides who may even enter the race. Remove it and anyone can claim a slot.

**11 — unblinding-first race.** Two couriers want the same box. The winner is not whoever's payment arrived first — it is whichever isolated sub-wallet's blind signature unblinds first. The loser's tokens are melted into a fossil-record event on a censoring relay. That fossil is the queue: a permanent, uneditable record that you asked and did not get. Remove it and allocation is first-come-first-served, which rewards speed and technical advantage rather than turn-taking.

**14 — race arbiter.** The two races could each claim a winner. The arbiter double-verifies every signature against the current notarized key and the signed membership notes, emits an alert on an anomalous pattern, and signs **one canonical result**. Remove it and the locker has two owners.

**12 — timed-release escrow.** The access grant auto-expires at `expires_at` the moment a zap receipt matching the agreed note confirms the drop was completed. The grant dies on proof of completion. Remove it and the box stays open after the job is done.

**1 — multisig grant committee.** Five sub-wallets hold revocable keys; funds for new boxes release only on a majority vote. The row of lockers grows by collective decision, not by one owner. Remove it and the bank is one person's property.

**13 — bug-bounty watchtower.** A courier who forges a drop proof gets their channel penalized by day; at midnight the recovered sats are swapped into blind-signed IOUs a federation of guardians cannot link back to the exploit report. The forfeiture funds the next box without publishing who was caught. Remove it and there is no consequence for forgery, and no funding for expansion.

That is all nine. Each has one job. Removing any one breaks a distinct step: physical access, freshness, secret timing, membership, allocation, adjudication, expiry, growth, enforcement.

---

## What this idea actually is

Not a payments app. Not a courtroom. A **physical access system with an accounting conscience** — a row of lockers where the lock is a timed capability, the queue is a permanent record, the verdict is a single signed event, and the penalty for cheating quietly pays for the next locker.

The strange pieces are not decoration here. The magician exists because a phrase that is broadcast can be copied. The fossil record exists because a queue that can be edited is not a queue. The midnight swap exists because publishing the punished courier's identity would turn a forfeiture into a feud.

---

## Unification with idea E

Idea E and idea H look unrelated until you see they are the same problem at two moments:

- **E is the moment of arrival.** A new participant has no inbound liquidity and no reputation. Ecash melting lets them receive on day one; the learning path explains why.
- **H is the moment of access.** That same participant needs a physical slot in the neighborhood economy. A timed capability gets the box open, a race decides who gets it, an arbiter makes the result singular, and a forfeiture funds the next one.

Unified: **dokwa is a starter kit for joining a local market.** It solves "I cannot receive" and "I cannot get a slot" with the same substrate. The newcomer arrives with nothing, receives their first payment through ecash, competes for a locker by unblinding, learns what each step means, and is bound by the same enforcement as everyone else.

Education is not a third product. It is the explanation layer over both arrival and access — the learner hits the inbound-liquidity wall and the allocation race on a test network before either one costs anything.

---

## Adversarial review of this idea (the test from the objective)

**Is this a plausible-sounding story reverse-engineered to justify the pile of features?**

Honest answer, applied to my own proposal:

- **Passing evidence:** the mapping above is mechanical, not narrative. Each feature removes a concrete failure — stale block data, stolen phrase, editable queue, two owners, permanent unlock, unenforced forgery. The features were not chosen for how they sound; they were assigned by what they do to a lock.
- **Failing evidence:** the pile still came first. I did not discover the locker bank and then derive the features; I had nine leftover features and looked for a system that needed all nine. A sufficiently determined writer can make any pile look necessary by inventing a machine with exactly that many failure modes. The fossil record and the midnight swap are the weakest links — they are explained, but the explanation was written after the feature existed.

**Verdict:** stronger than idea A, B, and D, which failed outright. Comparable to E — mechanically coherent, but still fitted to a pre-existing pile. The unification is honest about this: it does not claim the features were derived from a real observed problem, only that they now form a system that could run.

That distinction is the whole point of this review document. The earlier README claimed a problem it had no basis for. This one claims only what the mechanics support.
