/**
 * The wallet. Holding, sending, receiving, checking, one person's ecash.
 *
 * It knows its mint only through the link interface: the same-page till is
 * that object, a cross-device till is another object behind the same shape.
 * Every proof it holds was born in a swap, so a token it received cannot come
 * back twice: the second receive finds the coin spent and refuses before the
 * store changes.
 */

import {
  Amount,
  blindMessage,
  constructUnblindedSignature,
  getDecodedToken,
  getEncodedToken,
  pointFromHex,
  splitAmount,
  verifyMintSignatures,
} from "@cashu/cashu-ts";
import { secretToY, type BlindedMessage, type Proof } from "@dokwa/keys";
import type { MintLink } from "./mint-link.ts";
import type { StoredProof, WalletStore } from "./types.ts";

export interface WalletOptions {
  store: WalletStore;
  mint: MintLink;
  /**
   * How the till is named in the tokens this wallet makes, when the till
   * does not name itself. A pubkey is the address the seam carries.
   */
  mintId?: string;
  now?: () => number;
}

export interface TokenCheck {
  good: boolean;
  /** the total the token carries, spendable or not */
  amount: number;
  /** what is still spendable at the mint */
  spendable: number;
  /** how many of the token's coins the mint has seen spent */
  spent: number;
  reason?: "signature" | "spent";
}

