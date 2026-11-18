# Nostr Wallet Connect (NWC) — Capabilities

A reference document for NIP-47, the Nostr Wallet Connect protocol.

NWC is an open protocol that lets an application control a Lightning wallet **remotely, over Nostr relays, without ever taking custody of the funds**. The wallet remains in the user's hands; the app holds a capability (a key) that the wallet has explicitly authorized.

---

## Contents

1. [What it is](#1-what-it-is)
2. [Capability summary](#2-capability-summary)
3. [Capabilities in detail](#3-capabilities-in-detail)
4. [RPC methods](#4-rpc-methods)
5. [Notifications](#5-notifications)
6. [Pairing and connection parameters](#6-pairing-and-connection-parameters)
7. [Wire format](#7-wire-format)
8. [Security model](#8-security-model)
9. [Limitations and trade-offs](#9-limitations-and-trade-offs)
10. [Comparison with OAuth and normal APIs](#10-comparison-with-oauth-and-normal-apis)
11. [Web2 parallels](#11-web2-parallels)
12. [References](#12-references)

---

## 1. What it is

Three roles participate:

| Role | Description |
|---|---|
| **Wallet service** | Holds the funds and the real wallet key. Authorizes app keys and executes requests. Example: Alby Hub. |
| **Client / app** | Holds a private key the wallet has authorized. Sends signed, encrypted requests. Never sees the seed. |
| **Relay** | Dumb transport. Stores and forwards encrypted events. Cannot read the contents or issue/validate tokens. |

There is no central server, no account registration, and no custody transfer. The relationship is: **"this app key is allowed to ask this wallet to do these things."**

---

## 2. Capability summary

| # | Capability | What it means |
|---|---|---|
| 1 | Remote control without custody | App requests payments and invoices; the seed and funds never leave the wallet |
| 2 | Capabilities instead of accounts | Pairing a key *is* registration — no client ID, no redirect URI allowlist, no signup |
| 3 | Per-app permission scopes | Each connection has its own allowed methods |
| 4 | Budgets and renewal periods | Spending limits per connection, with automatic reset |
| 5 | Expiry | Connections can self-destruct at a set time |
| 6 | Isolated sub-wallets | A connection can get its own balance and transaction list |
| 7 | Instant revocation | Removing an authorized key kills that connection everywhere |
| 8 | One wallet, many apps | A single wallet serves many independent clients, each with separate limits |
| 9 | Encrypted, permissionless transport | Any Nostr relay can carry the traffic; relays learn nothing about the contents |
| 10 | Composability with Nostr | Wallet requests live in the same signed-event network as notes, profiles, and zaps |
| 11 | Authentication by possession | A successful read-only call proves control of the paired key |
| 12 | Wallet-agnostic backends | The wallet service can abstract over LDK, LND, CLN, Phoenixd, Cashu, and more |

---

## 3. Capabilities in detail

### 3.1 Remote control without custody

The app can ask the wallet to:

- pay a BOLT11 invoice
- create an invoice
- check a balance
- look up invoices and list past transactions
- send keysend payments
- batch multiple payments

At no point does the app receive the seed phrase, the private key of the wallet, or the funds. The wallet executes the command against its own node or wallet backend and returns the result. This is the defining property: **the app is a requester, not an owner.**

### 3.2 Capabilities instead of accounts

Traditional integrations require registering with an identity or API provider: client IDs, secrets, redirect URI allowlists, approval queues. NWC requires none of that.

- The app generates a key pair (or receives one from the wallet).
- The wallet authorizes the public key.
- That's the whole registration.

Any wallet implementing NIP-47 works with any app implementing it. There is no gatekeeper and no central directory.

### 3.3 Per-app permission scopes

Each connection declares which methods it may call. A read-only dashboard can be limited to `get_info` and `get_balance`, making it incapable of spending. A point-of-sale might get `make_invoice` and `lookup_invoice` but not `pay_invoice`.

Permissions are enforced by the wallet service, not by the app. Even a compromised app cannot exceed the authority it was granted.

### 3.4 Budgets and renewal periods

A connection can carry a spending ceiling (`max_amount`, denominated in millisatoshis) and a renewal cadence (`budget_renewal`): `never`, `daily`, `weekly`, `monthly`, or `yearly`.

This makes it possible to hand an app a recurring allowance — for example, 50,000 sats per week — without giving it unlimited access to the wallet. The wallet enforces the budget, not the app.

### 3.5 Expiry

`expires_at` sets a Unix timestamp after which the connection no longer works. This is useful for temporary access: a one-day guest pass, a trial, a session-scoped credential.

Expiry makes a connection a **self-limiting capability** rather than a permanent grant.

### 3.6 Isolated sub-wallets

The `isolated` flag creates a connection with its own balance and its own transaction list. Funds allocated to that sub-wallet cannot be spent by other apps, and its activity is hidden from other connections.

This is the strongest form of containment: not just "you may only call these methods," but "you may only touch this pool of money."

### 3.7 Instant revocation

The wallet keeps a list of authorized public keys. Deleting one entry immediately invalidates that connection, everywhere, with no coordination with the app and no propagation delay through a third party.

Contrast with a password shared across services: revoking it requires changing it in each place. Here there is a single authority — the user's wallet.

### 3.8 One wallet, many apps

A user can connect a social client, a point-of-sale, a game, and a dashboard to the same wallet. Each holds a different key with different permissions, budgets, and expiry. The funds stay in one place, but the capabilities are compartmentalized.

This is a capability-based security model: authority is divided into narrow, independently revocable grants rather than one all-powerful login.

### 3.9 Encrypted, permissionless transport

Requests and responses are encrypted end-to-end between app and wallet. The relay sees:

- event kind (request or response)
- sender and recipient public keys
- timestamp

It does **not** see the method, parameters, amounts, invoices, or results. Relays are interchangeable commodity infrastructure — there is no single API endpoint to go down, throttle, or censor. The user can even run their own relay.

### 3.10 Composability with Nostr

NWC uses the same primitives as the rest of Nostr: signed events, relays, public keys. That means wallet operations can be linked to other Nostr constructs:

- A **zap** (NIP-57) attaches a Lightning payment to a signed note; NWC can be the mechanism that pays it.
- A **zap receipt** (kind 9735) is a public, verifiable event proving payment happened.
- A Nostr identity (npub) can be associated with wallet control, linking "who" to "paid."

The result is a stack where identity, content, and money share one transport and one identity layer.

### 3.11 Authentication by possession

NIP-47 has no `login` method, but its read-only `get_info` call can act as one:

1. An app proves it holds the authorized private key by signing a request.
2. The wallet answers only if the signature is valid and the key is authorized.
3. A genuine answer therefore proves possession of the capability.

This is a passwordless, self-sovereign login pattern. It proves **control of a wallet**, not a human identity — an important distinction. It is best paired with NIP-07 (Nostr identity signing) when a stable social identity is also needed.

### 3.12 Wallet-agnostic backends

A wallet service can abstract over many Lightning or Bitcoin backends. Alby Hub, for example, supports an embedded LDK node by default and can also connect to LND, Phoenixd, Core Lightning (CLN), Cashu, and Bark.

Apps speak only NIP-47; they do not care what node is underneath. This decouples application development from node operations.

---

## 4. RPC methods

Methods are carried in kind 23194 request events. The wallet replies with kind 23195.

| Method | Purpose |
|---|---|
| `get_info` | Wallet alias, network, pubkey, supported methods and notifications. Read-only; commonly used as an authentication probe. |
| `get_balance` | Current balance in millisatoshis. Read-only. |
| `pay_invoice` | Pay a BOLT11 invoice. Optionally include an amount for amountless invoices. |
| `pay_keysend` | Send a keysend payment to a pubkey without an invoice. |
| `make_invoice` | Create a new invoice with amount, description, and optional expiry. |
| `lookup_invoice` | Look up an invoice by payment hash or invoice string. |
| `list_transactions` | List incoming/outgoing transactions, optionally filtered by time range and type. |
| `multi_pay_invoice` | Pay several invoices in one request. |
| `multi_pay_keysend` | Send several keysend payments in one request. |

Method support is advertised by the wallet in `get_info`, and enforcement is per-connection. A client should check the advertised list rather than assume support.

Common error codes include `UNAUTHORIZED`, `RESTRICTED`, `INSUFFICIENT_BALANCE`, `INVALID_INVOICE`, `NOT_FOUND`, `PAYMENT_FAILED`, `RATE_LIMITED`, `NOT_IMPLEMENTED`, and `ERROR`. Support for specific codes varies by wallet implementation.

---

## 5. Notifications

In addition to request/response, a wallet can push unsolicited events to subscribed apps:

| Notification | Meaning |
|---|---|
| `payment_received` | An incoming payment settled |
| `payment_sent` | An outgoing payment settled |

An app subscribes to the notification types it requested during pairing. This lets a point-of-sale update instantly when a customer pays, without polling.

---

## 6. Pairing and connection parameters

### Connection URI

```
nostr+walletconnect://<wallet_pubkey>?relay=<relay_url>&secret=<client_secret_hex>&lud16=<lightning_address>
```

- `wallet_pubkey` — public key of the wallet service
- `relay` — Nostr relay used for transport (may be comma-separated)
- `secret` — the client's private key; a **bearer credential**
- `lud16` — Lightning address, if the wallet exposes one

### Authorization deep-link parameters

A client can request authorization without sending its secret through the URL. Alby Hub's `/apps/new` endpoint accepts:

| Parameter | Meaning |
|---|---|
| `name` | Display name of the requesting app |
| `pubkey` | Public key of the client secret to authorize |
| `return_to` | URL to redirect to after approval |
| `expires_at` | Connection expiry, Unix timestamp in seconds |
| `max_amount` | Maximum millisats per budget period |
| `budget_renewal` | `never`, `daily`, `weekly`, `monthly`, or `yearly` |
| `request_methods` | URL-encoded, space-separated allowed methods, e.g. `pay_invoice%20get_balance` |
| `notification_types` | URL-encoded, space-separated notifications, e.g. `payment_received%20payment_sent` |
| `isolated` | Create an isolated sub-wallet with its own balance and transaction list |

When `isolated=true`, custom methods, notification types, budgets, and expiry should not be combined with it.

After approval, the client receives the connection details (`lud16`, `relay`, `pubkey`) but retains its own secret — so the secret never appears in the authorization URL or server logs.

---

## 7. Wire format

| Kind | Meaning |
|---|---|
| **13194** | Wallet Info event |
| **23194** | Wallet Request (client → wallet) |
| **23195** | Wallet Response (wallet → client) |

Request event structure:

```
pubkey:   client public key C
kind:     23194
tags:     [["p", wallet_public_key]]
content:  encrypted request object
sig:      signature produced with the client private key c
```

Flow:

1. App encrypts the request to the wallet's public key and signs the event with its own private key.
2. Relay stores and forwards the event. It cannot read the content.
3. Wallet verifies the signature against `C`, checks authorization and permissions, then decrypts with its private key.
4. Wallet builds the result, encrypts it to `C`, signs with its own key, publishes kind 23195.
5. App verifies the response came from the wallet's public key, then decrypts and reads the result.

Three distinct cryptographic operations are involved:

| Operation | Where | Purpose |
|---|---|---|
| Signing | Every request and response | Proves sender identity and message integrity |
| Encryption | Content of both | Hides the payload from the relay |
| Authorization | Wallet's authorized-key list | Decides whether to answer at all |

Current implementations use NIP-04 encryption with per-connection key pairs; migration toward NIP-44 is in progress.

---

## 8. Security model

**What protects the user:**

- The wallet's real key and seed never leave the wallet service.
- Every request must be signed by an authorized key.
- Permissions, budgets, and expiry are enforced server-side by the wallet.
- Content is encrypted, so relays cannot read payment details.
- Revocation is immediate and unilateral.

**What the app must protect:**

- The connection secret is a **bearer credential**. Whoever holds it can act as that app. Never log it, never place it in a URL that gets recorded, and store it encrypted for the shortest practical duration.
- Validate that responses actually came from the expected wallet public key — not merely that *some* reply arrived.
- Request the narrowest method set needed. Use `get_info` alone for authentication; never request `pay_invoice` for a login flow.
- Treat a successful NWC call as proof of wallet control, not proof of a unique human. Add a small payment challenge for Sybil resistance if needed.

**Honest limitations of the security model:**

- IP addresses are visible to relays and peers, as with all Nostr traffic.
- The relay learns which public keys are communicating and when, even though it cannot read the content.
- Public channel gossip in Lightning can leak node and capacity metadata (unrelated to NWC itself but part of the surrounding system).

---

## 9. Limitations and trade-offs

| Limitation | Detail |
|---|---|
| Wallet adoption | Only users with an NWC-compatible wallet can use it; not a drop-in replacement for email/password yet. |
| It is a capability, not an identity | It proves "controls this wallet," not a name, email, or personhood. |
| Secret = identity | Losing the secret loses the capability; plan for rotation/recovery. |
| Relay availability | Depends on at least one reachable relay; mitigated by using multiple relays or self-hosting. |
| Implementation variance | Not every wallet supports every method or error code; check `get_info`. |
| Not fully anonymous | Confidential content, but metadata and IPs are still observable. |
| Encryption migration | NIP-04 is legacy; NIP-44 support varies. |

---

## 10. Comparison with OAuth and normal APIs

| | OAuth / OIDC | Normal API key | NWC |
|---|---|---|---|
| Credential | Token issued by provider | Server-issued key | Client-held private key |
| Who owns identity | The provider | The API operator | The user |
| Proof method | Present the token | Present the key | Sign a request |
| Registration | Client ID, redirect URIs | Account signup | Pair a public key |
| Transport | HTTPS redirect + token endpoint | HTTPS | Encrypted events over relays |
| Custody | N/A | N/A | Funds stay with user |
| Scoping | Scopes in token | Varies | Per-connection methods, budgets, expiry |
| Revocation | Provider-side | Provider-side | User deletes an authorized key |
| What it proves | "This is Alice" | "This key is valid" | "This app holds a key I authorized" |

In short: **OAuth delegates identity to a provider; NWC delegates a capability from the user's own wallet.**

---

## 11. Web2 parallels

NWC reproduces many patterns web2 developers already know — but moves the authority from the platform to the user. It gives you the ergonomics of a payments API without the custody, registration, or vendor lock-in.

### Familiar patterns

| Web2 concept | NWC equivalent | Key difference |
|---|---|---|
| OAuth "Login with X" | `get_info` proof of possession | No provider owns your identity; the wallet is the verifier |
| Fine-grained API keys (Stripe restricted keys, GitHub PATs) | Per-connection key with `request_methods` | Key is authorized by the user, not issued by a vendor |
| IAM role / policy | `request_methods`, `max_amount`, `budget_renewal`, `expires_at` | Policy lives in the user's wallet, not a cloud console |
| API quotas / spend caps | `max_amount` + `budget_renewal` | Enforced by the user's wallet, not the API vendor |
| JWT expiry / short-lived tokens | `expires_at` | Self-limiting capability; no refresh-token dance |
| Sub-accounts / tenant isolation (Stripe Connect, AWS orgs) | `isolated` sub-wallet | Isolated balance and transaction history per app |
| Webhooks | `payment_received` / `payment_sent` notifications | Signed events over relays, not HTTP POSTs to your endpoint |
| API key revocation | Delete the authorized pubkey in the wallet | Instant and unilateral — no support ticket |
| Developer console app registration | Pairing deep link with a consent screen | No pre-registration, no client ID, no allowlisted redirect URI |
| Payment processor API (Stripe, PayPal) | `pay_invoice`, `make_invoice` | Self-custodial — the "processor" never holds the money |
| Secret rotation | Generate a new client key, authorize it, delete the old one | Entirely under user control; no vendor dashboard |

### Web2-like properties it enables

- **Programmatic payments.** Apps can trigger and verify payments through a request/response interface, like calling a payments API.
- **Event-driven architecture.** Push notifications give webhook-like behavior without the app exposing an HTTP endpoint.
- **Least-privilege integration.** Scoped credentials mean a read-only dashboard literally cannot spend.
- **Multi-tenancy.** One wallet serves many apps, each with an isolated balance and its own limits.
- **Passwordless onboarding.** One approval click replaces a signup form and email verification.
- **Instant offboarding.** Revoking one key disconnects one app without affecting any other.
- **Budget governance.** Spending caps and renewal periods behave like corporate card limits.
- **Vendor neutrality.** No lock-in to a single identity or payments provider; any NIP-47 wallet works.

### Web2 properties it deliberately does not provide

| Missing property | Why |
|---|---|
| Stable identity (name, email, profile) | NWC proves wallet control, not personhood — pair with NIP-07 or another identity layer |
| Account recovery | The capability *is* the secret; losing it loses access until re-authorized |
| Reversible payments / chargebacks | Lightning payments are final |
| Anonymity | Metadata and IP addresses are visible to relays |
| Customer support / SLA | No provider exists to call |
| Universal acceptance | Wallet adoption is still limited |

### The one-sentence version

**NWC gives web2-style programmatic payments, scoped API keys, webhooks, and instant revocation — but with the wallet, not the platform, holding all the authority.**

## 12. References

| Resource | URL |
|---|---|
| NIP-47 specification | https://github.com/nostr-protocol/nips/blob/master/47.md |
| NWC overview | https://nwc.dev |
| NWC documentation | https://docs.nwc.dev |
| Alby JS SDK | https://github.com/getAlby/js-sdk |
| Alby Hub (reference wallet service) | https://github.com/getAlby/hub |
| rust-nostr (Rust SDK, `nwc` crate) | https://github.com/rust-nostr/nostr |
| nostr-tools (low-level TS, `nip47.ts`) | https://github.com/nbd-wtf/nostr-tools |
| Lightning BOLT specifications | https://github.com/lightning/bolts |
| Nostr NIP index | https://github.com/nostr-protocol/nips |
