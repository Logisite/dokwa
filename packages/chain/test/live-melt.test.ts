/**
 * The cash-out leg against real signet: the injected payer of a melt is the
 * chain wallet, and the txid it echoes is checked on the explorer.
 *
 * Payer funding comes from arkfaucet's on-chain rail, one payout only and
 * only when the synced wallet cannot already cover the broadcast. The rig
 * is idempotent about real money: it never spends a coin twice, and a rerun
 * with no funds refills deliberately rather than attempting a payout it
 * cannot make.
 */

import { describe, expect, it } from "vitest";
import type { Destination, Pending, Replied, Sent, Wire } from "@dokwa/core";
import { createChainWallet, type ChainWallet } from "../src/wallet.ts";
import { endpointStatus, refusing } from "./live.ts";

const ENDPOINT = "https://mempool.space/signet/api";
const EXPLORER = "https://mempool.space/signet";
const PAYER_SEED = new Uint8Array(32).fill(11);
const RECEIVER_SEED = new Uint8Array(32).fill(13);
const DEPOSIT_ADDRESS = "tb1qz390yjx4f9s07ztuvyx89rtg8k76xsnsakfrjy";

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

async function sync(w: ChainWallet, label: string) {
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await w.sync();
    } catch (error) {
      last = error;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 65_000));
    }
  }
  throw new Error(`chain rig: ${label} could not sync: ${String(last)}`);
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `${url} answered ${response.status}: ${body.slice(0, 200)}`,
        );
      }
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  throw new Error(`chain rig: ${url} could not answer: ${String(last)}`);
}

/** One real on-chain payout from the faucet, if the rail has any left. */
async function refill(): Promise<string | null> {
  const status = (await fetchJson("https://arkfaucet.com/api/status")) as {
    rail_budgets?: { onchain?: { remaining_sats?: number } };
  };
  const remaining = status.rail_budgets?.onchain?.remaining_sats ?? 0;
  if (remaining < 1000) {
    console.log(
      `faucet on-chain rail has ${remaining} sats left; not requesting`,
    );
    return null;
  }
  const claim = (await fetchJson("https://arkfaucet.com/api/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rail: "onchain",
      destination: DEPOSIT_ADDRESS,
      amount_sats: 1000,
    }),
  })) as { claim_status_url?: string };
  if (!claim.claim_status_url) return null;
  for (let i = 0; i < 12; i += 1) {
    await new Promise((r) => setTimeout(r, 10_000));
    const state = (await fetchJson(claim.claim_status_url)) as {
      status?: string;
    };
    if (state.status === "sent") return "sent";
    if (state.status === "failed" || state.status === "unknown") return null;
  }
  return null;
}

describe("a real payer pays a payout on signet", () => {
  it("broadcasts and the explorer knows the txid", async (ctx) => {
    const status = await endpointStatus(ENDPOINT);
    if (status === 0) {
      ctx.skip(`the preflight for ${ENDPOINT} could not answer at all`);
      return;
    }
    if (refusing(status)) {
      console.log(
        `endpoint ${ENDPOINT} answered ${status}; asserting the loud refusal`,
      );
      await expect(wallet(PAYER_SEED).sync()).rejects.toThrow(
        /could not reach/,
      );
      return;
    }

    const payer = wallet(PAYER_SEED);
    const receiver = wallet(RECEIVER_SEED);
    let balance = await sync(payer, "the payer");
    // refill only when the wallet cannot cover the payout and its fee
    let refillNote = "not needed";
    if (balance.trustedSpendableSat < 800) {
      console.log("payer is short; requesting one faucet payout");
      try {
        const result = await refill();
        refillNote = result ?? "the faucet did not send a payout";
      } catch (error) {
        refillNote = String(error);
        console.log("faucet refused:", refillNote);
      }
      try {
        balance = await sync(payer, "the payer after the refill");
      } catch (error) {
        ctx.skip(
          `the payer sync after the faucet answer could not reach ${ENDPOINT}: ${String(error)}`,
        );
        return;
      }
    }
    if (balance.trustedSpendableSat < 800) {
      ctx.skip(
        `the payer holds ${balance.trustedSpendableSat} sats, not enough for a 500 sat payout and its fee; faucet: ${refillNote}`,
      );
      return;
    }
    const destination = receiver.newDepositAddress();
    const txid = await payer.payOnchain(destination.address, 500);
    console.log("MELT PAYOUT TXID:", txid);
    expect(txid).toMatch(/^[0-9a-f]{64}$/);

    // the explorer is a second, independent path to the same fact
    const explorer = (await (
      await fetch(`${EXPLORER}/tx/${txid}/status`)
    ).json()) as {
      confirmed?: boolean;
    };
    console.log("EXPLORER STATUS:", JSON.stringify(explorer));
    expect(typeof explorer.confirmed).toBe("boolean");

    // the receiver's own sync finds the money that moved
    const seen = await sync(receiver, "the receiver");
    expect(seen.totalSat).toBeGreaterThanOrEqual(500);
  }, 600_000);
});
