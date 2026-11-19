/**
 * The provisional acquisition step: a paid quote becomes a `cashu:` token.
 *
 * This file exists because the wallet package, as merged on fddbc30, has no
 * way to acquire its first ecash. `wallet.receive` needs a token that already
 * exists, `wallet.send` needs proofs already held, and `MintLink` has no
 * quote call. The finding is board/room/20261119-015751-the-first-finding-from-
 * composing.md. The ruling is option one: `MintLink` gains `createQuote` and
 * the wallet gains `receiveQuote`, owned by crypto on feat/crypto.
 *
 * Until that lands this is the only place the composition may live, and it
 * must be deleted the day the wallet owns it. Leaving it behind would make it
 * the second implementation of the same thing, which is the failure the
 * structure document forbids.
 *
 * Nothing here is simulated: a real quote, the operator's real settle, real
 * blind signatures from the till, real unblinding, and the wallet's own
 * `receive` then verifies, swaps and stores the result.
 */

import {
  Amount,
  blindMessage,
  constructUnblindedSignature,
  getEncodedToken,
  pointFromHex,
  splitAmount,
} from "@cashu/cashu-ts";
import type { Proof } from "@dokwa/keys";
import type { Mint } from "@dokwa/mint";

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Ask the till for `amount`, pay the quote as the operator already does at
 * the counter, blind the outputs, take the signatures, unblind, and hand back
 * the standard token string.
 */
export async function issueFromQuote(
  mint: Mint,
  amount: number,
  memo: string,
): Promise<string> {
  const keysets = mint.keys().keysets;
  const keyset = keysets.find((candidate) => candidate.active) ?? keysets[0];
  if (!keyset?.keys) throw new Error("issue: the till has no usable keyset");

  const quote = await mint.createQuote({ amount, description: memo });
  await mint.settle(quote.id);

  const amounts = splitAmount(amount, keyset.keys).map((value) =>
    value.toNumber(),
  );
  const blinded = amounts.map((denomination) => {
    const secret = `issue-${denomination}-${randomSecret()}`;
    const raw = blindMessage(utf8(secret));
    return { amount: denomination, secret, raw };
  });

  const outputs = blinded.map(({ amount: denomination, raw }) => ({
    amount: denomination,
    B_: raw.B_.toHex(true),
    id: keyset.id,
  }));
  const signatures = await mint.mint(quote.id, outputs);
  if (signatures.length !== blinded.length) {
    throw new Error("issue: the till returned the wrong number of signatures");
  }

  const proofs: Proof[] = blinded.map(({ amount: denomination, secret, raw }, i) => {
    const signature = signatures[i];
    if (!signature) throw new Error("issue: a signature is missing");
    const publicKey = keyset.keys[String(denomination)];
    if (!publicKey)
      throw new Error(`issue: the keyset has no denomination ${denomination}`);
    const unblinded = constructUnblindedSignature(
      { C_: pointFromHex(signature.C_), id: signature.id },
      raw.r,
      utf8(secret),
      pointFromHex(publicKey),
    );
    return {
      id: unblinded.id,
      amount: denomination,
      secret,
      C: unblinded.C.toHex(true),
    };
  });

  return (
    "cashu:" +
    getEncodedToken({
      mint: mint.describe().pubkey,
      unit: keyset.unit,
      memo,
      proofs: proofs.map((proof) => ({
        ...proof,
        amount: Amount.from(proof.amount),
      })),
    })
  );
}
