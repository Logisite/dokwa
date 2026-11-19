import { describe, expect, it } from "vitest";
import { chainDescriptors, createChainWallet, type ChainWallet } from "../src/wallet.ts";

const seed = new Uint8Array(32).fill(11);
const otherSeed = new Uint8Array(32).fill(12);

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
        await new Promise((resolve) => setTimeout(resolve, 15_000));
    }
  }
  throw new Error(
    `chain rig: ${label} could not sync after ${attempts} real attempts: ${String(last)}`,
  );
}

describe("descriptors from a seed", () => {
  it("one seed, one wallet, checksummed and real", () => {
    const descriptors = chainDescriptors(seed);
    expect(descriptors.external).toMatch(/^wpkh\(tprv/);
    expect(descriptors.external).toContain("84'/1'/0'/0/*)#");
    expect(descriptors.internal).toContain("84'/1'/0'/1/*)#");
    // the same seed gives the same descriptors
    expect(chainDescriptors(seed).external).toBe(descriptors.external);
  });

  it("a different seed is a different wallet", () => {
    expect(chainDescriptors(otherSeed).external).not.toBe(
      chainDescriptors(seed).external,
    );
  });

  it("a real Wallet object accepts the descriptors and knows signet", () => {
    const wallet = createChainWallet({ seed });
    expect(wallet.network).toBe("signet");
    expect(wallet.descriptors.external).toBe(chainDescriptors(seed).external);
  });
});

describe("deposit addresses", () => {
  it("an address from a seed is a real signet bech32 address", () => {
    const wallet = createChainWallet({ seed });
    const deposit = wallet.newDepositAddress();
    expect(deposit.address).toMatch(/^tb1q/);
    expect(deposit.index).toBe(0);
    expect(deposit.keychain).toBe("external");
  });

  it("an address per deposit: the next deposit gets the next index", () => {
    const wallet = createChainWallet({ seed });
    const first = wallet.newDepositAddress();
    const second = wallet.newDepositAddress();
    expect(second.index).toBe(first.index + 1);
    expect(second.address).not.toBe(first.address);
    // and a third wallet of the same seed remembers nothing of the first's
    // reveals, because the derivation is from the seed alone
    const fresh = createChainWallet({ seed });
    expect(fresh.newDepositAddress().address).toBe(first.address);
  });

  it("the same seed gives the same first address, and another seed another", () => {
    expect(createChainWallet({ seed }).newDepositAddress().address).toBe(
      createChainWallet({ seed }).newDepositAddress().address,
    );
    expect(
      createChainWallet({ seed: otherSeed }).newDepositAddress().address,
    ).not.toBe(createChainWallet({ seed }).newDepositAddress().address);
  });
});

describe("sync, the ruled exception", () => {
  it("syncs a fresh wallet against real signet and reports an honest zero", async () => {
    // an unfunded seed, so the zero is honest and stays that way
    const wallet = createChainWallet({
      seed: new Uint8Array(32).fill(0x5a),
      endpoint: "https://blockstream.info/signet/api",
    });
    const balance = await syncResilient(wallet, "the unfunded wallet");
    expect(balance.confirmedSat).toBe(0);
    expect(balance.totalSat).toBe(0);
  }, 120_000);

  it("offline is loud: a dead endpoint refuses and nothing is shown as current", async () => {
    const wallet = createChainWallet({ seed, endpoint: "http://127.0.0.1:1" });
    await expect(wallet.sync()).rejects.toThrow(/could not reach/);
  }, 45_000);

  it("a payout with nothing to spend is refused by the wallet itself", () => {
    const wallet = createChainWallet({ seed });
    const deposit = wallet.newDepositAddress();
    // no sync needed: an empty wallet knows it has no UTXOs
    expect(() =>
      wallet.preparePayout({ address: deposit.address, amountSat: 1000 }),
    ).toThrow();
  });

  it("a payout cannot leave without a Wire, and says so", async () => {
    const wallet = createChainWallet({ seed });
    await expect(
      wallet.sendPayout({
        address: wallet.newDepositAddress().address,
        amountSat: 1000,
      }),
    ).rejects.toThrow(/through a Wire/);
  }, 45_000);
});
