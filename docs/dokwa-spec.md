# dokwa — product specification

Documentation of what has been decided. Not a plan and not a division of labour. Where something is undecided it says so.

---

## 1. What dokwa is

A **progressive web app** that is a wallet for a *place* rather than for a person.

The place is small: a bar with a stage, a hall that hosts nights, a market stall with three helpers. Anywhere several people share one till and someone has to answer for it the next morning.

It holds money, but money is the medium. What it actually holds is the record of an evening: who paid, who worked, who was allowed to do what, and what was agreed.

Three properties define it:

1. **Payments work with no network at all** — two phones, one QR, nothing else.
2. **Authority is a signed object that expires**, verified locally, not a setting on a server.
3. **The record is replicated and signed**, so the night can be proven afterwards by anyone the holder chooses.

Education is not a fourth product. It is the mechanism that decides who may hold authority (§7).

---

## 2. The problem

The context is tools for African people around Bitcoin, Lightning, Nostr and AI. Within that, the chosen frame is a bounded collective that handles money in person, under conditions where connectivity is not guaranteed:

- several payees must split one night's takings, and they do not fully trust each other's books;
- staff change shift, and the 2am crew should not hold the owner's keys;
- payers have no account, often no wallet, and sometimes no signal;
- someone has to be able to prove what happened, later, without publishing everything.

What the existing instruments fail at, mechanically:

| Instrument | Precondition it imposes | Where it fails a room |
|---|---|---|
| Cash | physical presence, a person holding it | cannot split itself, cannot be delegated with limits, leaves no auditable record |
| Card terminal | acquirer connectivity, merchant account, settlement in days | dies in a basement, excludes payers without bank accounts, hands the processor the full record |
| Lightning | receiver has inbound capacity; both ends online | a new venue has neither; an online protocol cannot settle offline |
| Ecash | a mint holding a reserve | needs a mint, and its honesty is an assumption |

The product is the combination that survives all four conditions: **ecash for the room, Lightning at the border, on-chain beneath both.**

### 2.1 What the evidence supports, and what it does not

Searched, with sources, so that this section does not rest on an invented problem:

- **Connectivity is unreliable, episodically.** In March 2024, damage to four subsea cables (ACE, SAT-3/WASC, WACS, MainOne) degraded or cut connectivity in 13 West African countries for hours to days (AP, Reuters, Internet Society). Cable cuts are not rare — over 100 a year (Internet Society). So a payment that survives a network outage is grounded in observed events, but the condition is *episodic*: it matters when it happens, not daily.
- **Payments themselves are not broken.** Mobile money reaches near-universal use in Senegal (87% of adults, People and Data 2026), and Wave moved person-to-person transfers to near-zero fees. A claim that "people cannot pay each other" is false, and this product does not compete with Wave on daily payments.
- **Group money with provable records is a real institution and a real market.** Tontines: one Senegalese fintech blog reports over 70% of households participate and women are ~70% of members — a vendor's claim, flagged as such, but the institution itself is not in doubt. Multiple companies already sell digital tontine apps, which proves demand and competition.

### 2.2 The honest verdict

Assume the starting point: this population already uses digital money — mobile money rails exist, and within the crypto world there are wallets, exchanges and stablecoin rails available today. dokwa is not competing with fiat, and the spec makes no claim about displacing it.

Within that world, dokwa raises Bitcoin adoption by removing the frictions that currently keep Bitcoin out of group money, where the competition is *other crypto products*:

| Friction in existing crypto tooling | What dokwa does |
|---|---|
| Receiving requires inbound liquidity or a custodial service | bearer tokens need neither |
| Paying requires connectivity at the moment of payment | QR between two phones, no network |
| Money that is *not yours* is what settles group debts | a signed record of who paid whom, and for what |
| Group pots live on a platform's database | replicated signed events nobody holds alone |
| Most wallets are personal instruments | roles, expiring capabilities, and a till that staff can hold |
| The record exists only if the platform keeps it | three relays, dedupe by ID, anyone may publish |

