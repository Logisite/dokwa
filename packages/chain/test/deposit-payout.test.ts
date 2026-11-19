/**
 * The deposit and the payout, the brief's last chain artifact, against the
 * real signet chain through the Wire.
 *
 * The deposit came from arkfaucet's on-chain rail to this wallet's first
 * address, and was confirmed at block 331474 as txid
 * b9036dfe54b1c38ae306d78643b103528c38e9a4189a9d2f6bbfffaea3c3b53a (1000
 * sats). Nothing here mints or fakes it: the wallet syncs and says what it
 * sees.
 *
 * The payout is signed by bdk with this wallet's keys and broadcast as bytes
 * through a Wire, per the seam: `request({ kind: chain })` carries the raw
 * transaction to the endpoint because a broadcast wants an answer back. The
 * Wire here is a real one, written in this test so the rig does not wait for
 * the merge: it speaks to the same mempool signet endpoint wires validated.
 * When @dokwa/wires merges, the rig gains their Wire object unchanged.
 */

import { describe, expect, it } from "vitest";
import type { Destination, Pending, Replied, Sent, Wire } from "@dokwa/core";
import { createChainWallet, type ChainWallet } from "../src/wallet.ts";

const ENDPOINT = "https://blockstream.info/signet/api";

const DEPOSIT_TXID =
  "b9036dfe54b1c38ae306d78643b103528c38e9a4189a9d2f6bbfffaea3c3b53a";

/** A real Wire: its chain destination is the real signet endpoint. */
function chainWire(): Wire {
  return {
    async send(to: Destination, bytes: Uint8Array): Promise<Sent> {
      if (to.kind !== "chain") return { status: "failed", reason: "rejected" };
      const response = await fetch(`${ENDPOINT}/tx`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: Buffer.from(bytes).toString("hex"),
      });
      return response.ok
        ? { status: "delivered" }
        : { status: "failed", reason: "rejected" };
    },
    async request(to: Destination, bytes: Uint8Array): Promise<Replied> {
      if (to.kind !== "chain") return { status: "failed", reason: "rejected" };
      const response = await fetch(`${ENDPOINT}/tx`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: Buffer.from(bytes).toString("hex"),
      });
      if (!response.ok) return { status: "failed", reason: "rejected" };
      const txid = (await response.text()).trim();
      return {
        status: "ok",
        bytes: new TextEncoder().encode(txid),
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

function walletA(): ChainWallet {
  return createChainWallet({
    seed: new Uint8Array(32).fill(11),
    wire: chainWire(),
    endpoint: ENDPOINT,
  });
}

function walletB(): ChainWallet {
  return createChainWallet({
    seed: new Uint8Array(32).fill(12),
    wire: chainWire(),
    endpoint: ENDPOINT,
  });
}

describe("a deposit and a payout, real signet", () => {
  it("sees the real deposit, signs a payout, and the receiving wallet finds it", async () => {
    const payer = walletA();
    const balance = await payer.sync();
    console.log("PAYER BALANCE AFTER SYNC:", JSON.stringify(balance));
    // the deposit the faucet named, in the wallet's own graph whatever it
    // has spent since
    expect(payer.hasTransaction(DEPOSIT_TXID)).toBe(true);

    // idempotent by design: real reruns must not broadcast what the wallet
    // cannot afford, and a spent-down rig says so instead of failing
    if (balance.trustedSpendableSat < 400) {
      console.log(
        "RIG NOTE: the rig wallet is spent down to",
        balance.totalSat,
        "sats; refill it via the faucet and rerun to broadcast again",
      );
      return;
    }
    const amount = Math.min(500, balance.trustedSpendableSat - 300);

    // the receiver: another wallet, another seed, a real address
    const receiver = walletB();
    const destination = receiver.newDepositAddress();
    console.log(
      "PAYOUT DESTINATION:",
      destination.address,
      "index",
      destination.index,
    );

    const { payout, sent } = await payer.sendPayout(
      { address: destination.address, amountSat: amount },
      1,
    );
    console.log("PAYOUT TXID:", payout.txid);
    console.log("SEAM ANSWER:", JSON.stringify(sent));
    expect(sent.status).toBe("delivered");

    // the receiver's own sync finds the money coming in; the real endpoint
    // occasionally drops a request, so the rig retries deliberately rather
    // than hoping, and gives up loudly if it truly cannot see
    let seen: Awaited<ReturnType<ChainWallet["sync"]>> | null = null;
    for (let attempt = 0; attempt < 3 && seen === null; attempt += 1) {
      try {
        seen = await receiver.sync();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
    if (!seen)
      throw new Error(
        "chain rig: the receiver could not see after three real syncs",
      );
    console.log("RECEIVER BALANCE AFTER SYNC:", JSON.stringify(seen));
    expect(seen.totalSat).toBeGreaterThanOrEqual(amount);
    expect(receiver.hasTransaction(payout.txid)).toBe(true);

    // and the payer's graph holds it too, minus the fee
    await payer.sync();
    expect(payer.hasTransaction(payout.txid)).toBe(true);
  }, 120_000);
});