export interface Wallet {
  /** the sum of what this person holds, in the keyset unit */
  balance(): Promise<number>;
  /** what is held, largest first */
  proofs(): Promise<StoredProof[]>;
  /** take a token in: verify every proof, swap at the mint, hold the fresh ones */
  receive(token: string): Promise<number>;
  /**
   * hand out `amount`: select, swap into exact coins plus change, keep the
   * change, and return the cashu: token that carries the sent part
   */
  send(
    amount: number,
    memo?: string,
  ): Promise<{ token: string; sent: StoredProof[] }>;
  /** whether a token is still good, asked without spending it */
  check(token: string): Promise<TokenCheck>;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hex(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function sum(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/** A wallet's proof, from an unblinded signature this wallet just unblinded. */
function heldProof(
  keyset: { id: string },
  amount: number,
  secret: string,
  C: string,
  dleq: { e: string; s: string } | undefined,
  r: bigint,
  addedAt: number,
): StoredProof {
  return {
    id: keyset.id,
    amount,
    secret,
    C,
    dleq: dleq && { e: dleq.e, s: dleq.s, r: hex(r) },
    addedAt,
  };
}

export function openWallet(options: WalletOptions): Wallet {
  const { store, mint } = options;
  const now = options.now ?? (() => Date.now());

  function activeKeyset() {
    const keysets = mint.keys().keysets.filter((k) => k.active);
    const keyset = keysets[0] ?? mint.keys().keysets[0];
    if (!keyset || !keyset.keys)
      throw new Error("wallet: the mint has no usable keyset");
    return keyset;
  }

  function mintName(): string {
    return mint.describe?.().pubkey ?? options.mintId ?? "dokwa:till";
  }

  function unit(): string {
    return activeKeyset().unit;
  }

  function decode(token: string) {
    const known = mint.keys().keysets.map((k) => k.id);
    try {
      return getDecodedToken(token, known);
    } catch (error) {
      throw new Error(
        `wallet: this token does not name a keyset this mint carries: ${
          error instanceof Error ? error.message : "undecodable"
        }`,
        { cause: error },
      );
    }
  }

  /** The mint's public key for one denomination, as a point. */
  function keyFor(keyset: { keys: Record<string, string> }, amount: number) {
    const hexKey = keyset.keys[String(amount)];
    if (!hexKey)
      throw new Error(`wallet: the keyset has no denomination ${amount}`);
    return pointFromHex(hexKey);
  }

  async function verifyProofs(proofs: Proof[]): Promise<void> {
    const keysets = mint.keys().keysets;
    const verdict = await verifyMintSignatures(proofs, (id) => {
      const keyset = keysets.find((k) => k.id === id);
      if (!keyset)
        throw new Error(`wallet: no keyset ${id} is known at this mint`);
      return { id, keys: { ...keyset.keys } };
    });
    if (verdict.invalid.length > 0) {
      const first = verdict.invalid[0]!.error.message;
      throw new Error(`wallet: a proof in the token does not verify: ${first}`);
    }
  }

  async function swapToFresh(
    inputs: Proof[],
    totals: number[],
  ): Promise<StoredProof[]> {
    const keyset = activeKeyset();
    const wanted = totals.flatMap((total) =>
      splitAmount(total, keyset.keys).map((a) => a.toNumber()),
    );
    const blinded = wanted.map((amount) => {
      const secret = randomSecret();
      const raw = blindMessage(utf8(secret));
      return {
        amount,
        B_: raw.B_.toHex(true),
        id: keyset.id,
        r: raw.r,
        secret,
      };
    });
    const outputs: BlindedMessage[] = blinded.map(({ amount, B_, id }) => ({
      amount,
      B_,
      id,
    }));
    const sigs = await mint.swap(inputs, outputs);
    if (sigs.length !== blinded.length)
      throw new Error(
        "wallet: the mint returned the wrong number of signatures",
      );
    return blinded.map((b, i) => {
      const sig = sigs[i]!;
      const un = constructUnblindedSignature(
        { C_: pointFromHex(sig.C_), id: sig.id },
        b.r,
        utf8(b.secret),
        keyFor(keyset, b.amount),
      );
      return heldProof(
        keyset,
        b.amount,
        b.secret,
        un.C.toHex(true),
        sig.dleq,
        b.r,
        now(),
      );
    });
  }

  function toToken(proofs: StoredProof[], memo?: string): string {
    return getEncodedToken({
      mint: mintName(),
      unit: unit(),
      memo,
      proofs: proofs.map((p) => ({
        id: p.id,
        amount: Amount.from(p.amount),
        secret: p.secret,
        C: p.C,
      })),
    });
  }

  return {
    async balance(): Promise<number> {
      return sum((await store.allProofs()).map((p) => p.amount));
    },

    async proofs(): Promise<StoredProof[]> {
      return (await store.allProofs()).sort((a, b) => b.amount - a.amount);
    },

    async receive(token: string): Promise<number> {
      const decoded = decode(token);
      const proofs: Proof[] = decoded.proofs.map((p) => ({
        id: p.id,
        amount: p.amount.toNumber(),
        secret: p.secret,
        C: p.C,
      }));
      await verifyProofs(proofs);
      const total = sum(proofs.map((p) => p.amount));
      const fresh = await swapToFresh(proofs, [total]);
      await store.putProofs(fresh);
      return total;
    },

    async send(amount, memo): Promise<{ token: string; sent: StoredProof[] }> {
      if (!Number.isSafeInteger(amount) || amount <= 0)
        throw new Error("wallet: an amount is a positive whole number");
      const held = (await store.allProofs()).sort(
        (a, b) => b.amount - a.amount,
      );
      const selected: StoredProof[] = [];
      let selectedSum = 0;
      for (const proof of held) {
        if (selectedSum >= amount) break;
        selected.push(proof);
        selectedSum += proof.amount;
      }
      if (selectedSum < amount)
        throw new Error(
          `wallet: ${amount} is more than the ${selectedSum} held here`,
        );

      // exactly the amount and the coins already fit: no swap needed
      if (selectedSum === amount) {
        await store.removeProofs(selected.map((p) => p.secret));
        return { token: toToken(selected, memo), sent: selected };
      }

      const inputs: Proof[] = selected.map((p) => ({
        id: p.id,
        amount: p.amount,
        secret: p.secret,
        C: p.C,
      }));
      // one swap, both halves: a second swap on the same inputs would be
      // refused, and honestly so
      const fresh = await swapToFresh(inputs, [amount, selectedSum - amount]);
      const sentCount = splitAmount(amount, activeKeyset().keys).length;
      const sentProofs = fresh.slice(0, sentCount);
      const changeProofs = fresh.slice(sentCount);
      // the sent half leaves with the token; only the change stays here
      await store.putProofs(changeProofs);
      await store.removeProofs(selected.map((p) => p.secret));
      return { token: toToken(sentProofs, memo), sent: sentProofs };
    },

    async check(token): Promise<TokenCheck> {
      const decoded = decode(token);
      const proofs: Proof[] = decoded.proofs.map((p) => ({
        id: p.id,
        amount: p.amount.toNumber(),
        secret: p.secret,
        C: p.C,
      }));
      const total = sum(proofs.map((p) => p.amount));
      try {
        await verifyProofs(proofs);
      } catch {
        return {
          good: false,
          amount: total,
          spendable: 0,
          spent: 0,
          reason: "signature" as const,
        };
      }
      const states = await mint.checkstate(
        proofs.map((p) => secretToY(p.secret)),
      );
      const spent = states.filter((s) => s.state === "SPENT").length;
      const spendable = sum(
        proofs
          .filter((_, i) => states[i]?.state === "UNSPENT")
          .map((p) => p.amount),
      );
      return {
        good: spent === 0,
        amount: total,
        spendable,
        spent,
        ...(spent > 0 ? { reason: "spent" as const } : {}),
      };
    },
  };
}
