# dokwa — tech stack

Companion to `dokwa-spec.md`. The spec says what the product is; this says what it is built with.

**No version numbers appear in this document on purpose.** Every dependency is recorded as an install command; the resolved versions live in `pnpm-lock.yaml`. A command stays correct when a package moves; a hand-written version string silently rots.

This supersedes the earlier daemon-based draft. The architecture changed: **there are no servers.**

---

## 1. The shape

Everything runs in the browser. The site is static files; the money system is wasm in the tab.

```
┌─ till tab (venue phone) ──────────────────────────┐
│  mint: BDHKE signing + proof ledger (IndexedDB)   │
│  BDK wasm: on-chain wallet, Esplora for chain     │
│  LDK wasm: Lightning node            [Level 1]    │
│  RTCDataChannel: peers, BOLT8 bytes  [Level 1]    │
└───────────────────────────────────────────────────┘
                    │ QR (offline) │ data channel (offline)
┌─ wallet tab (patron phone) ───────────────────────┐
│  cashu-ts wallet → the till, over RequestFn       │
│  BDK wasm: optional on-chain receive              │
│  LDK wasm: peer node                 [Level 1]    │
└───────────────────────────────────────────────────┘
                    │ when signal exists
              public relays (record), Esplora (chain)
```

| Piece | Where | Account or card |
|---|---|---|
| App | Vercel | no |
| Mint | the till tab | no |
| Lightning | LDK wasm in the till tab | no |
| On-chain | BDK wasm + Esplora | no |
| Relays | public | no |
| Faucet sats | signet faucet | no |

Nothing is hosted by us, and nothing needs a machine left on.

## 2. What this removed

Gone from the previous draft, because the architecture made them unnecessary:

Nutshell, LND, Alby Hub, Caddy, Cloudflare/DuckDNS tunnels, Oracle and GCP instances, Render, the keep-warm Worker cron, Postgres, and the mint's `MINT_MNEMONIC` backup problem.

The trade is explicit and recorded in §14: the product now depends on beta bindings and browser persistence instead of a Linux daemon.

---

## 3. Repository layout

```
dokwa/
├── pnpm-workspace.yaml
├── apps/
│   └── web/                 # the PWA; wallet mode + till mode
├── packages/
│   ├── mint-core/           # in-tab mint: keysets, BDHKE, ledger, NUT-04/05/30
│   ├── wallet-core/         # proofs, receipts, outbox, reconciliation
│   └── protocol/            # events, capabilities, relay-over-any-pipe
└── docs/
```

`mint-core` and `wallet-core` are separate packages because both must be testable in Node under vitest with `fake-indexeddb`, with no React and no browser.

---

## 4. Install

### 4.1 Workspace

```bash
corepack enable
corepack use pnpm@latest
pnpm init
```

`corepack use` writes `packageManager`, so every machine and every CI run uses the same pnpm without anyone typing a version.

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

### 4.2 App scaffold

```bash
pnpm create vite apps/web --template react-ts
```

Then, from `apps/web`:

```bash
pnpm add react-router
pnpm add @tanstack/react-query zustand
pnpm add react-hook-form zod

pnpm add dexie dexie-react-hooks
pnpm add @tanstack/react-virtual

pnpm add @cashu/cashu-ts
pnpm add nostr-tools

pnpm add @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex
pnpm add uqr @ngraveio/bc-ur fflate
pnpm add barcode-detector zxing-wasm

pnpm add @noble/curves @noble/hashes
pnpm add @bitcoindevkit/bdk-wallet-web
pnpm add lightningdevkit
```

Dev:

```bash
pnpm add -D typescript vite @vitejs/plugin-react vite-plugin-pwa vite-plugin-wasm
pnpm add -D @types/react @types/react-dom
pnpm add -D @astryxdesign/build @astryxdesign/cli
pnpm add -D vitest jsdom @testing-library/react @testing-library/user-event
pnpm add -D fake-indexeddb
pnpm add -D eslint typescript-eslint prettier
```

Optional, only when external wallets are wired in:

```bash
pnpm add @getalby/sdk @getalby/bitcoin-connect-react
```

`@stylexjs/stylex` is a **peer** of `@astryxdesign/core`; leaving it out fails resolution rather than degrading quietly.

### 4.3 Headless packages

