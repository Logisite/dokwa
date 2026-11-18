# What this generated option is like

*(From Iteration 6, idea 2. Field: Business, Commerce & Labor, with Education & Learning added for the training harness.)*

A **signed review and commerce layer** — a place where reviews, pledges, and merchant replies are public notes anyone can check, and where the same machinery is used to teach developers how to build it.

## The core idea

A review is just a note. Tag it by what it's about, sign it, and the merchant answers with a signed reply attached to the same thread. Nothing sits in a private database that the platform can quietly edit — the exchange is out in the open and verifiable.

## What you'd actually do with it

- **Write a review** — a kind-1 note `t`-tagged by ingredients, so "too salty" is attached to the dish rather than floating in a general comment section. The merchant's answer is a NIP-07-signed `e`-tagged reply on the same note.
- **Use it without seeing** — an accessibility tool reads invoice descriptions aloud for low-vision users, and a voice command keysends a duplicate receipt. The payment flow works by ear.
- **Fund something** — a community fundraiser keeps each backer's pledge in its own isolated sub-wallet, with a shared `max_amount` acting as the goal. Everyone can see the total without anyone's individual pledge being hidden in an account.
- **Manage keys** — a stubborn key store derives a child key from the hash of your last Nostr note, encrypts it at rest under a blinding factor, and publishes a signed memorial note when it refuses to swap.
- **Watch a block get rejected for bad poetry** — the consensus oracle throws out blocks containing haikus, a wallet acting as its own oracle publishes a signed event declaring the block "spiritually valid," and a consolation keysend goes to both miner and poet. Odd, but it demonstrates that a rule and a reaction to the rule can both be recorded as events.
- **Learn the stack** — a regtest harness deliberately broadcasts revoked channel states and grades whether a watchtower catches them, giving Lightning developers a reproducible breach-protection test suite.

## What makes it unusual

The consumer side and the developer-training side are the same product. The review system, the fundraiser, and the accessibility tool all produce signed events; the training harness exists so people can practise producing and checking those same events safely. There isn't a "developer platform" and a "user app" — there's one set of event shapes used at two levels.

## The closest analogy

A **public review board with a built-in training lab** — the reviews are signed and tagged so they can be filtered and checked, merchant replies are attached to the original, accessibility is part of the flow rather than an afterthought, and the developer tools rehearse the same patterns on a private test chain.
