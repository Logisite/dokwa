/**
 * A real Wire: its chain destination is the real signet endpoint, and it
 * speaks the dialect wires' chain destination parses, so the rig is already
 * in the right shape the day it rides their Wire: the bytes in are JSON
 * naming method, path and body on the configured endpoint, the bytes out are
 * the endpoint's raw response, and a broadcast goes through request because
 * it wants its answer back. ok with the echoed txid is the success word;
 * request never says delivered.
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
      const text = (await response.text()).trim();
      return {
        status: "ok",
        bytes: new TextEncoder().encode(text),
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

    const { payout, replied } = await payer.sendPayout(
      { address: destination.address, amountSat: amount },
      1,
    );
    console.log("PAYOUT TXID:", payout.txid);
    console.log("SEAM ANSWER:", JSON.stringify(replied));
    // the chain destination's success word is ok, with the echoed txid
    if (replied.status !== "ok")
      throw new Error(`chain rig: the broadcast was ${replied.status}`);
    expect(new TextDecoder().decode(replied.bytes).trim()).toBe(payout.txid);

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
