# Build Spec — original 15

Reconstructed from the generator run `python idea_generator.py 5 --useful --parts 3`, field clauses removed. This is the version **before** I deduplicated features 6/9 and 12/14 and added the arbiter as feature 14.

---

## From output 1

1. **Multisig-style grant committee** — five sub-wallets each hold a revocable key; funds release only on a majority of votes.
2. **Dual-custody courtroom** — holds savings in a channel and coffee money in ecash; the locksmith rotates the bearer secret hourly, so `get_info` testimony about the ecash expires every hour while the trust-minimized channel exhibit is immortal.
3. **Blinding magician** — blinds a secret with random factor `r`, crossfades it through inbound and outbound capacity as a magic trick, and reveals the key by signing a kind-1 event only after the `payment_sent` prediction lands.

## From output 2

4. **Favorite-color state query** — the proof is itself a signed Nostr note in the courtroom's e-tagged chain, so proving you know the wallet's mood is admissible evidence.
5. **Courier-access doorbell** — unlocks only when a payment proof is checked against a block your node confirmed minutes ago, giving remote deliveries verifiable authorization.
6. **Village mint "who paid first" race** — each neighbor's blind-signed token lands as a `payment_received` in an isolated sub-wallet; the winner gets their ecash reissued with a fresh blinding factor nobody can link.

## From output 3

7. **Resilient network interface** — maintains channels to newly discovered relays, so the wallet keeps a fresh local view even if its primary relay goes down.
8. **Notarized hourly key rotation** — the locksmith's rotation is notarized by the traffic-light oracle, whose since-filtered signal note proves exactly when the old pubkey was revoked, making it the star exhibit in a trial over whether a zap receipt was signed by the right bearer.
9. **Village mint "who paid first" race** (second instance) — each neighbor's blind-signed token lands as a `payment_received` in an isolated sub-wallet; the winner gets their ecash reissued with a fresh blinding factor nobody can link.

## From output 4

10. **Bug-bounty escape room** — the puzzle is a PSBT, the prize is an offline bearer token, and the exit invoice is paid by the first node to independently verify the block.
11. **Neighborhood marketplace** — each listing is a kind-1 note with a category `t` tag and a seller `p` tag, letting buyers filter locally and reserve with a zap.
12. **Unblinding-first race** — judged not by `payment_received` but by which isolated sub-wallet's blind signature unblinds first; the loser's tokens are melted into a fossil-record event on a censoring relay.

## From output 5

13. **Timed-release document escrow** — auto-expires a connection at `expires_at` the moment a zap receipt matching an agreed note confirms the payment milestone.
14. **Unblinding-first race** (second instance) — judged not by `payment_received` but by which isolated sub-wallet's blind signature unblinds first; the loser's tokens are melted into a fossil-record event on a censoring relay.
15. **Bug-bounty watchtower** — punishes cheating channels by day and, at midnight, swaps the recovered sats into blind-signed IOUs a federation of guardians cannot link to the exploit report.

---

## The fields the generator attached (before I stripped them)

The 5 outputs carried these appended field names:

1. Transport & Infrastructure
2. Energy & Environment
3. Agriculture & Food
4. Technology & Computing
5. Technology & Computing

None of them was "Education & Learning" on this run. Education appeared on a **different** generator run — the filtered loop — which produced three fragments: a stealth read grant, a key-hygiene guide, and a customer-engagement platform, with "Education & Learning" appended. Those three became the conceptual lessons in the educational wallet.
