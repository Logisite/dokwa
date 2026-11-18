# Bitcoin Core and Lightning — Capabilities

The event brief names both in one line: *"A contribution to Bitcoin core or lightning."* They are the two Bitcoin-side technologies, and they are easy to reduce to slogans — "the ledger" and "private payments." Both do considerably more.

---

## Contents

1. [Bitcoin Core](#1-bitcoin-core)
2. [Lightning](#2-lightning)
3. [How they complement each other](#3-how-they-complement-each-other)
4. [Capability map for the brief](#4-capability-map-for-the-brief)
5. [References](#5-references)

---

## 1. Bitcoin Core

### What it is

Bitcoin Core is the reference **full node** implementation of Bitcoin — the software that independently downloads, validates, stores, and relays the entire blockchain. It is the most widely used implementation and the de facto definition of the protocol's consensus rules.

It is not principally a consumer wallet app. It is the **verification and network layer** that makes Bitcoin trustless.

### Capabilities

**1. Independent verification**
The defining capability. A full node checks every block and every transaction against all consensus rules — signatures, coin supply, script validity, block difficulty, locktimes, and more. You do not ask anyone whether a payment is real; your own node tells you. This is the literal meaning of "don't trust, verify."

**2. Consensus enforcement**
Nodes collectively define Bitcoin. A block that violates the rules is rejected and not relayed. No central authority decides what is valid — the code does, and thousands of independent nodes run it.

**3. Complete historical record**
A full node stores every block since genesis. That enables:
- auditing any historical transaction
- verifying balances from first principles
- serving historical data to lightweight clients (Electrum-style servers)
- research, analytics, and indexers built on top

**4. Pruning for constrained devices**
With pruning enabled, a node validates everything but discards old block data after verification, retaining only the current UTXO set. Full validation on limited disk — relevant for low-resource environments.

**5. P2P network participation**
Nodes discover peers, relay transactions and blocks, and propagate new information across the network. Running a node strengthens the network's decentralization and resilience; it also avoids leaking your wallet queries to a third-party server.

**6. Mempool management and fee estimation**
The node maintains the pool of unconfirmed transactions and estimates appropriate fee rates. Wallets and applications use this to construct transactions that confirm reliably.

**7. Built-in wallet and key management**
Bitcoin Core includes a wallet supporting HD keys, descriptors, multisig, watch-only addresses, coin control, and PSBTs (Partially Signed Bitcoin Transactions) — a standard format for composing transactions across multiple tools.

**8. RPC and API surface**
A JSON-RPC interface exposes nearly all functionality: querying blocks and transactions, constructing and signing transactions, managing addresses, controlling the network, and more. This makes the node a programmable backend for applications.

**9. Mining support**
Through `getblocktemplate`, Core can supply block templates to miners. It does not mine by default, but it is the standard backend against which mining software operates.

**10. Test infrastructure for development**
Core ships `regtest` (private local chain), `signet` (public test network with controlled mining), and `testnet`, plus a Python functional test framework. This lets developers build and test without real money — directly useful for local demos and prototypes.

**11. Reproducible, open-source, FOSS**
Deterministic builds, a public review process, and a permissively licensed codebase. This is the "FOSS bitcoin ecosystem" the brief refers to. Contributions are possible at the level of consensus code, policy, docs, tests, and tooling.

**12. Network-privacy options**
Support for Tor, onion services, and proxy configuration reduces IP-level leakage when running a node.

### What it does not provide

- Instant payments — base-layer confirmation takes roughly ten minutes.
- Cheap micropayments — on-chain fees make tiny payments impractical.
- Privacy by default — the blockchain is transparent and permanent.
- A polished consumer UX — it is a node and backend first.

These are exactly the gaps Lightning was created to fill.

---

## 2. Lightning

### What it is

Lightning is a **Layer 2 payment protocol on top of Bitcoin**. Two parties open a payment channel with one on-chain transaction, then exchange signed balance updates off-chain, settling only when the channel closes or a dispute occurs.

The "private payments" framing is real but narrow. Here is the full capability set.

### Capabilities

**1. Instant payment finality**
Payments settle in milliseconds because they are merely updates to a channel balance — no block confirmation required. Merchant checkout becomes comparable to a card terminal rather than a ten-minute wait.

**2. Micropayments**
Payments of a few satoshis are economically viable because fees are a tiny fraction of a cent. This unlocks use cases impossible on-chain: per-article payments, pay-per-use APIs, streaming payments, tipping.

**3. Extremely low fees**
Off-chain payments avoid per-transaction blockchain fees. Routing nodes charge a small proportional fee, making high-volume, low-value flows practical.

**4. High throughput**
Capacity is limited by channel liquidity and network capacity, not by Bitcoin's block size. In principle the network can scale to a very large number of payments without touching the base chain.

**5. Multi-hop routing**
You do not need a direct channel with the recipient. HTLCs (Hashed Timelock Contracts) make routing atomic across a path of intermediaries: either the whole route succeeds or it fails, and no intermediate node can steal the funds.

**6. Programmable payment instruments**
- **BOLT11 invoices** — the standard payment request, with amount, description, and expiry.
- **Keysend** — push payments to a pubkey with no invoice required.
- **BOLT12 offers** — reusable, reusable-and-refundable payment offers, and recurring payments/subscriptions.
- **LNURL / Lightning Address** — human-readable payment identifiers like `user@example.com`, removing the need to share raw invoices.

**7. Payment proofs and receipts**
Each successful payment produces a preimage that acts as a cryptographic proof of payment. This enables escrow-like patterns, atomic exchanges, and publicly verifiable zap receipts when combined with Nostr.

**8. Off-chain confidentiality**
Individual payments do not appear on the public blockchain. Only channel open/close is visible. Onion routing means each hop in a route knows only its predecessor and successor, not the full path or final destination.

**9. Multi-path payments (MPP)**
A single payment can be split across several channels and routes, improving success rates and enabling larger payments than any single channel could carry.

**10. Self-custody and trust minimization**
Funds remain under the control of channel participants. The on-chain 2-of-2 construction plus revocation mechanisms mean a counterparty cannot steal by broadcasting an old state — provided the chain is monitored.

**11. Watchtowers and breach protection**
Third-party watchtowers can monitor the blockchain on your behalf and punish a cheating counterparty, allowing users to be offline without giving up security.

**12. Channel lifecycle and liquidity management**
Opening, rebalancing, and closing channels; managing inbound and outbound liquidity; just-in-time channel provision via LSPs. This is a distinct operational capability and a real engineering challenge.

**13. Composability with applications**
Lightning is designed to be called by software. Through NWC (NIP-47), any app can request invoices and payments against a user's wallet without custody. Through NIP-57, a payment can be attached to a Nostr note as a zap. This is the bridge that makes a unified Bitcoin + Nostr + AI application possible.

**14. Interoperable implementations**
The BOLT specifications allow independent node implementations — LDK, LND, Core Lightning, Eclair, and others — to interoperate on one network. No single client or vendor controls it.

### What it does not provide

- Anonymity — metadata and IP addresses are observable; amounts can sometimes be correlated across a route.
- Free operation — channel opening/closing requires on-chain fees, and inbound liquidity is a real constraint.
- Offline receiving without infrastructure — you need a node, a custodial service, or an LSP.
- A user identity layer — that is Nostr's role, not Lightning's.

---

## 3. How they complement each other

| Dimension | Bitcoin Core | Lightning |
|---|---|---|
| Role | Settlement and verification layer | Payment layer |
| Speed | ~10 minutes per block | Milliseconds |
| Cost | On-chain fee per transaction | Near-zero per payment |
| Data visibility | Fully public and permanent | Off-chain, confidential |
| Throughput | ~7 transactions/second | Very high |
| Trust model | Verify everything yourself | Trust-minimized with monitoring |
| Best for | Large settlements, auditing, finality | Everyday payments, micropayments, apps |
| Failure mode | Slow and expensive | Needs liquidity and liveness |

Lightning does not replace Bitcoin — it **inherits Bitcoin's settlement guarantee** and uses it only as a court of last resort. Bitcoin Core is the courtroom; Lightning is the private contract.

---

## 4. Capability map for the brief

The brief's criteria map onto capabilities like this:

| Brief criterion | Relevant capability |
|---|---|
| Usefulness & local impact | Instant, cheap payments for local merchants; remittances; micropayments |
| Security by design | Core's verification, Lightning's HTLCs and revocation, proven libraries, no custody |
| Working MVP | `regtest`/`signet` for deterministic demos; NWC for wallet integration without running a node |
| FOSS contribution | Core is open source; Lightning implementations (LDK, LND, CLN) are too |
| Bitcoin/Lightning wallet implementation | Built-in wallet + RPC; NWC for app-level wallet control |

---

## 5. References

| Resource | URL |
|---|---|
| Bitcoin Core | https://github.com/bitcoin/bitcoin |
| Bitcoin developer docs | https://developer.bitcoin.org |
| Lightning specifications (BOLTs) | https://github.com/lightning/bolts |
| LDK | https://github.com/lightningdevkit/rust-lightning |
| LND | https://github.com/lightningnetwork/lnd |
| Core Lightning | https://github.com/ElementsProject/lightning |
| NWC / NIP-47 | https://github.com/nostr-protocol/nips/blob/master/47.md |
