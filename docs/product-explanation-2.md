# What this other option is like

*(From Iteration 3, idea 1. Field: Transport & Infrastructure, with Governance, Law & Public Affairs added for the courtroom.)*

A **trust and access layer for shared local infrastructure** — the system a museum, a café, a neighbourhood, or a developer team uses to decide who is entitled to what, and to leave a public record of what happened.

## The core idea

Shared places need three things: prove you're allowed in, remember what happened, and deal with people who break the rules. Normally that's a ticket desk, a logbook, and a manager. Here it's signed notes on relays, so the record belongs to nobody and anyone can check it.

## What you'd actually do with it

- **Prove entitlement** — the museum audio guide checks `get_info` to confirm your ticket before playing the narrator's account of events a censor erased, and tips the curator in blind-signed ecash. The café dispenser works the same way: prove you're subscribed, get coffee, and a keysend receipt goes to your npub for expenses.
- **Keep a public record** — street sightings are kind-1 notes tagged by street and mirrored across NIP-65 relay lists so no single block can suppress them. Code commits are signed as kind-C0 snippets with `window.nostr`, giving contributors an authorship trail that survives platform migrations.
- **Handle rotation** — when a key is replaced, a signed transition notice acknowledges the old one and introduces the new one so partners can update their records. A black-box recorder acts as notary of the ceremony, timestamping each "mourning" by hashing it into a `make_invoice` description it can never read.
- **Enforce agreements** — in a multi-hop relay race, a router that fails to forward its preimage before the timelock is automatically sued in the Nostr courtroom; the judge's NIP-07 ruling turns the forfeiture into a keysend tip. A watchtower funded by BOLT12 subscriptions donates recovered breach funds to pruned-node operators, strengthening independent validation.
- **Trade privately** — a sealed-bid auction uses identity-free blind-signed bearer tokens, so bids stay as notes and settlement is an unlinkable nutzap.

## What the supplementary idea adds

A research visualization that colours historical transactions by the Lightning hop count that settled them, funded by LNURL donations — this supplies the **observability layer** the option was missing. The system doesn't only enforce and record; it lets someone see how on-chain and off-chain activity actually related, without a central analytics service owning the data.

## What makes it unusual

The entitlement check, the logbook, and the enforcement are all the same kind of object: a signed event. There's no separate "access system" and "record system" and "court" — just one substrate used three ways. Even the notary can't read what it timestamps, which is the point: it can prove a moment existed without learning what happened in it.

## The closest analogy

A **building access system, a public logbook, and an automatic small-claims court** for shared community infrastructure — with the logbook hosted by nobody in particular and the court ruling from signatures rather than authority.