So the adoption claim is narrow and defensible: **for group money inside the crypto world, dokwa is the tool that works without an account, without a signal, and without a platform holding the truth.** It is not a claim about fiat, and it is not a claim about daily payments.

---

## 3. The people

| Role | Holds | Sees |
|---|---|---|
| **Audience** | nothing, or a token, or a cached app shell | one amount screen, one receipt |
| **Crew** | a capability that expires | exactly one action |
| **Performer** | a share, a claim on the till | tips live, own share, cash-out |
| **Owner** | the venue key, grant authority | tonight, people, money, record |
| **Agent / promoter** | a read-only capability | one query |
| **Apprentice** | a test-till identity | eleven shifts |
| **Arbiter** | a badge and a ruling key | dossiers |

There are no accounts. A key is the identity, and identity is the same object across the wallet, the messages, the credentials and the record.

---

## 4. Decisions

Each is a decision with its reason and, where relevant, the alternative that was rejected.

**D1. PWA, not a native app.** Installed from a link, no store, no review. Consequences accepted: a service worker requires HTTPS; Web NFC is not usable phone-to-phone; background sync is Chromium-only; iOS push requires home-screen installation. QR through the camera is the universal path, so QR is primary, not fallback.

**D2. A wallet for a place, not a person.** Rejected: a general consumer wallet (no differentiation against Trust Wallet–shaped apps), and a marketplace with a courtroom (the courtroom had no cases and the marketplace had no problem).

**D3. Nostr is the substrate, in four roles.** Identity (kind-0, NIP-05), auth (NIP-42 / NIP-46 / NIP-98), messaging (NIP-17, NIP-29, NIP-53), records and discovery (kind-1, NIP-40, NIP-65, NIP-77, NIP-58, NIP-90). Rejected: Nostr as a mere append-only log, which made the product a wallet with a diary.

**D4. NWC is the only path to money.** No component reads a seed. Every money action is a scoped request with a method list, an optional budget and an expiry. A role *is* its permission set.

**D5. Authority is a signed capability, verifiable offline.** A grant names methods, budget, expiry and required badge, and is signed by the owner. The wallet validates the signature locally, so authority does not require reaching a server. This is what makes a crew key that dies at 06:00 work with the radio off.

**D6. Ecash in the room, Lightning at the border, on-chain beneath.** Ecash is the only bearer instrument that is simultaneously offline-capable, divisible and programmable. Lightning is how value enters, leaves and reaches anyone not present. On-chain exists because the mint's reserve and the door checks both need a block the device verified itself.

**D7. Pre-mint before the event; circulate offline; settle after.** The mint does not need to exist while the doors are open. This is the only way to have ecash with no server present: the signature happens before the outage.

**D8. QR is the payment floor.** Two phones, no network, no hotspot, no relay. Everything else — hub, hotspot, relays, courier — exists for visibility, durability and settlement, never for the payment itself.

**D9. Hub, not mesh, for live sync.** A mesh of ten phones is 45 connections. One phone acts as hub and serves the room over WebRTC data channels; if it leaves, another takes over. Rejected: full mesh (battery, churn).

**D10. The relay protocol runs over any pipe.** `REQ` / `EVENT` / `EOSE` are spoken to a websocket relay or to a peer over a data channel, identically. The app cannot tell which it is talking to, so transport is swappable.

**D11. Public events replicate to every peer; DMs only to their recipient.** Full replication makes any phone able to become the hub and any phone able to publish. Gift wraps are not copied broadly, because the `p` tag leaks a social graph for no benefit.

**D12. Any peer may publish.** Events are signed and immutable, so forwarding is not forgery. Duplicates are harmless — relays dedupe by ID. The one caveat: a relay that enforces NIP-42 may reject an event whose author is not the authenticated connection, so durability relays must be chosen for permissiveness.

