# Idea generation with adversarial review

Applying the test: *is this a plausible-sounding story reverse-engineered to justify the pile of features — nonsense wrapped in confident prose, hoping it reads as coherence?*

An idea passes only if the problem is independently verifiable AND each feature has a causal job in solving it. Removing a feature must break the solution, not just the story.

---

## Verifiable problems (no invention)

**P1 — Sub-Saharan Africa remittance cost.**
World Bank Remittance Prices Worldwide, Issue 54 (Q3 2025): SSA average **8.46%** to send $200, global average **6.36%**, UN SDG 10.c target **<3%**. Digital services into the region ~4.81% vs cash-oriented ~10.45%. ~$56B flowed to SSA in 2024.
Source: https://remittanceprices.worldbank.org/sites/default/files/2026-04/RPW_main_report_and_annex_Q325.pdf

**P2 — Lightning inbound liquidity for new merchants.**
Lightning Labs' builder guide: "To be able to receive payments, a merchant has to acquire inbound liquidity." A fresh node has zero; a channel funded entirely by the merchant starts 100% outbound. Another source calls it "historically the biggest barrier to merchant adoption." LSPs and JIT channels (bLIP-52) exist to solve exactly this.
Sources: https://docs.lightning.engineering/the-lightning-network/liquidity/liquidity-management-for-lightning-merchants · https://zelcore.io/academy/how-to/lightning-bitcoin-merchant-payments-lsps

**P3 — Senegal mobile money concentration and fragmentation.**
87% of Senegalese use mobile money (People and Data, 2026); Wave ~80% of outstanding e-money, Orange Money ~19%. BCEAO launched PI-SPI interoperability on 30 Sep 2025; 412,172 merchants registered to accept e-money in 2024.
Sources: https://www.peopledatasense.com/2026/03/27/barometre-acs-2026-focus-n2-mobile-money · https://omno.com/coverage/senegal

---

## Generated ideas and review

### Idea A — "dokwa solves the 8.46% remittance problem"
**Claim:** SSA remittances cost 8.46%; dokwa's mechanisms make it cheap.
**Problem verifiable:** Yes (P1).
**Review:** **FAIL — reverse-engineered story.** The courtroom, two blind-signature races, blinding magician, traffic-light oracle, courier doorbell, watchtower, and escape room have no causal role in reducing transfer fees. Removing all of them leaves the remittance claim intact, which proves they were decorative. Confident prose about "settling disputes" cannot connect a PSBT escape room to an FX margin. The real problem was chosen first, then the features were asserted to address it without a mechanism.

### Idea B — "dokwa solves the courtroom shortage for local commerce"
**Claim:** Local commerce lacks cheap dispute resolution; dokwa supplies a court.
**Problem verifiable:** **No.** This is the previously invented problem. No source establishes that local traders lack forums or that they "argue in public / eat the loss." This is the exact anti-pattern: a story written to justify features 2, 6, 11, 14.
**Review:** **FAIL — invented problem.**

### Idea C — "dokwa removes the inbound-liquidity barrier for new merchants"
**Claim:** A new Lightning merchant cannot receive. A customer pays in blind-signed ecash (nutzap), which needs no receiver channel; the merchant melts the tokens through a mint into a Lightning invoice. The merchant accepts value on day one without buying inbound liquidity.
**Problem verifiable:** Yes (P2), from Lightning Labs and the LSP/bLIP-52 literature.
**Causal chain:** Customer holds ecash → transfers bearer token over Nostr (no channel needed) → merchant melts at mint → mint pays Lightning invoice → merchant receives. This is a documented property of ecash, not an invented one (see `wallet-models.md`: nutzaps need no sender channel; receiver melts through a mint).
**Review:** **PASS for features 6, 10, 2 (ecash half), 8.** Removing the mint-race or the ecash custody breaks the solution.
**But:** features 3 (magician), 5 (doorbell), 9 (escape room), 12 (escrow), 13 (watchtower) still have no job here. Partial pass only.

### Idea D — "dokwa is a mobile-money interoperability layer for Senegal"
**Claim:** PI-SPI interoperability and Wave dominance create fragmentation; dokwa bridges wallets.
**Problem verifiable:** Partly (P3), but the interoperability is being built by BCEAO/PI-SPI, and none of dokwa's 14 features speak Wave/Orange Money APIs or touch e-money ledgers.
**Review:** **FAIL — problem real, solution unrelated.** Another reverse-engineered story.

### Idea E — "dokwa is an educational wallet for merchant onboarding"
**Claim:** Merchants cannot start accepting Lightning because they do not understand inbound liquidity; dokwa teaches it while providing ecash receiving.
**Problem verifiable:** P2 is real; the education claim is supported by the brief (learning tools are an example class) and by BTrust's own mission (Btrust Builders, BitQuest/BitLab).
**Causal chain:** The learner hits the real inbound-liquidity wall on signet, then is shown that ecash melting removes it. Lesson 8 (notarized rotation) explains why `get_info` testimony expires; the key-hygiene guide (lesson 9) explains the two secrets. The learning path explains the mechanism actually used.
**Review:** **PASS for features 6, 10, 2 (ecash half), 8, 9, and the learning layer.** Education is not invented — it is in the brief — and it explains a mechanism rather than decorating a feature pile.
**Still unjustified:** magician, doorbell, escape room, escrow, watchtower, arbiter, dual-custody courtroom framing in full.

---

## Review verdict

| Idea | Verifiable problem | Features causally required | Verdict |
|---|---|---|---|
| A — remittance cost | Yes (P1) | None of the 14 | FAIL: reverse-engineered |
| B — courtroom shortage | No | 2, 6, 11, 14 | FAIL: invented problem |
| C — inbound liquidity | Yes (P2) | 6, 10, 2, 8 | PARTIAL PASS |
| D — mobile-money interop | Partly (P3) | None | FAIL: unrelated solution |
| E — educational merchant onboarding | Yes (P2) + brief | 6, 10, 2, 8, 9, learning layer | PASS (partial) |

The honest finding: **no real problem justifies all 14 features.** The generator produced a pile, and the plausible stories written around it were reverse-engineered. Only ideas C and E survive, and even they use less than half the pile. The remaining features — magician, doorbell, escape room, escrow, watchtower, arbiter, full courtroom — are generator noise. Any README claiming they are necessary is the exact failure mode under review.

This document deliberately does **not** write a confident problem statement around the full pile.
