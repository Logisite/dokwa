# Harmony — all 27 pieces, one place

Source: `pieces-rerun.md`. Fragment IDs are `seed-entry-letter`, so `S7-2a` is seed 7, output 2, third fragment. Nothing here renames a fragment or drops one for being strange.

## The spine

**A small venue and the people who work and play in it.**

Not a marketplace, not a grid, not a logistics network. A room with a door, a stage, a till, a green room, and a wifi router that dies when the basement fills up.

That room produces exactly the load the fragments describe: many tiny payments from people with no node, no signal, and no account; money that has to split between people who do not fully trust each other; and a public face (menu, set list, now-playing) that has to change nightly.

## Why the load is real, mechanically

- Cash cannot split between a duo, and cannot be audited after the set.
- A card reader needs signal and a merchant account; the basement has neither.
- Lightning needs inbound liquidity before the venue can receive at all.
- A shared login for staff means the 2am crew can do everything the owner can.

Blind-signed ecash fixes the first three (bearer tokens split by value, move offline, need no receiver channel). Scoped keys fix the fourth. Those are properties of the mechanisms, not a market claim.

## One evening, in order

**18:00 — the venue posts tonight.** `S19-3b`: the set list and the menu are kind-1 notes with a `since` filter that hides yesterday's, so anyone reading gets only tonight.

**18:20 — the agent checks the guarantee.** `S33-1b`: the booking agent holds a scoped identity that can read `list_transactions` and nothing else — and only as haikus, because the projection is lossy on purpose. It is revoked the moment it predicts a `payment_sent` the ledger never made. The agent can confirm the guarantee was met. It cannot see the till.

**19:00 — doors.** `S7-3c` + `S33-1a`: the load-out crew holds a read-only key. At 2am it redeems, and the revoked spending key turns out to be a blind-signed bearer token, so the mint cannot tell which shift took the cash box — only that the box was taken by someone the rotation authorised.

**20:00 — the room fills, the signal dies.** `S7-2a` + `S19-3c`: tips arrive as private offline nutzaps from phones with no Lightning node and no channel. Only mint interaction needs a network, so the basement, the cellar, the subway entrance all still work.

**20:15 — the show answers.** `S33-3b`: every keysend lands as a `payment_received` and drives a light and sound cue. The audience sees its own tips.

**20:40 — the duo splits.** `S33-2b`: two collaborators share a sub-wallet that requires a mutually agreed opaque label for joint operations. Neither reads the other's data. Both can coordinate.

**21:00 — royalties.** `S7-3a`: the generative set is a mining pool fed by `getblocktemplate`, and block rewards go out as multi-path payments to the contributing artists. `S33-2a`: the poet's stanzas are paid per stanza, streamed, and each stanza pays for the printing of the last.

**22:00 — the till.** `S33-1a`: the pot sits in a channel; the night's cash sits in ecash; the locksmith rotates the bearer secret hourly, so `get_info` testimony about the ecash expires every hour while the channel exhibit is immortal.

**22:10 — is the mint still solvent?** `S19-2a` + `S7-1b`: the mint publishes its reserve as a signed kind-0 profile; a negentropy diff across three relays catches the moment the guardian federation quietly edits it. If the reserve note vanishes, every spending key auto-revokes until a zap receipt restores them. `S19-2b`: the risk pane shows which of the two failures you are actually exposed to — channel breach or mint default — because they are not the same fear.

**23:00 — someone needs the books.** `S19-2c`: a promoter queries historical records through a stealth read grant, so the query does not reveal which records exist. `S19-1c`: the rider and the contracts sit in a personal vault, each credential NIP-44 ciphertext in the `content` of a kind-1 note, scoped by an `authors` filter to the holder's own key. `S33-3a`: each of those entries is also stored as a blind-signed IOU, so a censor erasing one relay still cannot erase the debt.

**23:30 — between sets.** `S33-2c`: chess, staked, each move keysent to the opponent's pubkey and confirmed by `list_transactions` before the reply lands. `S7-2b`: the crew's food board gates its reviews behind a child key derived from the wallet's last note, so a review can only be signed after the reviewer proves they know the favourite colour. `S7-1c`: the green-room toaster invoices per degree of toast, with an unrecoverable mnemonic as the `make_invoice` description, so no BIP39 validator will ever parse a receipt.

