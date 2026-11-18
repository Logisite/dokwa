# Wallet as Programmable Infrastructure — Feeding Nostr

Most descriptions of a wallet stop at "it holds money and sends payments." That is the least interesting thing about it.

A wallet is better understood as a **key-management and authorization engine that exposes a programmable interface**. Applications call that interface, and the results become signed events on Nostr. The wallet is the authority; Nostr is the transport and the public record.

---

## Contents

1. [Beyond payments](#1-beyond-payments)
2. [Roles of the wallet](#2-roles-of-the-wallet)
3. [The programmable layer](#3-the-programmable-layer)
4. [How it feeds Nostr](#4-how-it-feeds-nostr)
5. [Capability summary](#5-capability-summary)
6. [References](#6-references)

---

## 1. Beyond payments

The familiar picture — an app with a balance and a send button — captures one narrow use. It misses what the wallet actually *is* in a protocol architecture:

- a **key store** that holds authority
- an **authorization engine** that decides what apps may do
- a **signer** that produces verifiable statements
- a **state machine** whose transitions are observable as events

Once you see it this way, the wallet stops being a destination and becomes **infrastructure that other software builds on**.

---

## 2. Roles of the wallet

### 2.1 Identity provider

The key pair held by the wallet *is* an identity. There is no separate account, username, or registration step. A public key identifies the wallet; a private key proves control of it.

Because a wallet can authorize many distinct app keys, one wallet can project **many scoped identities** — each app sees a different key, with a different range of authority, without learning the others exist.

### 2.2 Key management

The wallet owns the lifecycle of keys:

- generation from a seed
- derivation of child keys
- encryption at rest
- rotation and replacement
- recovery and backup

Applications never handle the seed. They receive a narrow capability — a key authorized for a specific purpose — rather than the root of trust.

### 2.3 Authorization engine

The wallet maintains a list of authorized keys and the permissions attached to each. It decides:

- which operations a key may request
- whether a request is within that key's grant
- when a grant is no longer valid
- what happens when a grant is withdrawn

This is a **policy engine**. Authorization lives in the wallet, not in the apps. Revoking a key in the wallet immediately invalidates it everywhere, with no coordination with any app.

### 2.4 State and record-keeping

The wallet maintains authoritative state — balances, transaction records, invoice metadata, timestamps, labels. Even stripped of the payment framing, this is a **ledger**: a structured history of what happened, who requested it, and when.

That ledger is valuable as data. It can be queried, exported, audited, and referenced by other events.

### 2.5 Privacy boundary

Separate keys and isolated sub-wallets create separation between contexts. One app's activity need not be visible to another. The wallet is the boundary that enforces this separation — it decides which context each request belongs to and what state is exposed to it.

### 2.6 Network interface

The wallet connects to the underlying network and monitors it. It maintains channels, watches for state changes, and keeps the local view consistent with the network. Applications do not need to do any of this; they talk to the wallet.

### 2.7 Trust anchor

The wallet verifies signatures and enforces rules locally. Apps must trust it, but it does not have to trust them. Every request arriving from an app is checked against the wallet's own policy before anything happens.

---

## 3. The programmable layer

The programmable layer is what turns the wallet from a user-facing application into a **service that other software can call**.

### 3.1 Wallet as a permissioned API server

NIP‑47 (Nostr Wallet Connect) defines a request/response interface:

- The wallet publishes its public key and the methods it supports.
- An app is authorized under a specific key.
- The app sends signed, encrypted requests.
- The wallet verifies, authorizes, executes, and replies.

This is an API server in every meaningful sense — endpoints, authentication, authorization, responses, errors — except that the transport is Nostr events rather than HTTP, and the credentials are cryptographic keys rather than tokens issued by a vendor.

### 3.2 Methods as capabilities

Each method is a capability the wallet may grant or withhold. Broadly:

| Category | Nature |
|---|---|
| Information methods | Read identity, network, and supported capabilities |
| State queries | Read balances, history, and status |
| State-changing methods | Create records, initiate operations |
| Batch methods | Perform several operations atomically |
| Notification subscriptions | Receive event-driven updates |

A wallet advertises which methods it supports, and each app connection is granted a subset. An app cannot call what it was not granted — the wallet enforces this, not the app.

### 3.3 Event-driven interface

Beyond request/response, the wallet can push notifications as events. An app subscribes to the types it cares about and receives updates without polling or exposing an HTTP callback endpoint.

This makes the wallet an **event source** — a component that emits signed state changes into the network.

### 3.4 Why this layer matters

Without it, every app would have to implement its own key management, node connection, state tracking, and authorization. With it, those concerns are centralized in one user-controlled component and exposed through one standard interface.

The programmable layer is what allows a wallet to serve many unrelated applications without any of them owning the underlying authority.

---

## 4. How it feeds Nostr

Every interaction in this architecture is a signed event on a Nostr relay. The programmable layer and the Nostr network are the same plumbing viewed from two sides.

### 4.1 Event kinds

| Kind | Meaning | Direction |
|---|---|---|
| **13194** | Wallet information — identity, network, supported methods | Wallet → network |
| **23194** | Wallet request — signed by the app key, encrypted to the wallet | App → wallet |
| **23195** | Wallet response — signed by the wallet, encrypted to the app key | Wallet → app |

Notification events carry state changes to subscribed apps. Public-facing events — such as verifiable receipts — are signed by the wallet or an associated service and become part of the public Nostr graph.

### 4.2 The flow

```
App                     Relay                     Wallet
 |                        |                          |
 | -- 23194, signed c ----> --- forward -----------> |
 |                        |    verify sig + policy    |
 |                        | <--- forward ------------ |
 | <-- 23195, signed W ---                           |
 |                        |                          |
 | <-- notification events (subscribed) -------------|
```

The relay sees public keys, event kinds, and timing. Request and response contents are encrypted. The relay cannot read them, forge them, or issue the authority behind them.

### 4.3 What Nostr gains

| Nostr property | What the wallet contributes |
|---|---|
| Signed events | A signing authority that apps can invoke without holding root keys |
| Identity | A key-backed identity that can be bound to wallet control |
| Verifiability | Wallet-generated events can be independently verified |
| Composability | Wallet events live alongside notes, profiles, and other kinds in the same network |
| Permissionless transport | No central API endpoint; any relay can carry the traffic |

The wallet becomes a **source of verifiable, signed state** inside the Nostr network. Apps consume that state just as they consume any other events.

### 4.4 Public and private split

- **Private:** request and response events — encrypted to the two participating keys; only the app and wallet can read them.
- **Public:** selected events the wallet or app chooses to publish — receipts, attestations, status announcements — which become part of the shared Nostr graph.

The architecture therefore supports both confidential interaction and public, verifiable disclosure using the same primitives. What is public is a choice, not a property of the transport.

### 4.5 The resulting pattern

```
Wallet (authority + keys + policy)
        |
        | signed, encrypted events over relays
        v
Nostr network (transport + public record)
        |
        | consumed by
        v
Apps (clients, interfaces, agents) — no custody, no key management
```

Apps do not connect to the wallet directly and do not hold its authority. They connect to Nostr, and the wallet is another participant in that network. That is the programmable layer feeding Nostr: **authority stays in the wallet, while capability travels as signed events.**

---

## 5. Capability summary

| Capability | Description |
|---|---|
| Identity provider | Key pair serves as identity; multiple scoped identities per wallet |
| Key management | Seed, derivation, rotation, encryption, recovery |
| Authorization engine | Per-key permissions, revocation, policy enforcement |
| State and records | Ledger of balances, history, and metadata as queryable data |
| Privacy boundary | Isolation between apps and contexts |
| Network interface | Connection and monitoring delegated to the wallet |
| Trust anchor | Local signature verification and rule enforcement |
| Permissioned API | NIP‑47 request/response interface exposed over Nostr |
| Event-driven updates | Push notifications as signed events |
| Nostr event source | Wallet-generated events enter the shared signed-event graph |
| Public/private control | Confidential interaction plus optional public disclosure |

---

## 6. References

| Resource | URL |
|---|---|
| NIP‑47 specification | https://github.com/nostr-protocol/nips/blob/master/47.md |
| Nostr NIP index | https://github.com/nostr-protocol/nips |
| Alby Hub (reference wallet service) | https://github.com/getAlby/hub |
| NWC documentation | https://docs.nwc.dev |
| nostr-tools (`nip47.ts`) | https://github.com/nbd-wtf/nostr-tools |
| rust-nostr | https://github.com/rust-nostr/nostr |