**D13. No server in the room.** A PWA cannot listen on a socket, so there is no in-room server by construction. The consequences are accepted: hub failover is manual when offline, and the venue's node, if it exists, is reached when connectivity exists.

**D14. Education warns authority, it does not stop it.** A badge is a signed award, and a role scope names the badge it expects. When the badge is missing the app says so and the grant proceeds on confirmation. No hard stop: the signer is the owner's own tool, so a refusal would be bypassed rather than obeyed. The chain is learn → badge → grant → permission set → money, with a warning where a refusal would be theatre.

**D15. AI never holds a key and never signs.** Its output is a summary of events or a proposal a human signs. Rejected: an autonomous agent in the money path (unauditable).

**D16. The interface is the permission set.** If a scope does not include something, the control does not exist. There is no hidden-but-present button.

**D17. Alby is the reference wallet.** The extension is the demonstration wallet and the first integration, reached through Bitcoin Connect so the app is not hard-coded to it, and over NWC so it can be replaced. The on-chain exit is demonstrated in Sparrow instead, deliberately, so the coins land in software unrelated to dokwa (§5.6).

---

## 5. Money

### 5.1 Instruments

| Instrument | Role | Requires |
|---|---|---|
| Ecash (Cashu) | in-room payments, tips, splits, crew cash | a mint; pre-minted tokens |
| Lightning (LDK) | mint/melt, remote payees, the venue's pot | channel, inbound liquidity |
| On-chain (BDK) | reserve, channel funding, withdrawal | a node |

### 5.2 Issuance and settlement

1. **Before:** tokens are minted (NUT-04) — the payer pays a Lightning invoice, the mint issues.
2. **During:** tokens move as data. Nothing is minted, swapped or consulted.
3. **After:** tokens are swapped (NUT-03) or melted (NUT-05); the mint pays Lightning; the venue's node receives into its channel; on-chain only on close or withdrawal.

### 5.3 The mint

The mint is the trust anchor, and this is stated rather than hidden. Four possible operators:

1. the venue, for its own room — simplest, trust equals the venue;
2. an independent local operator — trust separated, still one party;
3. a federation with threshold signing — better, much more work;
4. a public mint — trust in a stranger, worst fit for a room.

**Decided:** the mint sits behind one interface (`mint`, `melt`, `swap`, `checkstate`), so the operator can change without touching the app. The document must state which operator is in use rather than implying federation.

### 5.4 What a token can and cannot prove offline

- **Can:** that the mint signed it (DLEQ, NUT-12), using cached keyset public keys.
- **Cannot:** that it has not already been spent. Only the mint knows.

Therefore an offline token is a **promise**. Enforcement is detection at settlement, not prevention. The mitigations are: a cap on offline amounts, physical presence, and attribution — the receipt carries the payer's signature, so a bounce is a named event rather than an anonymous loss.

### 5.5 Interoperability

The product is a wallet, not a closed loop. Three points where it is the real thing:

**Attachable.** The PWA connects to a Lightning wallet over NWC (NIP-47). Any wallet that speaks NWC can be attached — a self-hosted node, a hub, or an existing wallet the user already has. No bespoke protocol, no lock-in, and the connection is revocable and scoped like every other capability.

**Payable.** Invoices the PWA creates are standard BOLT11 or BOLT12. Any wallet anywhere can pay them, including wallets that have never heard of dokwa. The reverse holds: the PWA can pay any standard invoice.

**Redeemable.** Ecash is a claim on a mint that holds real BTC. Swap or melt converts it to a Lightning payment, which means sats, in a channel, withdrawable on-chain.

The offline path never touches Lightning — that is the point of the split. But every token in the room is a claim that ends in a real sat, and every invoice is payable from outside. If either of those stops being true, the product is a points system and should be described as one.

### 5.6 Reference wallet

**Decided: Alby is the reference wallet.**