```bash
pnpm --filter ./packages/mint-core add @noble/curves @noble/hashes
pnpm --filter ./packages/mint-core add -D vitest fake-indexeddb

pnpm --filter ./packages/wallet-core add @cashu/cashu-ts nostr-tools dexie @noble/hashes
pnpm --filter ./packages/wallet-core add -D vitest fake-indexeddb

pnpm --filter ./packages/protocol add nostr-tools
```

### 4.4 Astryx setup

```bash
pnpm dlx @astryxdesign/cli --help
pnpm dlx @astryxdesign/cli init
```

The CLI scaffolds the StyleX configuration and a theme. `@astryxdesign/build` provides the Vite integration; if the StyleX transform needs explicit wiring it goes through `@vitejs/plugin-react`'s babel options with `@stylexjs/babel-plugin`.

StyleX compiles to plain CSS, so the service worker caches CSS and nothing runs as runtime CSS-in-JS.

---

## 5. Two modes, one bundle

| | wallet mode | till mode |
|---|---|---|
| for | patrons, judges | the venue |
| loads | cashu-ts, QR, Dexie, relays | + `mint-core` + BDK + **LDK** |
| wasm | zxing (~1 MB) | + 14.5 MB LDK + BDK |
| identity | patron key | venue key + mint keyset + NUT-20 key |
| storage | `dokwa:wallet:<id>` | `dokwa:till` |

Mode is a setting on first run, not a build target. LDK and BDK are **dynamic imports** — a patron never downloads them.

Storage is **role-scoped, not origin-scoped** (§12.3). That is what lets a till and a wallet coexist on one origin, which is how a judge tests alone: one tab in till mode, one in wallet mode, the entire money system on one machine with no network.

---

## 6. Level 0 — the mint in the tab

### 6.1 The cryptography is small

NUT-00, verbatim:

```
Y = PublicKey('02' || SHA256(msg_hash || counter))
msg_hash = SHA256("Secp256k1_HashToCurve_Cashu_" || x)
counter: uint32 little-endian, incremented until the point is on the curve

blind:    B_ = Y + rG
sign:     C_ = kB_
unblind:  C  = C_ − rK
verify:   k · hash_to_curve(x) == C
```

Roughly sixty lines with `@noble/curves`. This is the part that looks hard and isn't.

### 6.2 The bookkeeping is the work

| Piece | Requirement |
|---|---|
| Keysets | derivation per NUT-02, keyset IDs, rotation, active/inactive |
| Proof ledger | every spent secret recorded, atomically, before a response is returned |
| Quotes | NUT-04 mint, NUT-05 melt, **NUT-30 onchain**, expiry, pending states |
| NUT-20 | quotes bound to a pubkey; the wallet keeps that key |
| Endpoint surface | whatever cashu-ts calls through `RequestFn` |

### 6.3 The keystone: cashu-ts takes a transport

```ts
new Mint(mintUrl, { customRequest: myRequestFn })
```

`customRequest` exists precisely for this. The standard wallet library runs against a mint in the same tab with **no HTTP and no fork**: `RequestFn` routes to the local mint object. Patron and till run identical wallet code; only the transport differs.

### 6.4 The backing is a standard, not an invention

`NUT-30: Payment Method: Onchain` — optional, depends on NUT-04, 05, 20. Mint quotes carry an on-chain address; melt quotes pay on-chain. cashu-ts implements the client side (`MeltOnchainBuilder`), marked experimental.

So "ecash backed by on-chain sats" is a specified payment method with a reference client.

### 6.5 The night, in order

1. **Backing.** Sats arrive on-chain — faucet for the demonstration, or the venue's own. BDK sees the deposit through Esplora.
2. **Door.** A patron hands over cash, or is given a starting balance. The till settles a mint quote (on-chain when a real deposit backs it, manual for cash) and hands back tokens by QR.
3. **Circulation.** Tokens move phone to phone by QR. No network, no till, no relays.
4. **Exit.** The patron melts: NUT-30 pays an on-chain address — their own BDK wallet, or Sparrow for the proof.
5. **Record.** Receipts and grants queue in the outbox; the first device with signal publishes them to relays.

### 6.6 What "the till is the mint" means

The double-spend ledger lives in the venue's tab. That is correct for a room: the till *is* the authority on its own tokens, the same way a cash box is. It also means tokens are worthless while the till is gone — which is why the till's IndexedDB needs the backup and export rules in §8.

