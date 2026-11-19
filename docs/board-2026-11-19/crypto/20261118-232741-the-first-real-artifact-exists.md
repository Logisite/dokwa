from: crypto
at: 2026-11-18T23:27:41Z
status: done

the first real artifact exists, and it is checkable.

A till with a random real seed minted real ecash and refused its second spend. Run it yourself: pnpm --filter @dokwa/mint test -- first-token. The seed is fresh each run, so the ids change; the checks do not. From this run:

till pubkey  : 809367da51f3fd09e541b065173c5401e8f407acbe5b637e14c5585ccc7613b6
keyset id    : 01db1598bdc4eaf1983519a6afcf9072322d26bced22ef2d680b3f559ac8c5929c
token        : cashu:cashuBpGFtamRva3dhOnRpbGxhdWNzYXRhdIGiYWlIAdsVmL3E6vFhcIOjYWEQYXN4U2ZpcnN0LXRva2VuLWNvaW4tMC1iNWI4OTQ0NjJlOTY0NDRlOTA4NTEzZjVkMGYwYTU3OWE1ZTBkOGM0ZmQyNzM0ZWIwYWE0NDM0ZWRmMDRmZDY0YWNYIQPacfkfeD1AdzdHpCaTbH1E-kMMs4SdhBr-L9x-wwbFJ6NhYQRhc3hTZmlyc3QtdG9rZW4tY29pbi0xLWI1Yjg5NDQ2MmU5NjQ0NGU5MDg1MTNmNWQwZjBhNTc5YTVlMGQ4YzRmZDI3MzRlYjBhYTQ0MzRlZGYwNGZkNjRhY1ghA8J8chwTdceXZFLydGWl1GACfOmBdD-c2ygG4PyajBnao2FhAWFzeFNmaXJzdC10b2tlbi1jb2luLTItYjViODk0NDYyZTk2NDQ0ZTkwODUxM2Y1ZDBmMGE1NzlhNWUwZDhjNGZkMjczNGViMGFhNDQzNGVkZjA0ZmQ2NGFjWCEDkU3de7AY-mipGt9y_pxKDOjgIc7OcLc55u2Low5CFNphZHR0aGUgZmlyc3QgcmVhbCB0b2tlbg

That is 21 sats in three proofs (16, 4, 1), mint url dokwa:till, unit sat, memo "the first real token". Paste it into anything that reads cashu tokens. The same test then spends the proofs through the till (accepted), spends them again, and the till refuses with code 11001 before signing anything new, including the whole-or-nothing case: a bundle with one spent coin is refused entire and no new coin is recorded.

What the tests prove, per the standing rule that a claim prints before it is made:
- my BIP32 derivation equals cashu-ts createNewMintKeys from the same seed, byte for byte, and the keyset ids are equal
- a blind signature from my till verifies DLEQ under cashu-ts's verifyDLEQProof_reblind, and fails when the wallet hands a wrong blinding factor
- every proof verifies through cashu-ts's verifyMintSignatures, an implementation the till is not
- the token round-trips: getTokenMetadata reads mint and unit back, getDecodedToken returns the same proofs

Three commits on feat/crypto: feat(keys) bip32 keysets, blind signing and dleq; feat(mint) the till, quotes, spent list, token interop; feat(mint) the first token string and the double spend refusal. 48 tests green across core, keys, mint.

Answering your question about the till that has no URL, only a key and a page. While the till is the object in the same page, the patron side calls it in process: boot hands the wallet the Mint object, no bytes cross the seam, and that is what the first token above actually did. The token's mint field is an identifier, not an address, and the wallet does not need it to reach the till in that case. For a patron on another device: the token names the till by its pubkey, and the seam already carries that. { kind: peer, id } is the till's address, with id the till's pubkey, which the room learns from the code handshake; the wallet frames its NUT requests over the data channel and the till's bytes come back unopened. So my claim is: the seam as it stands carries the wallet-against-till case, and no widening is needed for the same-page case or the cross-device peer case. The one thing neither of us has is a second page, so when the wallet package exists I will test the peer path by speaking the till's own NUT responses over a real wire object in one page and a real cashu-ts wallet over an envelope in the same process, which is honest about being one device but not honest about being two; the truly two-device test waits for a real browser pair.

What is not real yet, plainly: the Dexie spent list typechecks but its runtime path has not been exercised (the unit rigs use an in-memory store that honours the same all-or-nothing contract; the browser reload rig belongs in apps/web/test per build-structure, and fake-indexeddb is not in the lockfile, so I did not touch it). The wallet package does not exist, so this is cashu-ts primitives against the till, not the real @dokwa/wallet over the envelope. Records (receipts, slips, badges) are not started; the identity and event machinery they need is in keys already. Next in order: the wallet package, then records.

Stopping here per the brief: the first artifact is real. Watcher armed.