- **Alby** (browser extension) is the wallet used in the demonstration and the first integration. It carries a Lightning account, exposes WebLN so a page can request a payment, and acts as a NIP-07 signer, so the same extension that pays an invoice also signs the Nostr event.
- **Bitcoin Connect** (`@getalby/bitcoin-connect`) is the connect layer: one button with multiple backends (Alby/WebLN, NWC, LNbits). It is the closest Bitcoin has to a wallet-adapter, and it keeps the PWA from hard-coding Alby.
- **NWC remains the protocol**, so Alby is the first supported wallet, not the only possible one. Replacing it should not require touching the app.

Two limits, recorded rather than glossed:

1. **No consumer extension offers signet.** Alby's network follows whatever backend it is attached to, not a network switch in the UI. So the signet demonstration anchors Alby to a node we operate, rather than to Alby's hosted default.
2. **On-chain proof uses a different wallet on purpose.** Sparrow on signet receives the exit address, so the demonstration shows coins arriving in software that has never heard of dokwa. Using Alby for both halves would weaken the strongest claim in the demo.

The ecosystem gap this exposes is part of the argument: on EVM a dApp assumes one wallet and one connect flow; on Bitcoin, identity, Lightning and on-chain are three different connection stories, and no single standard unifies them.

### 5.7 Settlement and the exit

The complete path from a funded wallet to a public on-chain transaction, with what each step actually demonstrates:

| # | Step | Network | Proves |
|---|---|---|---|
| 1 | Sats in Alby (bought, or a signet faucet) | online | a funded Lightning wallet |
| 2 | Network off | none | — |
| 3 | Tokens move phone to phone by QR | none | value moves with no infrastructure |
| 4 | Melt: tokens returned, mint pays an invoice | online | ecash converts back to sats |
| 5 | Sats credited in Alby | online, instant | a real wallet received — **off-chain, no explorer** |
| 6 | Alby withdraws to a Sparrow address | online, ~10 min | **an on-chain transaction, public and checkable** |

Step 5 is where the money arrives and where there is nothing to show: a Lightning balance is private, so the evidence is two screens and no explorer. Step 6 is where the claim becomes independently verifiable, because a txid exists.

**Decision: the demonstration uses this six-step path.** Ending at step 5 would ask the audience to believe two screenshots.

### 5.8 Two ways to reach an address

| | Path | Parties | Linkability |
|---|---|---|---|
| **A** | melt → Alby → withdraw to address | Alby, Sparrow | split across two providers |
| **B** | melt into a reverse submarine swap, which pays the address directly | the swap service only | one party sees both ends |

A reverse swap (Boltz is the open implementation; Loop does it for node operators) gives back an address and an invoice in one object; paying the invoice causes an on-chain payment to that address. Atomicity comes from a hashlock and a timelock, so the service cannot take the Lightning funds without paying the on-chain output it committed to.

**Decided: A for the demonstration, B documented as the shorter path.** A shows two ordinary, recognisable wallets and keeps the two ends with different providers. B is one step but puts a single third party in a position to link the Lightning payment to the on-chain address, which is precisely the link the rest of the design works to break.

**Operational constraint:** melting requires the mint to *pay*, so it needs outbound capacity in its channels. A one-sided channel fails at step 4, in front of an audience.

---

## 6. Record and authority

### 6.1 Events

Everything is a signed event: listings, receipts, grants, badge awards, rulings, messages. Merging two phones' histories is set union, because events are immutable and signed — no clocks, no conflicts, no last-write-wins.

### 6.2 Authority objects

A grant is a replaceable event signed by the owner, carrying: allowed methods, budget, expiry, required badge. The wallet checks it locally. The signer refuses to extend a scope beyond the granter's own.

### 6.3 Revocation versus offline

These conflict. A revocation is an event you fetch; offline, a phone may act on a cached, already-revoked badge.

**Decided resolution:** short-lived capabilities rather than instant revocation. A scope that dies at 06:00 does not need to be revoked at 05:59, and the window in which a stale badge matters stays small. This is a deliberate trade, documented as such.

### 6.4 Selective disclosure