**00:00 — the decision.** `S33-3c`: the poet's client emits a signed "still thinking" attestation every thirty seconds while deciding whether to melt the night's bearer tokens — each hesitation published as a public kind-1 note. `S7-2c`: if mempool is quiet, the node operator gets a tiny keysend for a fully verified UTXO set, which is the only reward routine maintenance ever gets.

**02:00 — a payment stalls.** `S7-3b`: a volunteer router fails to forward its preimage before the timelock. The case goes to the Nostr courtroom; the judge's NIP-07 ruling converts the forfeiture into a keysend tip back to the venue.

**Sunrise.** `S33-1c`: the collective's watchtower is funded by BOLT12 subscriptions and donates recovered breach funds to pruned-node operators via LNURL-withdraw, because the venue's channels are only as safe as the validation behind them. `S7-1a`: onboarding is a nutzap explainer that shows one tip being private, offline, channel-free, and mint-trusting at the same time, so a new crew member weighs the trade-off instead of inheriting it. `S19-1a`: the house music app holds an identity that may sign only well-formed chord progressions, so it can verify content without any authority over wallet state.

## What each piece is for

| ID | Piece | Job | Remove it and |
|---|---|---|---|
| S19-3b | `since`-filtered notes | Tonight is the only night visible | Yesterday's set list and menu confuses the room |
| S33-1b | scoped `list_transactions` identity | Agent can verify a guarantee, nothing else | Agent needs the owner's keys |
| S7-3c | 2am read-only key → bearer token | Shift access without shift identity | The mint learns which crew took the box |
| S33-1a | dual custody + hourly rotation | Cash for the night, channel for the pot, testimony that expires | Old receipts stay "true" forever |
| S7-2a | offline nutzaps | Tips from phones with no node | Half the room cannot pay |
| S19-3c | connectivity-light ecash | Only the mint needs the network | Basement is dead |
| S33-3b | keysend → light and sound | The show answers the room | Tips are invisible |
| S33-2b | shared sub-wallet, opaque label | Duo splits without mutual surveillance | One collaborator sees the other's books |
| S7-3a | generative pool, multipath royalties | Artists are paid from the block, verifiably | Royalties are a promise |
| S33-2a | per-stanza streaming | The poem pays for its own printing | The poet fronts the cost |
| S19-2a | kind-0 solvency + negentropy | The federation cannot quietly edit the reserve | Solvency is a rumour |
| S7-1b | reserve vanishes → auto-revoke | Spending stops the moment backing stops | Tokens outlive their backing |
| S19-2b | risk pane | Two failure modes, named separately | Users fear the wrong thing |
| S19-2c | stealth read grant | Audit without revealing what exists | Audit leaks the record set |
| S19-1c | credential vault, `authors`-scoped | Contracts readable only by the holder | Rider is in a screenshot |
| S33-3a | double-stored entries | Censor erases one relay, debt survives | One relay outage erases the record |
| S33-2c | staked chess | Settlement without a cashier | The stake is a promise |
| S7-2b | child-key + colour-gated reviews | Reviews cost a proof | The board is anonymous noise |
| S7-1c | per-degree toaster | A running joke that is a real invoice | Nothing breaks — this one is green-room furniture |
| S33-3c | 30-second attestations | The hesitation is the record | Nothing breaks — it is the poet's public interior |
| S7-2c | fee dashboard keysend | Maintenance is rewarded | Nobody validates |
| S7-3b | courtroom over a stalled preimage | Failure has a venue | A stalled payment is just lost |
| S33-1c | subscription watchtower → pruned nodes | Protection funds validation | Channels are guarded by an unguarded chain |
| S7-1a | nutzap explainer | Onboarding states the trade-off | New crew inherit assumptions |
| S19-1a | chord-progression policy | House app verifies music, holds no wallet authority | The music app needs wallet rights |

25 distinct pieces, 23 with a mechanical job, 2 that are furniture and say so.

## What I am not claiming

I did not observe this venue and derive the fragments. The fragments came first, from a text shuffler, and this is a place they fit. The mapping above is mechanical — each row names what breaks without it — but "fits" is not "demanded".

What the venue does give that the earlier attempts did not: the pieces are operating at the same scale (an evening, a room, a till) instead of being stretched across a region, and the strange ones stop being decoration because a green room genuinely contains a toaster and a chess board.
