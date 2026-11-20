/**
 * The gate's object swap for melt, under the ruling that extends the
 * apps_web test exception to this one file.
 *
 * Crypto's own live rig proved the broadcast through its own Wire. This
 * runs the same payout through wires' REAL Chain destination, with the
 * till's chain wallet injected as the mint's payer, and the real wallet
 * library doing the ecash side. No simulation: a real 300-sat payout from
 * the funded seed-12 UTXO, through request({ kind: chain }) with the
 * envelope, and an echoed txid the endpoint confirms.
 *
 * Idempotence: the payer holds real test money. If it cannot cover the
 * payout, the test stands down with the balance in the name; it never
 * broadcasts what it cannot pay. A rerun after a successful payout needs
 * the payer refilled, which is stated rather than faked.
 */

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createWire, chainRequestBytes } from "@dokwa/wires";
import { createIdentity, deriveMintKeyset, secretToY } from "@dokwa/keys";
import { openMint, openMintStore } from "@dokwa/mint";
import { openWallet, openWalletStore } from "@dokwa/wallet";
import { createChainWallet } from "@dokwa/chain";

const ENDPOINT = "https://blockstream.info/signet/api";
const PAYOUT = 300;
const TILL_SEED = new Uint8Array(32).fill(41);
const PAYER_SEED = new Uint8Array(32).fill(12);
const RECEIVER_SEED = new Uint8Array(32).fill(11);

describe("the melt gate: real Wire, real till, real chain payer", () => {
  it("pays out through wires' Chain and conserves the ecash change", async (ctx) => {
    const wire = createWire({ signet: ENDPOINT, timeoutMs: 20_000 });
    try {
      const payer = createChainWallet({
        seed: PAYER_SEED,
        wire,
        endpoint: ENDPOINT,
      });
      // a fresh BDK wallet scans only revealed scripts: the funded UTXO is
      // index 0 of this seed
      payer.newDepositAddress();
      let before;
      try {
        before = await payer.sync();
      } catch (error) {
        // a rate-limited explorer is a fact about the endpoint, not about
        // the composition. Stand down with the reason, no retry.
        ctx.skip(`the payer sync could not reach ${ENDPOINT}: ${String(error)}`);
        return;
      }
      if (before.trustedSpendableSat < PAYOUT) {
        ctx.skip(
          `the payer holds ${before.trustedSpendableSat} sats, not enough for a ${PAYOUT} sat payout; refill it before rerunning the gate`,
        );
        return;
      }

      const tillStore = openMintStore("dokwa:gate:melt:till");
      const walletStore = openWalletStore("dokwa:gate:melt:wallet");
      const mint = openMint({
        keyset: deriveMintKeyset(TILL_SEED),
        identity: createIdentity(TILL_SEED),
        url: "dokwa:gate:till",
        store: tillStore,
        // the injection point: the mint imports no chain package
        payer: {
          pay: async ({ address, amountSat }) =>
            payer.payOnchain(address, amountSat),
        },
      });
      const wallet = openWallet({ store: walletStore, mint });

      // real ecash from the real mint: a quote, the operator settles it,
      // the wallet blinds and claims it
      const quote = await wallet.requestQuote({ amount: 1000 });
      await mint.settle(quote.id);
      expect(await wallet.receiveQuote(quote.id)).toBe(1000);
      const spentInputs = (await wallet.proofs()).map((p) => secretToY(p.secret));

      const receiver = createChainWallet({
        seed: RECEIVER_SEED,
        wire,
        endpoint: ENDPOINT,
      });
      receiver.newDepositAddress();
      receiver.newDepositAddress();
      const destination = receiver.newDepositAddress();

      const { txid } = await wallet.cashOut(PAYOUT, destination.address);
      console.log("GATE PAYOUT TXID:", txid);
      expect(txid).toMatch(/^[0-9a-f]{64}$/);

      // the endpoint's own answer, read back through the real Chain
      const reply = await wire.request(
        { kind: "chain", network: "signet" },
        chainRequestBytes({ method: "GET", path: `/tx/${txid}/status` }),
      );
      if (reply.status !== "ok") {
        ctx.skip(`the status check through the real Chain was refused: ${reply.status}`);
        return;
      }
      const status = JSON.parse(new TextDecoder().decode(reply.bytes)) as {
        confirmed?: boolean;
      };
      console.log("GATE ENDPOINT STATUS:", JSON.stringify(status));
      expect(typeof status.confirmed).toBe("boolean");

      // the spent list marks the ecash inputs before any new answer
      const states = await mint.checkstate(spentInputs);
      expect(states.every((s) => s.state === "SPENT")).toBe(true);

      // the ecash change is 1000 - 300, and the chain payer's own sync
      // shows exactly one payout and its real fee
      const ecashAfter = await wallet.balance();
      const after = await payer.sync();
      const fee = before.totalSat - after.totalSat - PAYOUT;
      console.log(
        "GATE CHANGE:",
        ecashAfter,
        "sat ecash; CHAIN FEE:",
        fee,
        "sat; PAYER AFTER:",
        after.totalSat,
        "sat",
      );
      expect(ecashAfter).toBe(700);
      expect(fee).toBeGreaterThan(0);
      expect(after.totalSat).toBeLessThan(before.totalSat);
    } finally {
      wire.close();
    }
  }, 300_000);
});