A holder should be able to prove income to a promoter without revealing the whole record. This is a **stated goal, not a built property**. The mechanism is undecided and is listed in §10 as open.

---

## 7. Learning

### 7.1 The test till

A second instance on signet/regtest: same app, same mechanisms, no money. An apprentice takes a shift on it.

### 7.2 Eleven shifts

1. The till — take a tip over a scoped capability; read what you were given.
2. The rotation — rotate a bearer secret; read the notarised note proving when the old key died.
3. The 2am key — redeem a read-only credential that turns out to be a bearer token.
4. The race — two claims for one slot; the winner is whichever blind signature unblinds first.
5. The split — hold half a duo's sub-wallet and prove you cannot read the other half.
6. The audit — spot a quiet edit to a mint's reserve across three relays.
7. The stall — a preimage misses its timelock; read the thread, then the ruling.
8. The door — authorise entry against a block your own node confirmed.
9. Two secrets — revocation keys defend against counterparties; blinding factors defend against issuers.
10. The quiet query — audit without revealing which records exist.
11. The anonymous issuer — a reward badge signed by a key nobody can link to the venue.

### 7.3 The gate

Each shift issues a badge. A role scope names the badge it expects. If the badge is absent, the app warns and the owner confirms; the grant is signed either way.

The gate is a warning, not a lock. A lock in the owner's own signer would be bypassed the first time it was inconvenient, and pretending otherwise would make the spec describe enforcement the mechanism cannot have.

The badge is only as good as the key that signed it, so each badge points at its own evidence: the transcript, the fossil record, the ruling. What a badge does not establish is honesty or competence under pressure — it shows the shift was performed, nothing more.

---

## 8. AI

### 8.1 The rule

The model never holds a key and never signs. Output is a summary of events or a proposal a human signs.

### 8.2 Roles

| Role | Does | Cannot |
|---|---|---|
| **Clerk** | builds a dispute dossier: timeline, claims, contradictions, missing evidence; every line cites an event ID | decide |
| **Steward** | turns intent into a permission-set proposal, validated against the requester's own scope | widen authority |
| **Tutor** | explains a computed pass/fail on a shift | grade |
| **Desk** | answers routine messages from calendar and rate card | commit money |
| **Night watch** | see 8.3 | move funds, sign, issue badges |

### 8.3 Watcher and analyst

The night watch is two programs, not a model on a timer.

- **Watcher:** a script. Fixed interval, five checks (reserve-proof age, relay divergence, unsettled invoices, channel state, scope expiry), deterministic, no model, no token cost. Emits a *finding* when a check fails.
- **Analyst:** the model, with no timer. Called on one finding plus the events it cites; returns `benign`, `escalate` or `unknown` (treated as escalate).

Inference cost scales with findings, not minutes. The night watch degrades to threshold paging without the model; the desk stops, because answering an unseen question is its whole job. That difference is the boundary between an AI feature and an AI agent here.

### 8.4 Payment for inference

NIP-90 job requests (`5000–5999`), results (`6000–6999`), feedback (`7000–7999`); paid by NWC invoice or ecash tip. AI spend lands on the same ledger and the same receipts as the night's takings.

### 8.5 Kill switch

Revoking the agent's grant kills every scope derived from it. Its badge stops counting as a valid claim, though the badge was never the lock — the grant was. Its actions are events, so the morning review is a filtered subscription.

---

## 9. Connectivity

### 9.1 Three states

| State | Payment | Record |
|---|---|---|
| No network at all | QR | local outbox |
| Hotspot, no uplink | QR | hub over data channels |
| Internet | QR or Lightning | relays; also a courier path for anything earlier |

### 9.2 Topology

```
[public relay A]   [public relay B]
        ▲                 ▲
        └──── wss ────────┘        (when any phone has data)
               │
        [ courier phone ]          (any phone, not a designated one)
               │
   ┌───────────┴────────────┐
   │  hotspot, no uplink    │
   │   [hub phone]          │
   │     ├── [peer]         │  WebRTC data channels
   │     ├── [peer]         │
   │     └── [peer]         │
   └────────────────────────┘

   tip: [phone] ──QR── [phone]     (bypasses everything above)
```

