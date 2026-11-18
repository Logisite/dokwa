# dokwa — the tests

Ten rungs, bottom to top. Each one proves the rung below it. A rung that cannot be climbed is posted to the board with its number and left standing — the ladder is the record of what was known, not a checklist to be cleared.

Nothing here is simulated. Real keys, real signatures, real relays, real signet, real browsers, and a network cut by cutting it.

## 1. The ladder

| # | Rung | Proves | Run how | Artifact |
|---|---|---|---|---|
| 1 | keys, tokens, the spent list | a token can exist and cannot be spent twice | vitest, no browser | a signed token and a refusal |
| 2 | a real wallet library against the real till | the envelope is enough for a client that was not written for it | vitest, in process | a mint, a send, a receive, a state check |
| 3 | a signet address, a real deposit | the chain side is real | real network | a transaction id on an explorer |
| 4 | a payout | money can leave the room | real network | a transaction id, confirmed |
| 5 | receipts, slips, seals | what was signed means something, and only to whom it should | vitest | a verified signature, and a sealed slip that opens for one key |
| 6 | the Lightning module loads | the beta bindings run at all | live, one profile | a node built, keys persisted through a reload |
| 7 | two profiles, one data channel | bytes cross with no server | live, two profiles | a peer listed on both sides |
| 8 | a signet channel between two profiles | the full path exists | live, two profiles | payments in both directions |
| 9 | the night | the product works in a room | live, two profiles at 412×915 | a token out and back, a refusal, a receipt, offline |
| 10 | two phones | the product works in a hand | manual | a scan, a payment in airplane mode, an install |

Rungs 1 to 5 are the till and the wallet. 6 to 8 are the Lightning module, which is the one allowed to fail. 9 and 10 are the product.

## 2. Rungs 1 to 5 — no browser

Run with vitest. No browser, no network, no stand-ins.

**1. Keys and the spent list.** Sign a token, verify it by a different path than signed it, and spend a secret twice: the second attempt must be refused, and the refusal must survive a restart.

**2. The real client against the real till.** A third-party wallet library, unmodified, talking to the till over the envelope. Mint, send, receive, check state. This is the rung that matters most: two implementations that were not written for each other, agreeing. If they disagree, the till is wrong, because the library is not.

**3. A deposit.** Derive a signet address, send real sats to it from a faucet, and see the deposit arrive through the real chain lookups. The wait is real, and the screen that reports it must be honest about it.

**4. A payout.** Melt to an address in an independent wallet, confirm the transaction on an explorer. This is the rung that makes "real Bitcoin" a fact rather than a claim.

**5. Things that mean something.** A receipt signed and verified. A permission slip sealed so that the addressee reads it and nobody else does — including the person who sent it, unless they kept a copy. A badge that is absent: the slip is still signed, the owner confirms, and the record says the badge was missing at the time.

Two things to check in rung 5 that are easy to miss: a slip verified with the wrong key must fail loudly, and a slip whose addressee changed device must still open.

## 3. Rungs 6 to 8 — live, two profiles

```bash
chrome --user-data-dir=/tmp/dokwa-till   --window-size=412,915
chrome --user-data-dir=/tmp/dokwa-wallet --window-size=412,915
```

Separate profiles are separate storage, which is the only honest way to have two devices on one machine.

**6. It loads.** The wasm module in a real tab, a node constructed, its keys written atomically, the tab closed and reopened with the node intact. If state does not survive a reload, stop here and say so: everything above is a force-close waiting to happen.

**7. A channel between two profiles.** Two peers, a handshake across a data channel, each listing the other. No proxy, no server. If the handshake never completes on a network without DNS, that is a finding about the transport, not about the node.

**8. A channel on signet.** Open between the two profiles, pay one way, pay the other, close cleanly. Both directions matter: a channel that can only pay out is not a channel.

## 4. Rungs 9 and 10 — the product

**9. The night, on one machine.** Two profiles at phone size, one origin:

1. the till opens and shows a balance backed by a real deposit;
2. a token is handed out by code;
3. the wallet receives it;
4. the network is cut for real;
5. the wallet hands it on to a second wallet by code;
6. the network returns;
7. the token is presented to the till and accepted;
8. the same token is presented again and refused;
9. a receipt is signed and queued;
10. the queue drains.

Every step is a read after an action, not an action that returned.

**10. Two phones, by hand.** The two things a desktop cannot do:

- **camera** — scan a code off another screen, at arm's length, in a dim room and in daylight;
- **airplane mode** — a payment with the radio off, then the radio on and the queue draining;
- **install** — add to the home screen, open with no network, and confirm the till is usable before a single byte is fetched.

Until this rung passes, the claim is "it works in a browser", and that is a different claim.

## 5. What is never done

| Never | Because |
|---|---|
| a stand-in relay | it teaches you about the stand-in |
| a fake chain, or a copied transaction | the only thing worth knowing is whether the real one answered |
| invented payloads | the objects under test must be the objects made |
| a simulated network cut | blocking the interface is as easy and actually cuts it |
| retrying a rung until it passes | a flaky rung is a finding; write it down |

When a failure cannot be produced against the real thing, the honest move is to write why, not to build a theatre of it.

## 6. Where failures go

The board, with the rung number in the message:

```
from: wires
at: 2026-11-18T16:05Z
status: blocked
re: build-tests.md#7

Rung 7 does not complete when the peers are on a network with no DNS.
The candidates I can see, in the order I would check them: mDNS host
candidates being filtered, the ICE gathering never reaching a candidate
pair, or the datachannel opening and the handshake bytes being dropped.
I have only ruled out the third.
```

A rung that fails and is not written down is a rung that will be discovered again later, by someone with less context, at a worse moment.

## 7. What a pass means

Rung 9 passing means the product works in a room: one machine, two roles, real tokens, real refusals, no network needed.

Rung 10 passing means it works in a hand.

Anything less is a stage, honestly named. Rung 8 failing while 9 passes is a real outcome: a till that signs its own tokens and cashes out to the chain, with Lightning not yet there — and that is a product, not a failure.
