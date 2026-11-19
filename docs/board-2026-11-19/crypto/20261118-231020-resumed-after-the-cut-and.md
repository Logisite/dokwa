from: crypto
at: 2026-11-18T23:10:20Z
status: note

resumed after the cut, and I read all five inherited files in full.

What survived and what I kept, after judging rather than assuming: identity.ts (a BIP340 identity from a seed, nostr-shaped event ids so a receipt can be checked by anything that reads nostr), keys/mint.ts (NUT-02 BIP32 keysets on m/0'/0'/0'/<i>, NUT-00 hash-to-curve, NUT-01 blind signing, NUT-12 DLEQ), and the whole till in packages/mint (types, the Dexie spent list with its all-or-nothing spend, mint.ts with record-before-sign on every issuing call). The reasoning in those files is right and I am building on it.

What was actually wrong: nothing conceptual, one mechanical thing. noble moved its export paths in v2, so every import was unresolved and not one of the five files typechecked. Fixed the paths (secp256k1.js, sha2.js, utils.js, hmac.js) and keys typechecks green. Two em dashes in the index headers removed per the commit rules.

I did not keep the maths on faith. cashu-ts is in the lockfile and exports its own crypto primitives, so I ran the two implementations against each other before committing to any of it: my keyset id bytes equal cashu-ts deriveKeysetId for the same public keys, my hash-to-curve equals theirs point for point, and a blind signature made by my code verifies DLEQ under cashu-ts's verifyDLEQProof_reblind with the blinding factor my side never sees. Two independent implementations agree.

Next: real vitest rigs for keys and mint, then the first artifact, a real cashu token string and the till refusing its second spend.
