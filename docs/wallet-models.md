# Wallet Models — Channel-Based vs Ecash

"Wallet" is not one design. Two substantially different models exist, and they are easy to conflate because both can sit behind the same app-facing interface.

- **Channel-based** — the standard Lightning model. The wallet holds channel state.
- **Ecash (Cashu)** — a bearer-token model. The wallet holds blind-signed IOUs from a mint.

This document treats them as **models to choose between**, not as variants of one thing.

---

## Contents

1. [Two models](#1-two-models)
2. [Channel-based model](#2-channel-based-model)
3. [Ecash model](#3-ecash-model)
4. [The blind-signature mechanism](#4-the-blind-signature-mechanism)
5. [Capability comparison](#5-capability-comparison)
6. [Coexistence](#6-coexistence)
7. [Nostr integration](#7-nostr-integration)
8. [Choosing a model](#8-choosing-a-model)
9. [References](#9-references)

---

## 1. Two models

| | Channel-based | Ecash |
|---|---|---|
| Object held by wallet | Channel state and keys | Bearer tokens |
| Authority | Cryptographic protocol | Mint's promise |
| Network | The Lightning network itself | Offline transfer; Lightning only at boundaries |
| Trust | Trust-minimized | Trust the mint's solvency |
| Privacy mechanism | Onion routing, off-chain state | Blind signatures |

The distinction is not cosmetic. The two models have different trust assumptions, different privacy properties, and different failure modes.

---

## 2. Channel-based model

The standard Lightning architecture. A node opens a payment channel with an on-chain 2-of-2 transaction, then exchanges signed balance updates off-chain.

### Capabilities

- **Instant off-chain state updates** — no block confirmation required.
- **Multi-hop routing** via HTLCs — no direct channel needed with the recipient.
- **Trust-minimized custody** — revocation mechanisms prevent counterparty theft; funds cannot be taken by the routing network.
- **Payment instruments** — BOLT11 invoices, keysend, BOLT12 offers.
- **Network-native liquidity** — channels, rebalancing, and just-in-time provisioning through LSPs.
- **Watchtower support** — third parties can monitor for channel breaches.
- **Composability with apps** — NWC exposes the wallet as a permissioned API.

### Constraints

- Requires an online node (or a service acting as one).
- Inbound liquidity is needed to receive.
- Routing can fail; paths depend on network topology.
- Channel management is operationally significant.

Implementations: LDK, LND, Core Lightning, Eclair.

---

## 3. Ecash model

A mint holds Bitcoin and issues **blind-signed tokens** as promissory notes. Wallets hold those tokens. Lightning is used only to enter and exit the system.

### Capabilities

- **Offline transfer** — tokens are data; they move directly between wallets with no network connection.
- **Issuer-unlinkable privacy** — the mint cannot correlate a token it issued with the token later redeemed.
- **Bearer semantics** — no identity, no account, no key derivation per holder. Possession is ownership.
- **Divisibility** — fixed denominations (powers of two) allow change-making.
- **Fast local transfers** — no routing, no channel lookup, no liquidity management between holders.
- **Small, local mints** — a community can run a mint backed by Bitcoin, choosing trust locally.
- **Nostr-native forms** — nutzaps (NIP‑61) attach tokens to signed notes.

### Constraints

- **Mint solvency is a trust assumption.** Tokens are IOUs; if the mint fails or refuses redemption, they are worthless.
- **Double-spend control is centralized** at the mint, which tracks spent secrets.
- **Receiver must swap** tokens promptly after receiving to confirm they were not already spent.
- **Denomination management** is discrete rather than arbitrary-amount.

Implementation: Cashu (`cashubtc/cashu`). Related model: Fedimint, which replaces the single mint with a federation of guardians.

---

## 4. The blind-signature mechanism

The defining primitive. The mint signs a token **without seeing the token it signs**.

```
Mint:     secret key k, public key K = k·G

User:     random secret x
          Y = hash(x)
          blinds:  B = Y + r·G        (r = random blinding factor)
          sends B to mint

Mint:     signs:  C = k·B
          returns C

User:     unblinds:  C' = C - r·G = k·Y
```

The result `(x, C')` is a valid token: the mint can verify `C' = k·hash(x)`.

But at issuance the mint saw only `B`, never `Y` or `C'`. It therefore **cannot link the signature it produced to the token later redeemed**. Privacy holds against the issuer — something the channel model does not provide.

Lifecycle:

| Phase | Action |
|---|---|
| **Mint** | Pay Lightning → mint blind-signs tokens |
| **Swap** | Return tokens → mint invalidates and reissues fresh ones |
| **Melt** | Return tokens → mint pays a Lightning invoice and destroys them |

Swapping refreshes privacy and produces change.

---

## 5. Capability comparison

| Capability | Channel-based | Ecash |
|---|---|---|
| Instant transfer | Yes | Yes |
| Offline transfer | No | Yes |
| Multi-hop routing | Yes | Not needed |
| Privacy from counterparties | Strong | Strong |
| Privacy from the issuer/operator | Partial | Strong (blind signatures) |
| Trust model | Trust-minimized | Trust the mint |
| Custody | Self-custody | IOU from mint |
| Divisibility | Amount-based | Denomination-based |
| Double-spend prevention | Channel state | Mint's spent-secret database |
| Online requirement | Node online | Only mint interaction requires connectivity |
| Liquidity management | Required | Not applicable |
| Local/community operation | Possible | Especially natural |
| Failure mode | Channel breach, routing failure | Mint default or refusal |

---

## 6. Coexistence

These models are not mutually exclusive. A wallet service can support multiple backends behind one app-facing interface.

Alby Hub, for example, lists **LDK, LND, Phoenixd, Cashu, CLN, and Bark** as supported backends. An application speaking NIP‑47 does not need to know which one is active — the programmable layer abstracts it.

This means the model choice can be made at the infrastructure level without changing the application layer.

---

## 7. Nostr integration

Ecash has its own NIPs, and the event kinds are in the registry:

| Kind | Meaning | NIP |
|---|---|---|
| 17375 | Cashu wallet event | 60 |
| 7375 | Cashu wallet tokens | 60 |
| 9321 | Nutzap | 61 |
| 10019 | Nutzap mint recommendation | 61 |
| 38000 | Mint recommendation | 87 |
| 38172 | Cashu mint announcement | 87 |

A **nutzap** (NIP‑61) is ecash attached to a Nostr note as a tip. The recipient redeems it with a mint. Compared with a Lightning zap:

- private rather than public
- offline-capable
- requires no channel on the sender's side
- requires trust in a mint

So ecash is not a competing payment rail on Nostr — it is a **private, offline, bearer-data layer** on the same signed-event network.

---

## 8. Choosing a model

| Situation | Better fit |
|---|---|
| Need trust-minimized custody | Channel-based |
| Need offline transfer | Ecash |
| Need privacy from the operator | Ecash |
| Need routing across a network | Channel-based |
| Want a local community mint | Ecash |
| Need programmatic app access | Either — NWC abstracts the backend |
| Want no single trusted party | Federation (Fedimint) |

The practical answer for most applications is not to choose permanently: use the **programmable layer** (NIP‑47) so the backend can be swapped.

---

## 9. References

| Resource | URL |
|---|---|
| Cashu protocol | https://github.com/cashubtc/cashu |
| Cashu docs | https://docs.cashu.space |
| NIP‑60 (Cashu wallet) | https://github.com/nostr-protocol/nips/blob/master/60.md |
| NIP‑61 (Nutzaps) | https://github.com/nostr-protocol/nips/blob/master/61.md |
| NIP‑47 (NWC) | https://github.com/nostr-protocol/nips/blob/master/47.md |
| Fedimint | https://fedimint.org |
| Alby Hub (multi-backend reference) | https://github.com/getAlby/hub |
| Lightning BOLTs | https://github.com/lightning/bolts |
