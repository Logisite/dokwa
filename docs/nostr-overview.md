# Nostr — Overview

Nostr (**No**tes **a**nd **O**ther **S**tuff **T**ransmitted by **R**elays) is an open protocol for social applications without a central platform.

The shortest useful description:

> **A shared, public, append-only database where every write is cryptographically signed, reads use one standard query language, and the servers holding the data are interchangeable.**

Apps are views into that database. There is no "Nostr app" — there are many independent clients talking to many independent relays.

---

## Philosophy

- **Tiny, stable core.** NIP‑01 is a few pages. A relay can be written in a few hundred lines. The base layer rarely changes, so you can build on it.
- **Dumb pipes, smart edges.** Relays store and forward. Feeds, ranking, and rules live in clients, which users choose and can swap.
- **Identity is a key pair, not an account.** No email, phone number, or signup. Your private key *is* you, and it travels with you.
- **Don't trust the server.** Every event is signed and independently verifiable. A relay can't forge or alter your content.
- **Everything extra is optional.** Features live in separate, backwards-compatible specs rather than bloating the core.

---

## Core mechanics

### Keys

Two mathematically paired keys, using the same curve as Bitcoin (secp256k1):

- **Private key** (`nsec`) — signs events. Never share it.
- **Public key** (`npub`) — your identity. Safe to publish.

### Events

Everything is a signed JSON event:

```json
{
  "id": "<sha256 of serialized event>",
  "pubkey": "<author public key>",
  "created_at": 1763472000,
  "kind": 1,
  "tags": [["e", "<parent event>"], ["p", "<mentioned pubkey>"]],
  "content": "Salaam from Dakar",
  "sig": "<BIP-340 Schnorr signature>"
}
```

Three fields do most of the work:

| Field | Role | Examples |
|---|---|---|
| `kind` | What kind of thing is this? | `0` profile, `1` note, `3` follows, `7` reaction, `9735` zap receipt |
| `tags` | What is it related to? | `["e","<id>"]` reply target, `["p","<pk>"]` mention, `["t","bitcoin"]` hashtag |
| `content` | The payload | Text, ciphertext, or structured data |

New apps are usually just new combinations of kinds and tags — not new protocol machinery.

### Relays

Relays are WebSocket servers. The entire wire protocol is a handful of messages:

| Direction | Message | Purpose |
|---|---|---|
| Client → relay | `EVENT` | Publish an event |
| Client → relay | `REQ` | Subscribe with a filter |
| Client → relay | `CLOSE` | End a subscription |
| Relay → client | `EOSE` | "End of stored events" |
| Relay → client | `OK` | Publish acknowledgement |

A filter looks like:

```json
{ "kinds": [1], "authors": ["<pubkey>"], "since": 1763000000, "limit": 50 }
```

Anyone can run a relay. Clients typically connect to several at once and publish the same event to each. If one censors you, the others still have the data.

---

## NIPs

**NIP = Nostr Implementation Possibility.** Each NIP is a short, standalone spec for one optional feature. There are roughly ninety of them, maintained in `nostr-protocol/nips`.

From the repository README:

> *"NIPs listed here are not a protocol checklist. Nothing forces any software to implement any NIP. Each app picks the subset relevant to its use case."*

They are closer to RFCs than to fragments of one program. The set is deliberately broad:

| NIP | Adds |
|---|---|
| 01 | Core protocol — the only required one |
| 07 | `window.nostr` browser signer |
| 17 / 44 | Private messages / versioned encryption |
| 19 | `npub`, `nsec`, `note` bech32 identifiers |
| 46 | Remote signing ("bunker") |
| 47 | Nostr Wallet Connect |
| 57 | Lightning zaps |
| 65 | Relay lists |
| A0 | Voice messages |
| C0 | Code snippets |
| F4 | Podcasts |

The repo also marks specs as **unrecommended** when better ones supersede them (NIP‑04 → NIP‑17, NIP‑28 → NIP‑29). It is a living standard.

Acceptance criteria are social rather than bureaucratic: a NIP should be implemented in at least two clients and one relay, be optional and backwards-compatible, and there should be only one way to do each thing. All NIPs are public domain.

---

## Decentralization, precisely

Nostr is **not** P2P in the BitTorrent sense — clients talk to relays, which are servers. The accurate term is **permissionless federation** (like email).

It is still decentralized because:

- There is no mandatory relay; anyone can run one.
- Clients publish to multiple relays, so no single one can censor you.
- Your identity and signed data are not owned by any relay.
- Relays cannot forge or modify your events.
- Relays can sync with each other (strfry uses *negentropy* reconciliation).

"Peer-to-peer" here means **no central point of control**, not literal device-to-device.

---

## Privacy and security

**Strong properties:**
- Signatures prove authorship and detect tampering.
- Content is portable and independently verifiable.
- No platform owns your identity or history.

**Limits:**
- Your IP is visible to relays you connect to.
- Relays learn which public keys communicate and when.
- Public messages are public and permanent.
- Private messages rely on NIP‑17/NIP‑44; older NIP‑04 is deprecated.

Censorship-resistant, **not anonymous by default**.

---

## Ecosystem

| Layer | Examples |
|---|---|
| Clients | Damus (iOS/macOS), Amethyst (Android), Snort, Nostur, nostrudel |
| Relays | strfry (C++/LMDB), nostr-rs-relay (Rust/SQLite) |
| Libraries | `@nostr/tools` (TS, on JSR), NDK (high-level TS), rust-nostr (Rust SDK) |
| Bitcoin bridge | Alby Hub (NIP‑47 wallet), zaps (NIP‑57) |

The reference library keeps one small implementation file per NIP (`nip47.ts`, `nip57.ts`, etc.) — usually the fastest way to understand a spec in code.

---

## Compared to web2

| Web2 | Nostr |
|---|---|
| Platform owns identity | You own the key |
| Platform owns data | You own signed events |
| Server enforces rules | Client enforces rules |
| Many endpoints, one provider | Three verbs, many providers |
| Trust the server | Verify the signature |

It is essentially a web API where the server is a commodity and the user is the authority.

---

## References

| Resource | URL |
|---|---|
| NIP index | https://github.com/nostr-protocol/nips |
| NIP‑01 core protocol | https://github.com/nostr-protocol/nips/blob/master/01.md |
| Event kind registry | https://github.com/nostr-protocol/registry-of-kinds |
| General site | https://nostr.com |
| Reference TS library | https://github.com/nbd-wtf/nostr-tools |
| NDK | https://github.com/nostr-dev-kit/ndk |
| Rust SDK | https://github.com/rust-nostr/nostr |
| strfry relay | https://github.com/hoytech/strfry |
| nostr-rs-relay | https://github.com/scsibug/nostr-rs-relay |