Star in the room, star to relays, mesh only between relays if federated. The hub is a peer, not a service, and is replaceable because every peer holds the record.

### 9.3 Four QR types

| QR | Carries | Needs network |
|---|---|---|
| Token | ecash proofs — the money | no |
| Claim link | URL with token in the fragment | no if the app is cached |
| Signalling | WebRTC offer/answer | no |
| Invoice | BOLT11 | yes |

Conflating these breaks the app: "share this" means opposite things for a receipt (safe to copy) and a token (first to redeem wins).

### 9.4 Receiver without the app

They can receive value as an object — a photograph of a token QR, or a pre-printed voucher — but not as a balance, and they cannot spend it onward except by showing the object again. A person without a key is a dead end in the money graph until they install.

### 9.5 Known constraints

- A phone joined to a no-internet wifi usually keeps routing to it; cellular fallback is unreliable.
- Some venue and guest networks isolate clients, so a LAN peer is unreachable even on the same SSID.
- A PWA cannot open `ws://` from an HTTPS origin, so an in-room relay needs `wss` and a trusted certificate, which is why it is not part of the core.
- Web NFC cannot do phone-to-phone in a browser.
- Hotspot client isolation, local-only hotspot behaviour, and mDNS resolution on a DNS-less network are all hardware-dependent and unverified.

---

## 10. Open questions

1. **Fiat on-ramp.** A member who cannot turn local currency into sats in under a minute cannot join a pot, and nothing in this design touches that step. Until it is answered, the product is theory for the population it names.
2. **Mint operator.** Which of the four options ships first, and how the reserve is proven at mint time, given tokens are pre-issued. Note: a Lightning balance is harder to prove than an on-chain one, because it is channel state rather than coins in an address.
3. **Key recovery.** No account means no password reset. There is no recovery story yet, and the claim flow makes the gap visible. This is the largest unanswered hole in a self-custody product.
4. **Selective disclosure.** The stealth read grant is a goal without a mechanism; it may not be buildable as described.
5. **Evidence completeness.** A re-wrapped thread proves what was said and that the disputant held it, not that it is whole. Completeness requires the arbiter to be a live participant from the start, which changes the trust model.
6. **Arbiter selection.** The document has rulings; the rule for choosing an arbiter, and what happens when the parties reject one, is not settled.
7. **Hub failover UX.** Manual re-handshake offline is acceptable but clumsy; whether an automatic path exists without a relay is unverified.
8. **Offline cap.** The maximum value that may move unswapped is a policy number that has not been chosen.
9. **iOS.** The design targets Chrome on Android. Safari's data-channel and background behaviour is untested.

---

## 11. Out of scope

- Fiat on-ramp and card acceptance.
- Accounting or tax integration.
- Cross-mint offline transfer (requires Lightning, therefore online).
- A general-purpose consumer wallet: a person with one wallet and no collaborators gains nothing here that a normal wallet does not provide.
- Federation governance, if option 3 of §5.3 is ever chosen.

---

## 12. Provenance

Two bodies of material were combined, and the difference is recorded rather than blurred.

**From a text-shuffling generator:** twenty-five fragments, kept close to their original wording, including the offline nutzap tips, the mint solvency proof diffed across relays, dual custody with hourly rotation, the 2am read-only key that is a bearer token, the shared sub-wallet, the stalled preimage going to a courtroom, the per-degree toaster, staked chess, and the thirty-second attestations.

**Added at the user's direction:** identity, auth, messaging, credentials, the venue frame itself, the capability model, the PWA constraints, the offline topology, the apprenticeship gate, and the AI layer. The venue frame and the badge-to-scope chain have no generator basis.

The generator's fragments were not validated as describing a real market. They were placed in a room where each has a job. A job is not a necessity, and this document does not claim otherwise.
