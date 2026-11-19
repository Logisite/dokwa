import { describe, expect, it } from "vitest";
import { verifyMintSignatures } from "@cashu/cashu-ts";
import { openWallet } from "../src/wallet.ts";
import { memoryStore } from "./memory.ts";
import { counterparty } from "./counterparty.ts";

const SEED = new TextEncoder().encode("dokwa: a till seed, sixteen bytes plus");

/**
 * Acquiring the first ecash: the wallet asks for a NUT-04 quote, the
 * operator settles it, the wallet blinds with its own maths, the till signs,
 * the wallet unblinds and holds. A second claim of the same quote is refused
 * by the till and the wallet stores nothing on the refusal.
 */
describe("acquiring the first ecash", () => {
  it("asks for a quote and reads the instruction back", async () => {
    const cp = counterparty(SEED);
    const wallet = openWallet({ store: memoryStore(), mint: cp });
    const quote = await wallet.requestQuote({
      amount: 21,
      description: "the door",
    });
    expect(quote.id).toMatch(/^[0-9a-f]{32}$/);
    expect(quote.amount).toBe(21);
    expect(quote.state).toBe("UNPAID");
    expect(quote.request).toContain("the door");
    // the till agrees it knows the quote
    expect((await cp.readQuote(quote.id))?.amount).toBe(21);
  });

  it("refuses to claim before the operator has settled", async () => {
    const cp = counterparty(SEED);
    const wallet = openWallet({ store: memoryStore(), mint: cp });
    const quote = await wallet.requestQuote({ amount: 8 });
    await expect(wallet.receiveQuote(quote.id)).rejects.toThrow(/not paid/);
    expect(await wallet.balance()).toBe(0);
  });

  it("a settled quote becomes real coins the wallet holds", async () => {
    const cp = counterparty(SEED);
    const wallet = openWallet({ store: memoryStore(), mint: cp });
    const quote = await wallet.requestQuote({
      amount: 21,
      description: "the door",
    });
    cp.settle(quote.id);
    const claimed = await wallet.receiveQuote(quote.id);
    expect(claimed).toBe(21);
    expect(await wallet.balance()).toBe(21);
    // the held proofs verify through an implementation the wallet is not
    const held = await wallet.proofs();
    expect(held.length).toBeGreaterThan(0);
    const verdict = await verifyMintSignatures(
      held.map((p) => ({
        id: p.id,
        amount: p.amount,
        secret: p.secret,
        C: p.C,
        ...(p.dleq ? { dleq: p.dleq } : {}),
      })),
      (id) => ({ id, keys: { ...cp.keyset.keys } }),
    );
    expect(verdict.invalid).toHaveLength(0);
    expect(verdict.valid).toHaveLength(held.length);
  });

  it("refuses the second claim of the same quote, and stores nothing", async () => {
    const cp = counterparty(SEED);
    const wallet = openWallet({ store: memoryStore(), mint: cp });
    const quote = await wallet.requestQuote({ amount: 4 });
    cp.settle(quote.id);
    expect(await wallet.receiveQuote(quote.id)).toBe(4);
    await expect(wallet.receiveQuote(quote.id)).rejects.toThrow(
      /claimed again/,
    );
    expect(await wallet.balance()).toBe(4);
  });

  it("two wallets racing one quote: exactly one gets the coins", async () => {
    const cp = counterparty(SEED);
    const first = openWallet({ store: memoryStore(), mint: cp });
    const second = openWallet({ store: memoryStore(), mint: cp });
    const quote = await first.requestQuote({ amount: 2 });
    cp.settle(quote.id);
    const results = await Promise.allSettled([
      first.receiveQuote(quote.id),
      second.receiveQuote(quote.id),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect((await first.balance()) + (await second.balance())).toBe(2);
  });

  it("waits for a slow operator when asked to", async () => {
    const cp = counterparty(SEED);
    const wallet = openWallet({ store: memoryStore(), mint: cp });
    const quote = await wallet.requestQuote({ amount: 1 });
    // the operator settles after the wallet starts waiting
    setTimeout(() => cp.settle(quote.id), 50);
    const claimed = await wallet.receiveQuote(quote.id, {
      waitMs: 2000,
      pollMs: 20,
    });
    expect(claimed).toBe(1);
    expect(await wallet.balance()).toBe(1);
  });

  it("refuses an unknown quote out loud", async () => {
    const cp = counterparty(SEED);
    const wallet = openWallet({ store: memoryStore(), mint: cp });
    await expect(wallet.receiveQuote("not a quote")).rejects.toThrow(
      /does not know/,
    );
  });
});
