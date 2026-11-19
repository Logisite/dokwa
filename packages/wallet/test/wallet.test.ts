import { describe, expect, it } from "vitest";
import {
  Amount,
  blindMessage,
  constructUnblindedSignature,
  getEncodedToken,
  pointFromHex,
  splitAmount,
} from "@cashu/cashu-ts";
import type { BlindedMessage } from "@dokwa/keys";
import { openWallet } from "../src/wallet.ts";
import { memoryStore } from "./memory.ts";
import { counterparty } from "./counterparty.ts";

const SEED = new TextEncoder().encode("dokwa: a till seed, sixteen bytes plus");
const OTHER_SEED = new TextEncoder().encode(
  "dokwa: another till entirely, sixteen bytes",
);

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** A wallet whose mint is the counterparty, with an in-memory store. */
function walletFor(cp: ReturnType<typeof counterparty>) {
  return openWallet({ store: memoryStore(), mint: cp });
}

/** The counterparty hands out a real token, as a venue handing over cash. */
function tokenFrom(
  cp: ReturnType<typeof counterparty>,
  amount: number,
  label: string,
): string {
  const parts = splitAmount(amount, cp.keyset.keys).map((a) => a.toNumber());
  const blinded = parts.map((part, i) => {
    const secret = `${label}-coin-${i}`;
    const raw = blindMessage(utf8(secret));
    return { part, secret, raw };
  });
  const outputs: BlindedMessage[] = blinded.map(({ part, raw }) => ({
    amount: part,
    B_: raw.B_.toHex(true),
    id: cp.keyset.id,
  }));
  const sigs = cp.issue(outputs);
  const proofs = blinded.map(({ part, secret, raw }, i) => {
    const sig = sigs[i]!;
    const un = constructUnblindedSignature(
      { C_: pointFromHex(sig.C_), id: sig.id },
      raw.r,
      utf8(secret),
      pointFromHex(cp.keyset.keys[String(part)]!),
    );
    return {
      id: un.id,
      amount: part,
      secret,
      C: un.C.toHex(true),
    };
  });
  return getEncodedToken({
    mint: cp.describe?.().pubkey ?? "dokwa:till",
    unit: "sat",
    memo: label,
    proofs: proofs.map((p) => ({
      id: p.id,
      amount: Amount.from(p.amount),
      secret: p.secret,
      C: p.C,
    })),
  });
}

describe("holding", () => {
  it("starts empty and stays consistent", async () => {
    const wallet = walletFor(counterparty(SEED));
    expect(await wallet.balance()).toBe(0);
    expect(await wallet.proofs()).toEqual([]);
  });
});

describe("receiving", () => {
  it("takes a real token in, verifies it, swaps it, and holds the fresh coins", async () => {
    const cp = counterparty(SEED);
    const wallet = walletFor(cp);
    const token = tokenFrom(cp, 21, "for the door");
    const received = await wallet.receive(token);
    expect(received).toBe(21);
    expect(await wallet.balance()).toBe(21);
    // the held proofs are fresh: the originals are spent at the mint
    const held = await wallet.proofs();
    expect(sum(held)).toBe(21);
    const originalYs = held.map((p) => p.secret);
    expect(originalYs.every((s) => !s.startsWith("for the door-coin"))).toBe(
      true,
    );
  });

  it("refuses the same token twice, and the balance does not double", async () => {
    const cp = counterparty(SEED);
    const wallet = walletFor(cp);
    const token = tokenFrom(cp, 21, "replayed");
    await wallet.receive(token);
    expect(await wallet.balance()).toBe(21);
    await expect(wallet.receive(token)).rejects.toThrow(/spent|verify/);
    expect(await wallet.balance()).toBe(21);
  });

  it("refuses a token signed by a mint it does not know", async () => {
    const cp = counterparty(SEED);
    const stranger = counterparty(OTHER_SEED);
    const wallet = walletFor(cp);
    const foreign = tokenFrom(stranger, 8, "counterfeit origin");
    await expect(wallet.receive(foreign)).rejects.toThrow(
      /does not name a keyset|does not verify/,
    );
    expect(await wallet.balance()).toBe(0);
  });
});

describe("sending", () => {
  it("sends exact coins and keeps the change", async () => {
    const cp = counterparty(SEED);
    const wallet = walletFor(cp);
    await wallet.receive(tokenFrom(cp, 21, "purse"));
    const { token, sent } = await wallet.send(8, "a lesson");
    expect(sum(sent)).toBe(8);
    // the change stayed: 21 - 8
    expect(await wallet.balance()).toBe(13);
    // the token decodes to the sent amount and nothing else
    const decoded = await wallet.check(token);
    expect(decoded.amount).toBe(8);
    expect(decoded.good).toBe(true);
  });

  it("hands over the whole purse when the amount matches it exactly", async () => {
    const cp = counterparty(SEED);
    const wallet = walletFor(cp);
    await wallet.receive(tokenFrom(cp, 16, "exact purse"));
    const { sent } = await wallet.send(16);
    expect(sum(sent)).toBe(16);
    expect(await wallet.balance()).toBe(0);
  });

  it("refuses to send more than it holds", async () => {
    const cp = counterparty(SEED);
    const wallet = walletFor(cp);
    await wallet.receive(tokenFrom(cp, 8, "small purse"));
    await expect(wallet.send(9)).rejects.toThrow(/more than the/);
    // and the refusal changed nothing
    expect(await wallet.balance()).toBe(8);
  });
});

describe("two wallets, one counterparty", () => {
  it("a sent token lands in the receiver's purse, once", async () => {
    const cp = counterparty(SEED);
    const giver = walletFor(cp);
    const taker = walletFor(cp);
    await giver.receive(tokenFrom(cp, 21, "the payment"));
    const { token } = await giver.send(13, "the payment");
    expect(await taker.receive(token)).toBe(13);
    expect(await taker.balance()).toBe(13);
    expect(await giver.balance()).toBe(8);
    // the receiver's held coins are new coins: the sent ones are spent
    await expect(taker.receive(token)).rejects.toThrow(/spent|verify/);
    expect(await taker.balance()).toBe(13);
  });

  it("checking a token costs nothing and does not spend it", async () => {
    const cp = counterparty(SEED);
    const wallet = walletFor(cp);
    const token = tokenFrom(cp, 4, "on the counter");
    const before = await wallet.check(token);
    expect(before).toMatchObject({
      good: true,
      amount: 4,
      spendable: 4,
      spent: 0,
    });
    await wallet.receive(token);
    const after = await wallet.check(token);
    expect(after).toMatchObject({
      good: false,
      amount: 4,
      spendable: 0,
      spent: 1,
      reason: "spent",
    });
    // checking never moved the balance
    expect(await wallet.balance()).toBe(4);
  });
});

function sum(proofs: Array<{ amount: number }>): number {
  return proofs.reduce((total, p) => total + p.amount, 0);
}
