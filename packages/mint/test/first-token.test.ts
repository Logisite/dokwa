/**
 * The first real artifact, as one runnable thing.
 *
 * A till with a real keyset issues a real token string. The wallet spends it
 * through the till, and the till refuses the second spend. Run it:
 *
 *   pnpm --filter @dokwa/mint test -- first-token
 *
 * The token is a standard cashu: URI. Anyone can paste it into anything that
 * reads cashu tokens and see the mint, the unit and the proofs. The proofs
 * verify against the till's public keys, which the same run prints.
 */

import { describe, expect, it } from "vitest";
import {
  Amount,
  blindMessage,
  constructUnblindedSignature,
  getEncodedToken,
  pointFromHex,
  splitAmount,
  verifyMintSignatures,
} from "@cashu/cashu-ts";
import {
  createIdentity,
  deriveMintKeyset,
  type BlindedMessage,
} from "@dokwa/keys";
import { openMint } from "../src/mint.ts";
import { memoryStore } from "./memory.ts";

describe("the first artifact: a token string and the refusal", () => {
  it("issues real ecash and refuses its second spend", async () => {
    const seed = new Uint8Array(32);
    globalThis.crypto.getRandomValues(seed);
    const keyset = deriveMintKeyset(seed);
    const mint = openMint({
      keyset,
      identity: createIdentity(seed),
      url: "dokwa:till",
      store: memoryStore(),
    });

    // the till's public face, for whoever wants to verify the proofs
    console.log("till pubkey  :", mint.identity.pubkey);
    console.log("keyset id    :", keyset.id);
    console.log(
      "denominations:",
      Object.keys(keyset.keys).length,
      "powers of two",
    );

    const walletBlind = (amount: number, secret: string) => {
      const raw = blindMessage(new TextEncoder().encode(secret));
      return {
        amount,
        B_: raw.B_.toHex(true),
        id: keyset.id,
        r: raw.r,
        secret,
      };
    };

    const quote = await mint.createQuote({
      amount: 21,
      method: "manual",
      description: "the first real token",
    });
    await mint.settle(quote.id);

    const blinded = splitAmount(21, keyset.keys)
      .map((a) => a.toNumber())
      .map((amount, i) =>
        walletBlind(amount, `first-token-coin-${i}-${quote.id}`),
      );
    const outputs: BlindedMessage[] = blinded.map(({ amount, B_, id }) => ({
      amount,
      B_,
      id,
    }));

    const sigs = await mint.mint(quote.id, outputs);
    const proofs = blinded.map((b, i) => {
      const sig = sigs[i]!;
      const A = keyset.keys[String(b.amount)]!;
      // pointFromHex is cashu-ts's; the wallet side is the third party's maths
      const un = constructUnblindedSignature(
        { C_: pointFromHex(sig.C_), id: sig.id },
        b.r,
        new TextEncoder().encode(b.secret),
        pointFromHex(A),
      );
      return {
        id: un.id,
        amount: b.amount,
        secret: b.secret,
        C: un.C.toHex(true),
        dleq: {
          e: sig.dleq!.e,
          s: sig.dleq!.s,
          r: b.r.toString(16).padStart(64, "0"),
        },
      };
    });

    // independent verification before anything is called a token
    const verdict = await verifyMintSignatures(proofs, (id) => ({
      id,
      keys: { ...keyset.keys },
    }));
    expect(verdict.valid).toHaveLength(proofs.length);
    expect(verdict.invalid).toHaveLength(0);

    // the token string, as the contract fixes it: the standard cashu URI
    const token =
      "cashu:" +
      getEncodedToken({
        mint: mint.url,
        unit: "sat",
        memo: "the first real token",
        proofs: proofs.map((p) => ({
          id: p.id,
          amount: Amount.from(p.amount),
          secret: p.secret,
          C: p.C,
        })),
      });
    console.log("token        :", token);

    // the refusal when it is spent twice
    const change = splitAmount(21, keyset.keys)
      .map((a) => a.toNumber())
      .map((amount, i) => walletBlind(amount, `change-coin-${i}`));
    const changeOuts: BlindedMessage[] = change.map(({ amount, B_, id }) => ({
      amount,
      B_,
      id,
    }));
    await mint.swap(proofs, changeOuts);
    let refused: string;
    try {
      await mint.swap(proofs, changeOuts);
      throw new Error("the second spend was accepted, which must never happen");
    } catch (error) {
      refused = String((error as { code?: number }).code ?? error);
    }
    expect(refused).toBe("11001");
    console.log("second spend : refused with code 11001 (token already spent)");
  });
});
