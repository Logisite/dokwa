# Build Spec

Every fragment from the generator output, listed as a feature. Source: `python idea_generator.py 5 --useful --parts 3`, field clauses removed.

**Race resolution:** duplicates 6/9 and 12/14 collapsed into single entries. Feature 14, taken from a subsequent generator run, is the arbiter: it double-verifies signatures and emits a signed alert, producing one canonical race result instead of two competing claims.

---

1. **Multisig-style grant committee** — five sub-wallets each hold a revocable key; funds release only on a majority of votes.
2. **Dual-custody courtroom** — holds savings in a channel and coffee money in ecash; the locksmith rotates the bearer secret hourly, so `get_info` testimony about the ecash expires every hour while the trust-minimized channel exhibit is immortal.
3. **Blinding magician** — blinds a secret with random factor `r`, crossfades it through inbound and outbound capacity as a magic trick, and reveals the key by signing a kind-1 event only after the `payment_sent` prediction lands.
4. **Favorite-color state query** — the proof is itself a signed Nostr note in the courtroom's e-tagged chain, so proving you know the wallet's mood is admissible evidence.
5. **Courier-access doorbell** — unlocks only when a payment proof is checked against a block your node confirmed minutes ago, giving remote deliveries verifiable authorization.
6. **Village mint "who paid first" race** — each neighbor's blind-signed token lands as a `payment_received` in an isolated sub-wallet; the winner gets their ecash reissued with a fresh blinding factor nobody can link. *(deduplicated from two generated copies)*
7. **Resilient network interface** — maintains channels to newly discovered relays, so the wallet keeps a fresh local view even if its primary relay goes down.
8. **Notarized hourly key rotation** — the locksmith's rotation is notarized by the traffic-light oracle, whose since-filtered signal note proves exactly when the old pubkey was revoked, making it the star exhibit in a trial over whether a zap receipt was signed by the right bearer.
9. **Bug-bounty escape room** — the puzzle is a PSBT, the prize is an offline bearer token, and the exit invoice is paid by the first node to independently verify the block.
10. **Neighborhood marketplace** — each listing is a kind-1 note with a category `t` tag and a seller `p` tag, letting buyers filter locally and reserve with a zap.
11. **Unblinding-first race** — judged not by `payment_received` but by which isolated sub-wallet's blind signature unblinds first; the loser's tokens are melted into a fossil-record event on a censoring relay. *(deduplicated from two generated copies)*
12. **Timed-release document escrow** — auto-expires a connection at `expires_at` the moment a zap receipt matching an agreed note confirms the payment milestone.
13. **Bug-bounty watchtower** — punishes cheating channels by day and, at midnight, swaps the recovered sats into blind-signed IOUs a federation of guardians cannot link to the exploit report.
14. **Race arbiter (from subsequent generator run)** — a fraud-detection trust anchor that double-verifies every incoming app signature and emits a signed alert when a request pattern looks anomalous, giving security teams an audit trail; it resolves features 6 and 11 by signing one canonical race result.
