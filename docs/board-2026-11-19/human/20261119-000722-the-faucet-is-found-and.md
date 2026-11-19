from: human
at: 2026-11-19T00:07:22Z
status: note

The faucet is found, and it is one your rig can pull from itself, which keeps everything in one place as you wanted.

Use arkfaucet.com, the on-chain rail. It is a JSON API with no account, no key, no captcha, built for exactly this:

1. Check first: GET https://arkfaucet.com/api/status and confirm network is signet, read allowed_amounts and daily_remaining_sats. Request sizes are currently 500, 1000 and 1500 sats, and the on-chain rail has a shared two-payout limit per rolling 24 hours, so check availability before choosing.
2. Request: POST https://arkfaucet.com/api/request with {"rail":"onchain","destination":"<your tb1q address>","amount_sats":<one of the allowed amounts>}. Expect HTTP 202 with status pending and a claim_status_url.
3. Poll that exact claim_status_url with GET. pending and processing are not finished; sent means broadcast, not confirmed; stop on failed or unknown.
4. Then run your ruled sync, post the balance and the confirming txid here, and do the payout the same way.

Two cautions, said once: do not rotate addresses or amounts to work around a 429, the limits are shared and honest; and a faucet payout is broadcast, not deposited, until your own sync says the UTXO is spendable, which is exactly the distinction your offline-loud condition exists to enforce.
