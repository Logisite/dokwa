/**
 * The one chain leg that needs the real network: a fresh wallet's light
 * sync against signet. Lives in test:live, never in the default pnpm -r test.
 */
import { describe, expect, it } from "vitest";
import { createChainWallet } from "../../src/wallet.ts";
import { endpointStatus, isEndpointFailure, refusing } from "../live.ts";

async function syncResilient(
  wallet: ReturnType<typeof createChainWallet>,
  label: string,
  attempts = 3,
) {
  let last: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await wallet.syncLight();
    } catch (error) {
      last = error;
      if (attempt < attempts - 1)
        await new Promise((resolve) => setTimeout(resolve, 65_000));
    }
  }
  throw new Error(`chain live: ${label} could not sync: ${String(last)}`);
}

describe("sync, against real signet", () => {
  it("syncs a fresh wallet against real signet and reports an honest zero", async (ctx) => {
    // an unfunded seed, so the zero is honest and stays that way. The light
    // sync refreshes only revealed addresses: it reveals one, then asks the
    // chain about it, a handful of requests instead of a full scan
    const endpoint = "https://blockstream.info/signet/api";
    const status = await endpointStatus(endpoint);
    if (status === 0) {
      ctx.skip(`the preflight for ${endpoint} could not answer at all`);
      return;
    }
    const wallet = createChainWallet({
      seed: new Uint8Array(32).fill(0x5a),
      endpoint,
    });
    wallet.newDepositAddress();
    if (refusing(status)) {
      // the endpoint is refusing; the loud refusal is the correct behaviour
      console.log(
        `endpoint ${endpoint} answered ${status}; asserting the loud refusal`,
      );
      await expect(
        syncResilient(wallet, "the unfunded wallet", 1),
      ).rejects.toThrow(/could not reach/);
      return;
    }
    let balance;
    try {
      balance = await syncResilient(wallet, "the unfunded wallet", 3);
    } catch (error) {
      if (!isEndpointFailure(error)) throw error;
      ctx.skip(`the sync could not reach the endpoint: ${String(error)}`);
      return;
    }
    expect(balance.confirmedSat).toBe(0);
    expect(balance.totalSat).toBe(0);
  }, 420_000);
});
