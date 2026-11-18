import { describe, expect, it } from "vitest";
import { createChainWallet, chainDescriptors } from "../src/wallet.ts";

const seed = new Uint8Array(32).fill(11);
const otherSeed = new Uint8Array(32).fill(12);

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
