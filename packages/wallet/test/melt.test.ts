import { describe, expect, it } from "vitest";
import { openWallet } from "../src/wallet.ts";
import { memoryStore } from "./memory.ts";
import { counterparty } from "./counterparty.ts";

const SEED = new TextEncoder().encode("dokwa: a till seed, sixteen bytes plus");
const ADDRESS = "tb1qz390yjx4f9s07ztuvyx89rtg8k76xsnsakfrjy";

async function fundedWallet(
  payer?: (to: { amountSat: number }) => Promise<string>,
) {
  const till = counterparty(SEED, payer);
  const wallet = openWallet({ store: memoryStore(), mint: till });
  // a real fee reserve is 250 sats, so the wallet needs more than payout+250
  const quote = await wallet.requestQuote({ amount: 1000 });
  till.settle(quote.id);
  await wallet.receiveQuote(quote.id);
  return { till, wallet };
}

describe("cash out", () => {
  it("the payout leaves, the fee reserve is named, and the change arrives", async () => {
    let paid: { amountSat: number; feeReserve?: number } | null = null;
    const { wallet, till } = await fundedWallet(async (to) => {
      paid = to;
      return "txid-from-the-payer";
    });
    expect(await wallet.balance()).toBe(1000);
    const result = await wallet.cashOut(8, ADDRESS);
    expect(result.txid).toBe("txid-from-the-payer");
    // the chain wallet pays the real fee; the reserve is the ceiling the
    // inputs had to cover, and the ecash change is 21 - 8
    expect(await wallet.balance()).toBe(992);
    expect(till.lastPayout()).toMatchObject({
      address: ADDRESS,
      amountSat: 8,
      feeReserve: 250,
    });
    expect(paid).toMatchObject({ amountSat: 8, feeReserve: 250 });
  });

  it("refuses when the wallet cannot cover the payout plus the reserve", async () => {
    const { wallet } = await fundedWallet(async () => "unused");
    await expect(wallet.cashOut(1000, ADDRESS)).rejects.toThrow(
      /needs 1250 sats, and this wallet holds 1000/,
    );
    expect(await wallet.balance()).toBe(1000);
  });

  it("refuses the second melt of the same inputs", async () => {
    const until = counterparty(SEED, async () => "txid");
    const wallet = openWallet({ store: memoryStore(), mint: until });
    const quote = await wallet.requestQuote({ amount: 1000 });
    until.settle(quote.id);
    await wallet.receiveQuote(quote.id);
    const held = await wallet.proofs();
    const inputs = held.map((p) => ({
      id: p.id,
      amount: p.amount,
      secret: p.secret,
      C: p.C,
    }));
    // melt the same inputs twice at the till: one payout, one refusal
    const first = await until.melt(inputs, [], {
      address: ADDRESS,
      amountSat: 1000,
      feeReserve: 0,
    });
    expect(first.txid).toBe("txid");
    await expect(
      until.melt(inputs, [], {
        address: ADDRESS,
        amountSat: 1000,
        feeReserve: 0,
      }),
    ).rejects.toThrow(/token already spent/);
  });

  it("a till with no payer refuses in a sentence", async () => {
    const { wallet } = await fundedWallet();
    await expect(wallet.cashOut(8, ADDRESS)).rejects.toThrow(
      /no payer|no payer injected/i,
    );
    expect(await wallet.balance()).toBe(1000);
  });
});