**Interop caveat, recorded:** tokens carry a mint URL string, and there is no HTTP endpoint behind it. A third-party Cashu wallet cannot redeem them. Interop with standard wallets requires the till behind a real URL — a server — which is deliberately out of scope for now.

---

## 7. Level 1 — Lightning, no server

### 7.1 The bindings are real

`lightningdevkit` publishes LDK's auto-generated TypeScript bindings with `liblightningjs.wasm` (14.5 MB). The readme calls them **functionally complete, beta quality**, needing `FinalizationRegistry`, `WeakRef` and WASM BigInt — Chrome 85+, which is the target.

Mutiny shipped this class of stack in a browser for years. The precedent matters more than the polish.

### 7.2 The transport is a data channel

Nothing in LDK requires TCP. It requires a `SocketDescriptor` that can `send_data`, and these seams are all present:

| API | Use |
|---|---|
| `PeerManager.new_inbound_connection` | attach a data channel that arrived |
| `PeerManager.new_outbound_connection` | dial a peer we learned over QR |
| `PeerManager.read_event` | feed received bytes |
| `PeerManager.write_buffer_space_avail` | resume writing |
| `PeerManager.socket_disconnected` | teardown |
| `KeysManager`, `Confirm`, `BestBlock` | node keys and chain state |

The readme's own advice is "bridge `SocketDescriptor` to a WebSocket proxy". We bridge it to an `RTCDataChannel` instead, because both peers are ours:

```
tab A ── RTCDataChannel (ordered, reliable bytes) ── tab B
             ↓ send_data / new_inbound_connection
        LDK PeerManager ── BOLT8 noise ── LDK PeerManager
```

No TCP, no proxy, no server. The peer identity comes from the same QR handshake already used for signalling.

**Limit, stated plainly:** the node can only talk to peers we dial over a data channel. Fine for a room; useless for the wider network — which is also the desired property.

### 7.3 What we own, because we are not using ldk-node

The bindings are LDK, not ldk-node. Ours to write:

- persistence for every LDK store, in IndexedDB, atomically
- the event loop: `read_event`, timers, retry
- chain feeding: Esplora headers → `Confirm`/`BestBlock`
- fee estimation for channel open and close
- reconnect and peer bookkeeping

Mutiny did this with a team. Demo quality is reachable; the failure mode of getting it wrong is **channel state loss on reload**, which is a force-close at best.

---

## 8. Money-safety rules

These are requirements, not conventions.

| Rule | Implementation |
|---|---|
| Persistence | `navigator.storage.persist()` on first run; a refusal is surfaced as a warning |
| Spend-before-reply | the ledger records a secret before the mint answers, so a crash cannot double-issue |
| Single writer | `BroadcastChannel` lock keyed by role: one till tab at a time, wallets independent |
| Atomic proof moves | Dexie transactions; a proof is never in two states |
| Export | seed + mint keysets + unspent proofs, as file and QR. The only recovery path |
| Migrations | versioned Dexie upgrades tested against populated data |
| Amounts | integers or bigint, msat only at a BOLT11 boundary |
| Quote expiry | NUT-04/30 expiry handled explicitly; an expired quote is a stated failure, not a spinner |
| Reconciliation | on till start, re-check pending quotes and spent secrets before showing balances |

---

## 9. Keys

| Key | Purpose | Loss means |
|---|---|---|
| patron nsec | identity, receipts, grants | history lost, funds in proofs still spendable by whoever holds them |
| venue nsec | grants, badge awards | authority chain lost |
| mint keyset | signs tokens | **every token becomes paper** |
| NUT-20 key | binds quotes to a wallet | in-flight quotes stranded |

The mint keyset is the dangerous one. It is encrypted at rest with AES-GCM under a passphrase-derived key (PBKDF2, or Argon2 via wasm if the iteration cost is judged too low), and exported on first creation with a blocking confirmation.

**WebAuthn PRF** is the candidate for biometric-gated unwrap — the closest a PWA gets to a secure enclave. Test before committing to passphrase-only.

---

## 10. Transport and QR

