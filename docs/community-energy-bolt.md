# The community idea + education + energy

## What we are bolting onto

The community core, recovered from `wallet-models.md`:

- a **local mint** the community chooses to trust
- **blind signatures** so the mint cannot link issuance to redemption
- **offline bearer transfer** — tokens passed hand-to-hand with no network
- the **village mint race** — winner's ecash reissued with a fresh blinding factor nobody can link
- **key hygiene** — revocation keys against counterparties, blinding factors against issuers

Education already bolted on: the key-hygiene guide, the stealth read grant (progress credentials that don't leak which modules you failed), and the concealed campaign pubkey (anonymous reward issuer).

## Why energy, not transport

Transport would pull back the courier doorbell and parcel-tracking frame, which you already rejected — tracking is a solved problem and the mechanics do not improve it.

Energy has a structural fit with the community core:

- Power is **local** — a neighborhood mini-grid, same scale as a local mint.
- Supply is **intermittent** — offline bearer transfer keeps working when the link is down.
- Consumption is **sensitive** — blind signatures mean the operator cannot link a household to its usage.

That is not a story written to justify features. Those are properties the ecash core already has, pointed at a domain where they matter.

## The idea

A **community mini-grid where power is rationed with blind-signed tokens.**

- Households draw tokens from a local mint. The mint sees a blind signature, not "household 7 bought 3 kWh." Consumption is unlinkable even from the operator.
- A meter releases power when a payment proof checks against a block **the household's own node confirmed minutes ago** — the doorbell mechanic, applied to a breaker instead of a door. No central server decides who is current.
- When supply is short, allocation runs the **village mint race**: each household's blind-signed token lands in an isolated sub-wallet, and the winner's ecash is reissued with a fresh blinding factor nobody can link. The queue is a cryptographic race, not a list of names.
- Tokens keep moving **offline** between neighbors when the network is down; settlement happens when connectivity returns.
- The **education layer** teaches the same system on a test meter: key hygiene (two secrets, two adversaries), private progress credentials, and the anonymous reward issuer for staying current.

## What each piece does — mechanically

| Piece | Job | Remove it and |
|---|---|---|
| Local mint + blind signatures | Consumption unlinkable from operator | The grid knows who used what |
| Offline bearer transfer | Tokens work during outages | No power when the link is down |
| Village mint race | Fair rationing under scarcity | Allocation becomes first-come or administrator-picked |
| Recent-block check at the meter | No central arbiter of who paid | Meter trusts a server again |
| Fresh blinding factor on reissue | Winner cannot be linked to the win | The race becomes public reputation |
| Education layer | New households can join without an operator explaining | The community cannot extend its own grid |

## Adversarial review — the test from the active objective

**Is this a plausible-sounding story reverse-engineered to justify the pile?**

Honest answer:

- **Where it passes:** the core was not invented for this. Blind signatures, offline transfer, and the village mint race came from `wallet-models.md` and the Cashu work before any domain was chosen. Energy was selected because those mechanics fit it, not the other way around. The meter's recent-block check is a real use of the doorbell mechanic rather than decoration.
- **Where it fails:** the "favorite-color state query" and "notarized hourly rotation" from the original 15 still have no honest job here — I left them out rather than forcing them. And choosing energy after having the mechanics is still a form of fitting, even if a weaker one than the logistics frame. A determined critic can say I picked the domain to match the pile.

**Verdict:** better than the logistics and forced-education frames. The core-to-domain direction is right: mechanics first, domain second. But it is not a field-observed problem, and I am not claiming it is. The claim is only that the system could run and that each included piece has a mechanical job.

Two of the original 15 are deliberately unused. That is the difference from the earlier README, which claimed all 14 were necessary.
