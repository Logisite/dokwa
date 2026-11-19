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

const ENDPOINT = "https://mempool.space/signet/api";

/**
 * A sync that retries deliberately against the real rate-limit windows the
 * endpoints enforce: the 429 is the endpoint talking, not the code failing,
 * and the retry ceiling is loud, never silent.
 */
async function syncResilient(wallet: ChainWallet, label: string, attempts = 3) {
  let last: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await wallet.sync();
    } catch (error) {
      last = error;
      if (attempt < attempts - 1)
        await new Promise((resolve) => setTimeout(resolve, 65_000));
    }
  }
  throw new Error(
    `chain rig: ${label} could not sync after ${attempts} real attempts: ${String(last)}`,
  );
}

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
    const balance = await syncResilient(payer, "the payer");
    console.log("PAYER BALANCE AFTER SYNC:", JSON.stringify(balance));
    // the deposit the faucet named, in the wallet's own graph whatever it
    // has spent since
    expect(payer.hasTransaction(DEPOSIT_TXID)).toBe(true);

    // idempotent by design: real reruns must not broadcast what the wallet
    // cannot afford, and a spent-down rig says so instead of failing. The
    // smallest p2wpkh output is the dust limit, 330 sats, and the wallet
    // rightly refuses anything below it
    const DUST = 330;
    const FEE_ALLOWANCE = 250;
    const amount = Math.min(500, balance.trustedSpendableSat - FEE_ALLOWANCE);
    if (balance.trustedSpendableSat < DUST + FEE_ALLOWANCE || amount < DUST) {
      console.log(
        "RIG NOTE: the rig wallet is spent down to",
        balance.totalSat,
        "sats; a payout would be below dust or unaffordable. Refill it via the faucet and rerun",
      );
      return;
    }

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
    // enforces rate windows, so the rig retries deliberately rather than
    // hoping, and gives up loudly if it truly cannot see
    const seen = await syncResilient(receiver, "the receiver");
    console.log("RECEIVER BALANCE AFTER SYNC:", JSON.stringify(seen));
    expect(seen.totalSat).toBeGreaterThanOrEqual(amount);
    expect(receiver.hasTransaction(payout.txid)).toBe(true);

    // and the payer's graph holds it too, minus the fee
    await syncResilient(payer, "the payer after the payout");
    expect(payer.hasTransaction(payout.txid)).toBe(true);
  }, 420_000);
});