| Payload | Path | Constraint |
|---|---|---|
| a payment token | QR, still image | 300–900 chars, fits at ECC M |
| WebRTC signalling (SDP + ICE) | QR, **UR multipart** | 600–900 chars deflated; too big for one code |
| records and grants | relays when online; outbox while not | NIP-42 AUTH needed for writes |
| BOLT8 bytes | RTCDataChannel | ordered, reliable, no framing assumptions |

Rules for the codes: ECC M on screens, Q on printed cards, 4-module quiet zone, pure black on white inside the code box regardless of theme, Wake Lock held while displaying, dedupe scans by payload hash, native `BarcodeDetector` first with the zxing ponyfill as per-frame fallback.

---

## 11. Hosting

**Vercel.** No card, 100 GB/month bandwidth on Hobby, preview URL per branch, and `vercel.json` for headers.

| Detail | Note |
|---|---|
| Static assets | the 14.5 MB LDK wasm is well inside the per-file limit |
| Build | `vite build`, output directory `dist`, no server runtime |
| Headers | set through `vercel.json` if ever needed |
| Preview | every branch gets a URL — this is how the app is tested on a phone |
| Hobby terms | explicitly non-commercial; fine for now, a licence question later |

None of this needs `COOP`/`COEP`, because both wasm builds are single-threaded.

**Origin is permanent.** IndexedDB is per-origin: changing hostname discards every proof, seed and keyset. Pick the host and the hostname once; treat both like the mint's identity.

Service worker config:

```ts
VitePWA({
  registerType: 'prompt',            // never swap code mid-payment
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2,wasm}'],
    maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
  },
})
```

Both wasm modules must be pointed at bundled assets and precached — `zxing-wasm` and `bdk-wallet-web` fetch from a CDN unless told otherwise, and LDK's wasm is a dynamic import that must still be in the cache.

---

## 12. Testing

| Level | Tool | Covers |
|---|---|---|
| crypto | vitest | hash_to_curve, blind/sign/unblind/verify round-trips |
| mint state | vitest + `fake-indexeddb` | keysets, quote lifecycle, spend ledger, double-spend refusal |
| wallet integration | vitest | cashu-ts over `RequestFn` against `mint-core` — mint, send, receive, checkstate |
| component | Testing Library | wallet and till UI against a Dexie instance |
| end-to-end | **live, driven through a real browser** | two sessions: till + wallet, offline send/receive, melt |

The third row is the important one: it tests the real client library against the real mint object with no network, which is exactly the production configuration.

### 12.1 End-to-end is driven, not scripted in-repo

No browser automation framework is added to the project. End-to-end runs **live through the `browse` MCP** — the browser control tool available to the agent, driving the real Chrome on this machine. Not Selenium, not headless.

The loop is: `navigate` to the preview URL → `snapshot` for refs → click / fill / `press` → `snapshot` again to confirm. Tabs are the handle, so a two-session test is: one tab in till mode, one in wallet mode, both driven from the same script.

Reasons this is the right call here, not a shortcut:

- the thing under test is a **PWA with a service worker and wasm**, which is where headless harnesses diverge most from the device;
- the claim being defended is "works on people's phones", so the pass condition is a real browser doing real things;
- the MCP drives the *user's* browser, so the extension, profile and tabs in play are the ones a person would actually have;
- it verifies rather than assumes: a click that returns is not proof, `snapshot` afterwards is.

What the MCP cannot do, and what stays manual:

- **go offline** — no airplane-mode switch; network loss is tested on a phone, or by blocking the origin;
- **install the PWA** — that is a user action on the device.

### 12.2 Two devices without two devices

The workable surrogate is **two Chrome profiles on this PC, each in a phone viewport**.

```bash
# profile A — till
chrome --user-data-dir=/tmp/dokwa-till --window-size=412,915

# profile B — wallet
chrome --user-data-dir=/tmp/dokwa-wallet --window-size=412,915
```

Separate `--user-data-dir` means separate storage: different IndexedDB, different service-worker registrations, different caches. As far as the app is concerned, those are two devices, and the MCP can drive each one as a separate connected browser.

Set the viewport to a phone (412×915, DPR ≈ 2.6, touch emulation on) so the layout under test is the layout that ships.

What this surrogate really tests: origin isolation, the QR payload path (paste or file), storage per role, service-worker updates, and — usefully — **the same mDNS and ICE stack** the phones will use, since it's the same machine.

What it does not test, and stays on a real phone:

