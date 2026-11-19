/**
 * The gate's live melt: the till's injected payer is the real chain wallet,
 * funded with real signet test money (1468 sats across three confirmed UTXOs
 * at tb1qljhq7j6cdg0uyulnrmypmh8uef2xr46qwm3qqr). It pays 100 sats to a
 * fresh address from a different seed, through request({ kind: chain }) with
 * the HTTP envelope the carrier parses; ok carries the echoed txid.
 *
 * One sync attempt per side, no faucet, no retry into a refused window. A
 * rerun spends real money again, but only from coins the chain says are
 * spendable at that moment.
 */

import { describe, expect, it } from "vitest";
import type { Destination, Pending, Replied, Sent, Wire } from "@dokwa/core";
import { createChainWallet, type ChainWallet } from "../src/wallet.ts";
import { endpointStatus, isEndpointFailure } from "./live.ts";

const ENDPOINT = "https://blockstream.info/signet/api";
const EXPLORER = "https://blockstream.info/signet";
const PAYER_SEED = new Uint8Array(32).fill(12);
const RECEIVER_SEED = new Uint8Array(32).fill(11);
const PAYOUT_SATS = 300;

function chainWire(): Wire {
  return {
    async send(to: Destination, bytes: Uint8Array): Promise<Sent> {
      if (to.kind !== "chain") return { status: "failed", reason: "rejected" };
      const envelope = JSON.parse(new TextDecoder().decode(bytes)) as {
        method?: string;
        path: string;
        body?: string;
      };
      const response = await fetch(`${ENDPOINT}${envelope.path}`, {
        method: envelope.method ?? "GET",
        headers: { "Content-Type": "text/plain" },
        body: envelope.body,
      });
      return response.ok
        ? { status: "delivered" }
        : { status: "failed", reason: "rejected" };
    },
    async request(to: Destination, bytes: Uint8Array): Promise<Replied> {
      if (to.kind !== "chain") return { status: "failed", reason: "rejected" };
      const envelope = JSON.parse(new TextDecoder().decode(bytes)) as {
        method?: string;
        path: string;
        body?: string;
      };
      const response = await fetch(`${ENDPOINT}${envelope.path}`, {
        method: envelope.method ?? "GET",
        headers: { "Content-Type": "text/plain" },
        body: envelope.body,
      });
      if (!response.ok) return { status: "failed", reason: "rejected" };
      return {
        status: "ok",
        bytes: new TextEncoder().encode((await response.text()).trim()),
      };
    },
    onBytes(): () => void {
      return () => {};
    },
    onSignal(): () => void {
      return () => {};
    },
    async pending(): Promise<Pending[]> {
      return [];
    },
  };
}

function wallet(seed: Uint8Array): ChainWallet {
  return createChainWallet({ seed, wire: chainWire(), endpoint: ENDPOINT });
}

describe("the gate's live melt, against real funds", () => {
  it("pays out, echoes the txid, and conserves the change", async (ctx) => {
    const status = await endpointStatus(ENDPOINT);
    if (status === 0) {
      ctx.skip(`the preflight for ${ENDPOINT} could not answer at all`);
      return;
    }
    if (status === 429 || status >= 500) {
      ctx.skip(
        `the preflight for ${ENDPOINT} answered ${status}; no live payout attempted`,
      );
      return;
    }

    const payer = wallet(PAYER_SEED);
    // a fresh BDK wallet scans only revealed scripts: name the funded
    // address (index 0) before asking the chain about it
    payer.newDepositAddress();
    let before;
    try {
      before = await payer.sync();
    } catch (error) {
      if (!isEndpointFailure(error)) throw error;
      ctx.skip(`the payer sync was refused by ${ENDPOINT}: ${String(error)}`);
      return;
    }
    console.log("PAYER BEFORE:", JSON.stringify(before));
    if (before.trustedSpendableSat < PAYOUT_SATS + 250) {
      ctx.skip(
        `the payer holds ${before.trustedSpendableSat} sats, not enough for a ${PAYOUT_SATS} sat payout and its fee; no payout attempted`,
      );
      return;
    }

    const receiver = wallet(RECEIVER_SEED);
    // a fresh address: reveal index 2, past the two faucet addresses
    receiver.newDepositAddress();
    receiver.newDepositAddress();
    const destination = receiver.newDepositAddress();

    const txid = await payer.payOnchain(destination.address, PAYOUT_SATS);
    console.log("ECHOED PAYOUT TXID:", txid);
    expect(txid).toMatch(/^[0-9a-f]{64}$/);

    let explorer;
    try {
      const response = await fetch(`${EXPLORER}/tx/${txid}/status`);
      explorer = (await response.json()) as { confirmed?: boolean };
    } catch (error) {
      // an HTML error page where JSON was expected is a fact about the
      // explorer, not about the payout. Record it and continue: the wire's
      // echoed txid is the primary proof, and the assertions below use the
      // endpoint through the wallet's own HTTP stack.
      console.log("EXPLORER CHECK REFUSED:", EXPLORER, String(error));
    }
    if (explorer) console.log("EXPLORER STATUS:", JSON.stringify(explorer));
    if (explorer) expect(typeof explorer.confirmed).toBe("boolean");

    let received;
    try {
      received = await receiver.sync();
    } catch (error) {
      if (!isEndpointFailure(error)) throw error;
      ctx.skip(
        `the receiver sync was refused by ${ENDPOINT}: ${String(error)}`,
      );
      return;
    }
    console.log("RECEIVER AFTER:", JSON.stringify(received));
    expect(received.totalSat).toBeGreaterThanOrEqual(PAYOUT_SATS);

    let after;
    try {
      after = await payer.sync();
    } catch (error) {
      if (!isEndpointFailure(error)) throw error;
      ctx.skip(
        `the payer's post-payout sync was refused by ${ENDPOINT}: ${String(error)}`,
      );
      return;
    }
    const fee = before.totalSat - after.totalSat - PAYOUT_SATS;
    console.log("PAYER AFTER:", JSON.stringify(after));
    console.log(
      "FEE:",
      fee,
      "sats; CHANGE:",
      after.totalSat,
      "sats; PAYOUT:",
      PAYOUT_SATS,
      "sats",
    );
    expect(after.totalSat).toBeLessThan(before.totalSat);
    expect(fee).toBeGreaterThan(0);
  }, 300_000);
});
