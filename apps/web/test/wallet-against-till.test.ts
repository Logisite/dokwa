/**
 * The wallet against the till: the test build-structure.md names the most
 * valuable in the project, and the one place the layer rule allows both
 * objects to meet. Written under the fifth ruling, which grants this file
 * and nothing else under apps/web; the room inherits it as written.
 *
 * Nothing here is simulated. The till is the real openMint object with its
 * real Dexie spent list. The wallet is the real openWallet object with its
 * real Dexie proof store. The token is minted by the till, verified by
 * cashu-ts, swapped through the till, and refused the second time by the
 * same spent list a real browser tab would keep.
 *
 * The reload shape is wires' queue rig: the first page writes, then closes
 * its connections, and the second page opens the same databases and finds
 * what the first page wrote.
 *
 * Owed here, named so nobody later deletes it as paranoia: when the wallet
 * speaks the till's NUT responses over a real wire object (the peer path),
 * this rig gains the transport that lies about chunking, one response split
 * across two sends and two merged into one, because the seam promises no
 * framing and the only proof the receiver frames is a transport that lies.
 * The same-page rig cannot carry that case; the peer path will.
 */

import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";
import {
  blindMessage,
  constructUnblindedSignature,
  getEncodedToken,
  pointFromHex,
  splitAmount,
} from "@cashu/cashu-ts";
import { dbName } from "@dokwa/core";
import { createIdentity, deriveMintKeyset } from "@dokwa/keys";
import { openMint, openMintStore } from "@dokwa/mint";
import { openWallet, openWalletStore } from "@dokwa/wallet";
import { hashToCurve } from "@dokwa/keys";

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("the wallet against the till", () => {
  it("issues a real token, holds it, and refuses the second spend across a reload", async () => {
    // a real seed, a real keyset, a real till identity
    const seed = new Uint8Array(32);
    globalThis.crypto.getRandomValues(seed);
    const keyset = deriveMintKeyset(seed);
    const identity = createIdentity(seed);

    const tillDb = dbName("till");
    const walletDb = dbName({ wallet: "patron" });

    // ---------------------------------------------------------- page one --
    const tillStore = openMintStore(tillDb);
    const till = openMint({ keyset, identity, url: "dokwa:till", store: tillStore });
    const walletStore = openWalletStore(walletDb);
    const wallet = openWallet({ store: walletStore, mint: till });

    // the venue takes real cash over the counter
    const quote = await till.createQuote({ amount: 21, description: "the rig's quote" });
    await till.settle(quote.id);

    // the wallet's side of the mint, blinding with cashu-ts's own maths
    const blinded = splitAmount(21, keyset.keys)
      .map((a) => a.toNumber())
      .map((amount, i) => {
        const secret = `rig-coin-${i}-${quote.id}`;
        const raw = blindMessage(utf8(secret));
        return { amount, secret, raw };
      });
    const outputs = blinded.map(({ amount, raw }) => ({
      amount,
      B_: raw.B_.toHex(true),
      id: keyset.id,
    }));
    const sigs = await till.mint(quote.id, outputs);
    const proofs = blinded.map(({ amount, secret, raw }, i) => {
      const sig = sigs[i]!;
      const un = constructUnblindedSignature(
        { C_: pointFromHex(sig.C_), id: sig.id },
        raw.r,
        utf8(secret),
        pointFromHex(keyset.keys[String(amount)]!),
      );
      return { id: un.id, amount, secret, C: un.C.toHex(true) };
    });
    const token =
      "cashu:" +
      getEncodedToken({
        mint: till.describe().url,
        unit: "sat",
        memo: "the wallet against the till",
        proofs: proofs.map((p) => ({ ...p, amount: p.amount })),
      });

    // the wallet takes the token in: verify, swap, hold
    expect(await wallet.receive(token)).toBe(21);
    expect(await wallet.balance()).toBe(21);

    // the second spend of the same token: refused by the till's real Dexie
    // spent list, before anything new is signed
    await expect(wallet.receive(token)).rejects.toThrow();
    expect(await wallet.balance()).toBe(21);

    // a real payment: exact coins out, change kept
    const { token: paid } = await wallet.send(8, "the rig's payment");
    expect(await wallet.balance()).toBe(13);

    // ---------------------------------------------------------- page two --
    // the first page closes its connections; a reload opens them again
    tillStore.close();
    walletStore.close();
    const tillStore2 = openMintStore(tillDb);
    const till2 = openMint({ keyset, identity, url: "dokwa:till", store: tillStore2 });
    const walletStore2 = openWalletStore(walletDb);
    const wallet2 = openWallet({ store: walletStore2, mint: till2 });

    // the second page reads what the first page wrote
    expect(await wallet2.balance()).toBe(13);
    // the spent list survived the reload: the same token is still spent
    await expect(wallet2.receive(token)).rejects.toThrow();
    // the states say so without spending anything
    const states = await till2.checkstate(
      proofs.map((p) => hashToCurve(p.secret).toHex(true)),
    );
    expect(states.every((s) => s.state === "SPENT")).toBe(true);

    // the payment crosses pages too: the receiver's purse grows by 8
    expect(await wallet2.receive(paid)).toBe(8);
    expect(await wallet2.balance()).toBe(21);

    tillStore2.close();
    walletStore2.close();
  });
});