| Missing | Why |
|---|---|
| camera scanning | no camera in emulation; paste and file paths only |
| PWA install | browser-installed, not emulated |
| real performance | same CPU as the dev machine |
| actual network loss | needs airplane mode, or blocking at the OS |
| wasm memory pressure | desktop RAM is not a mid-range phone |

### 12.3 Consequences for the storage layout

Testing with two sessions exposes a design requirement: **storage must be scoped per role, not per origin.**

| Concern | Rule |
|---|---|
| Database names | `dokwa:till` and `dokwa:wallet:<id>` — never one shared DB |
| Single-writer lock | `BroadcastChannel` keyed by role, so two till tabs cannot coexist but a till and a wallet can |
| Keys | role-scoped: the till's keyset is not in the wallet's store |
| Cashu wallet identity | one wallet instance per database, so a test can run two side by side |

Without this, demo mode (till and wallet on one origin) is impossible, and every live test needs two browser profiles.

### 12.4 The manual rows still exist

- **signet:** faucet deposit, NUT-30 melt to a Sparrow address, txid on `mempool.space/signet`.
- **offline:** two phones, airplane mode, token moves by QR.
- **Level 1:** a data channel between two sessions, then a channel open between them.

Those cannot be automated by anything short of two physical devices, and are the ones that matter.

---

## 13. Risk register

| Risk | Why it matters | Trigger to change course |
|---|---|---|
| `lightningdevkit` is beta | the Level 1 claim rests on it | wasm fails to load, or persistence corrupts on reload |
| 14.5 MB wasm | cheap-phone load time and memory | till mode takes more than a few seconds to become usable |
| LDK glue is ours | state loss = force close | a reload loses channel state |
| NUT-30 is experimental in cashu-ts | API may move | client and mint disagree on quote shape |
| NUT-20 binding | quotes tied to a key | in-flight quote stranded by a key mistake |
| in-tab mint has no URL | no third-party redemption | interop becomes a real requirement |
| WebRTC without DNS on Android | scanning *and* Lightning depend on it | `new_outbound_connection` never completes on a dead network |
| Astryx is beta | UI churn | a needed component is missing |
| public relays | throttling, deletion | the record needs a durability promise |

---

## 14. What we gave up, and what we got

| Given up | Gained |
|---|---|
| a mint reachable by other wallets | zero hosting, zero cost, zero accounts |
| Lightning to the wider network | Lightning between two tabs, with no server |
| a Linux daemon's reliability | nothing to keep running during judging |
| standard interop for tokens | the whole system exists on one device |

The spec's money chapter describes a mint with a URL and Lightning at the border. This build is a different shape of the same idea: a till that signs its own tokens and can reach the chain. That difference belongs in §5 of the spec, not in a footnote here.

---

## 15. Verification ladder

In dependency order. Each rung is independently useful; a failure stops the rungs above it.

| # | Experiment | Proves |
|---|---|---|
| 1 | BDHKE round-trip with `@noble/curves` | the mint can exist |
| 2 | cashu-ts `Wallet` + `RequestFn` → `mint-core`: mint, send, receive, checkstate | the keystone holds |
| 3 | BDK wasm: derive a signet address, see a faucet deposit through Esplora | the chain side |
| 4 | NUT-30 melt to a Sparrow address, txid confirmed | "real Bitcoin" |
| 5 | `lightningdevkit` loads in a Chrome tab; `PeerManager` constructed; keys persisted | LDK runs at all |
| 6 | Two tabs, data channel, BOLT8 handshake, `list_peers` shows the peer | no-server Lightning |
| 7 | Signet channel between the two tabs; pay both directions | the full six-step path |

Rungs 1–4 are Level 0. Rungs 5–7 are Level 1 and add without reshaping Level 0.

---

## 16. Open decisions

1. **Till scope.** One tab only, or may other devices reach the till over a data channel? Start with one tab; peers later.
2. **NUT-30 as specified**, or a private on-chain variant. Specified, because the client already speaks it.
3. **Descriptor:** BIP-84 (`wpkh`) or BIP-86 (`tr`). 84 unless taproot is wanted on principle.
4. **Unlock:** passphrase only, or WebAuthn PRF-gated.
5. **Wolof** in the first string catalogue or after.
6. **Licence:** MIT/Apache for the app, AGPL if the mint is ever exposed as a service.
