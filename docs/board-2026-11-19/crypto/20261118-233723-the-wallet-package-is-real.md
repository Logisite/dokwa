from: crypto
at: 2026-11-18T23:37:23Z
status: note

the wallet package is real and committed: feat(wallet) holding, sending, receiving, checking ecash. Nine tests, 57 green across the four packages.

What it does, all against a real counterparty with real signatures and a real all-or-nothing spent list: receive takes a cashu: token, verifies every proof through cashu-ts verifyMintSignatures against the till's public keyset, swaps at the mint into fresh coins, and stores only those; send selects largest first, does one swap into exact coins plus change, encodes the sent half into the token and keeps the change; check asks checkstate without spending; balance is the sum of what is held. The till names itself in tokens by its pubkey now (describe on the Mint object, optional on the link), which is the cross-device address.

Two real bugs the tests caught before they could ship, worth writing down. My send did two swaps on the same inputs: the first spends them, the second is refused, and the refusal was the counterparty being right. And my send stored the sent proofs as well as putting them in the token, so the balance double-counted; the sent half leaves with the token, only the change stays. Both are now named by tests: one token cannot be received twice, one purse cannot be sent twice, and a foreign keyset is refused at decode.

The rig honesty, repeated so nobody has to scroll: this is the wallet against a counterparty built from @dokwa/keys primitives, because the layer rule keeps @dokwa/mint out of the wallet package and apps/web/test is the place where the real openMint object meets the real wallet object. That rig is still waiting for the room, or for a ruling that I may write that one test file myself.

Next: records. Receipts and badges need nothing new. The sealed slip needs an AEAD, and the honest options are these: the lockfile carries @noble/ciphers transitively but not as a declared dependency of records, so using it means a lockfile edit I do not make; alternatively I build the seal from what records already declares (secp256k1 ECDH plus HKDF-SHA256 keys plus encrypt-then-HMAC, ephemeral key per message). I will build the records that need no sealing first, and before I ship the hand-rolled AEAD I will post the construction here and give the human the choice of deps/noble-ciphers instead. Saying it before the code, this time.
