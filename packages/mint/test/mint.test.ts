import { describe, expect, it } from "vitest";
import {
  Amount,
  blindMessage,
  constructUnblindedSignature,
  createNewMintKeys,
  getDecodedToken,
  getEncodedToken,
  getTokenMetadata,
  pointFromHex,
  splitAmount,
  verifyDLEQProof_reblind,
  verifyMintSignatures,
} from "@cashu/cashu-ts";
import {
  createIdentity,
  deriveMintKeyset,
  hashToCurve,
  signBlinded,
  type BlindedMessage,
  type MintKeyset,
} from "@dokwa/keys";
import { openMint, type Mint } from "../src/mint.ts";
import { memoryStore } from "./memory.ts";

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SEED = utf8("dokwa: the till's seed, at least sixteen bytes");

function makeTill(): { mint: Mint; keyset: MintKeyset } {
  const keyset = deriveMintKeyset(SEED);
  const mint = openMint({
    keyset,
    identity: createIdentity(SEED),
    url: "dokwa:till:test",
    store: memoryStore(),
  });
  return { mint, keyset };
}

/**
 * The wallet side, driven by cashu-ts's own primitives: it blinds, the till
 * signs, cashu-ts unblinds and verifies. Two independent implementations of
 * the same maths that must agree.
 */
function makeWallet(keyset: MintKeyset) {
  return {
    denominations(amount: number): number[] {
      return splitAmount(amount, keyset.keys).map((a) => a.toNumber());
    },
    blind(amount: number, secret: string) {
      const raw = blindMessage(utf8(secret));
      return {
        amount,
        B_: raw.B_.toHex(true),
        id: keyset.id,
        r: raw.r,
        secret,
      };
    },
    unblind(
      blinded: { amount: number; r: bigint; secret: string },
      signature: { id: string; C_: string; dleq?: { e: string; s: string } },
    ) {
      const A = pointFromHex(keyset.keys[String(blinded.amount)]!);
      const un = constructUnblindedSignature(
        { C_: pointFromHex(signature.C_), id: signature.id },
        blinded.r,
        utf8(blinded.secret),
        A,
      );
      return {
        id: un.id,
        amount: blinded.amount,
        secret: blinded.secret,
        C: un.C.toHex(true),
        // NUT-12: the proof carries the wallet's blinding factor with the
        // mint's e and s, so a stranger can verify with only public keys.
        // cashu-ts reads the serialised r as hex.
        dleq: signature.dleq && {
          e: signature.dleq.e,
          s: signature.dleq.s,
          r: blinded.r.toString(16).padStart(64, "0"),
        },
      };
    },
  };
}

type Wallet = ReturnType<typeof makeWallet>;

function outs(
  blinded: Array<{ amount: number; B_: string; id: string }>,
): BlindedMessage[] {
  return blinded.map(({ amount, B_, id }) => ({ amount, B_, id }));
}

describe("the keyset agrees with cashu-ts, byte for byte", () => {
  it("createNewMintKeys from the same seed derives the same private keys", () => {
    const mine = deriveMintKeyset(SEED, { denominations: 8 });
    const theirs = createNewMintKeys(8, SEED, { unit: "sat" });
    expect(Object.keys(mine.secretKeys)).toEqual(Object.keys(theirs.privKeys));
    for (const [amount, secret] of Object.entries(theirs.privKeys)) {
      expect(hex(mine.secretKeys[amount]!)).toBe(hex(secret));
    }
  });

  it("and therefore the same keyset id", () => {
    const mine = deriveMintKeyset(SEED, { denominations: 8 });
    const theirs = createNewMintKeys(8, SEED, { unit: "sat" });
    expect(mine.id).toBe(theirs.keysetId);
  });

  it("a blind signature made here verifies under cashu-ts's DLEQ checker", () => {
    const keyset = deriveMintKeyset(SEED, { denominations: 8 });
    const wallet = makeWallet(keyset);
    const secret = "a coin only the till could have signed";
    const blinded = wallet.blind(4, secret);
    const signed = signBlinded(
      keyset,
      { amount: 4, B_: blinded.B_, id: keyset.id },
      { dleq: true },
    );
    const proof = wallet.unblind(blinded, signed);
    const ok = verifyDLEQProof_reblind(
      utf8(secret),
      {
        e: Uint8Array.from(
          signed.dleq!.e.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16)),
        ),
        s: Uint8Array.from(
          signed.dleq!.s.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16)),
        ),
        r: blinded.r,
      },
      pointFromHex(proof.C),
      pointFromHex(keyset.keys["4"]!),
    );
    expect(ok).toBe(true);
  });

  it("cashu-ts refuses the same signature with a different blinding factor", () => {
    const keyset = deriveMintKeyset(SEED, { denominations: 8 });
    const wallet = makeWallet(keyset);
    const blinded = wallet.blind(4, "a coin checked by a stranger");
    const signed = signBlinded(
      keyset,
      { amount: 4, B_: blinded.B_, id: keyset.id },
      { dleq: true },
    );
    const proof = wallet.unblind(blinded, signed);
    const ok = verifyDLEQProof_reblind(
      utf8("a coin checked by a stranger"),
      {
        e: Uint8Array.from(
          signed.dleq!.e.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16)),
        ),
        s: Uint8Array.from(
          signed.dleq!.s.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16)),
        ),
        r: blinded.r + 1n,
      },
      pointFromHex(proof.C),
      pointFromHex(keyset.keys["4"]!),
    );
    expect(ok).toBe(false);
  });
});

describe("the till, against the wallet", () => {
  it("issues a quote, settles it, mints the coins, and refuses a second mint", async () => {
    const { mint, keyset } = makeTill();
    const wallet = makeWallet(keyset);
    const quote = await mint.createQuote({
      amount: 21,
      description: "the door",
    });
    expect(quote.state).toBe("UNPAID");

    const blinded = wallet
      .denominations(21)
      .map((amount, i) => wallet.blind(amount, `door-coin-${i}`));
    const outputs = outs(blinded);

    // minting before payment is refused, and an unknown quote too
    await expect(mint.mint(quote.id, outputs)).rejects.toMatchObject({
      code: 10003,
    });
    await expect(mint.mint("no such quote", outputs)).rejects.toMatchObject({
      code: 10003,
    });

    await mint.settle(quote.id);

    // a total that is not the quote's is refused even though it is paid
    await expect(
      mint.mint(quote.id, outputs.slice(0, 1)),
    ).rejects.toMatchObject({
      code: 20003,
    });

    const sigs = await mint.mint(quote.id, outputs);
    expect(sigs).toHaveLength(blinded.length);
    // the quote is spent once: a second mint is refused
    await expect(mint.mint(quote.id, outputs)).rejects.toMatchObject({
      code: 10005,
    });

    const proofs = blinded.map((b, i) => wallet.unblind(b, sigs[i]!));
    // every proof verifies through cashu-ts, an implementation the till is not
    const verdict = await verifyMintSignatures(proofs, (id) => {
      expect(id).toBe(keyset.id);
      return { id, keys: { ...keyset.keys } };
    });
    if (verdict.valid.length !== proofs.length) {
      throw new Error(
        "verifyMintSignatures: valid=" +
          verdict.valid.length +
          " invalid=" +
          JSON.stringify(verdict.invalid.map((v) => String(v.error))),
      );
    }
    expect(verdict.valid).toHaveLength(proofs.length);
    expect(verdict.invalid).toHaveLength(0);
  });

  it("the token is a real cashu: URI that cashu-ts reads back", async () => {
    const { mint, keyset } = makeTill();
    const wallet = makeWallet(keyset);
    const quote = await mint.createQuote({
      amount: 21,
      description: "the door",
    });
    await mint.settle(quote.id);
    const blinded = wallet
      .denominations(21)
      .map((amount, i) => wallet.blind(amount, `token-coin-${i}`));
    const sigs = await mint.mint(quote.id, outs(blinded));
    const proofs = blinded.map((b, i) => wallet.unblind(b, sigs[i]!));

    const token =
      "cashu:" +
      getEncodedToken({
        mint: mint.url,
        unit: "sat",
        memo: "for the door",
        proofs: proofs.map((p) => ({
          id: p.id,
          amount: Amount.from(p.amount),
          secret: p.secret,
          C: p.C,
        })),
      });
    expect(token.startsWith("cashu:")).toBe(true);

    const metadata = getTokenMetadata(token);
    expect(metadata.unit).toBe("sat");
    expect(metadata.mint).toBe(mint.url);

    const decoded = getDecodedToken(token, [keyset.id]);
    expect(decoded.memo).toBe("for the door");
    expect(decoded.proofs).toHaveLength(proofs.length);
    for (const p of proofs) {
      const found = decoded.proofs.find(
        (d) => d.secret === p.secret && d.C === p.C && d.id === keyset.id,
      );
      expect(found).toBeDefined();
    }
  });
});

describe("the spent list", () => {
  it("refuses the second spend of a bundle: whole or nothing", async () => {
    const { mint, keyset } = makeTill();
    const wallet = makeWallet(keyset);
    const quote = await mint.createQuote({ amount: 8 });
    await mint.settle(quote.id);
    const blinded = wallet
      .denominations(8)
      .map((amount, i) => wallet.blind(amount, `walk-in-coin-${i}`));
    const sigs = await mint.mint(quote.id, outs(blinded));
    const proofs = blinded.map((b, i) => wallet.unblind(b, sigs[i]!));

    // the fresh outputs the spender asks for on the way out
    const change = wallet
      .denominations(8)
      .map((amount, i) => wallet.blind(amount, `change-coin-${i}`));

    // first spend: accepted
    await mint.swap(proofs, outs(change));

    // the same inputs again: refused
    await expect(mint.swap(proofs, outs(change))).rejects.toMatchObject({
      code: 11001,
    });

    // a bundle where only one coin is spent is refused whole
    const stillGood = stillGoodProof(keyset, wallet);
    const halfSpent = [proofs[0]!, stillGood];
    const spareChange = wallet
      .denominations(9)
      .map((amount, i) => wallet.blind(amount, `spare-coin-${i}`));
    await expect(mint.swap(halfSpent, outs(spareChange))).rejects.toMatchObject(
      {
        code: 11001,
      },
    );
    // and nothing from the refused bundle was recorded
    for (const spare of spareChange) {
      const states = await mint.checkstate([
        hashToCurve(spare.secret).toHex(true),
      ]);
      expect(states[0]!.state).toBe("UNSPENT");
    }

    // states are readable without spending
    const spentStates = await mint.checkstate(
      proofs.map((p) => hashToCurve(p.secret).toHex(true)),
    );
    expect(spentStates.every((s) => s.state === "SPENT")).toBe(true);
    const goodState = await mint.checkstate([
      hashToCurve(stillGood.secret).toHex(true),
    ]);
    expect(goodState[0]!.state).toBe("UNSPENT");
  });

  it("refuses a counterfeit before anything is recorded", async () => {
    const { mint, keyset } = makeTill();
    const other = deriveMintKeyset(utf8("another till's seed, sixteen bytes"));
    const forger = makeWallet(other);
    const tillWallet = makeWallet(keyset);
    const blinded = forger.blind(1, "counterfeit");
    const signed = signBlinded(
      other,
      { amount: 1, B_: blinded.B_, id: other.id },
      { dleq: false },
    );
    const counterfeit = forger.unblind(blinded, signed);
    const change = tillWallet.blind(1, "never-minted");
    await expect(
      mint.swap([counterfeit], outs([change])),
    ).rejects.toMatchObject({ code: 20007 });
    // and the output it would have signed is still unspent territory
    const states = await mint.checkstate([
      hashToCurve(change.secret).toHex(true),
    ]);
    expect(states[0]!.state).toBe("UNSPENT");
  });

  it("refuses inputs that sum to something the outputs do not", async () => {
    const { mint, keyset } = makeTill();
    const wallet = makeWallet(keyset);
    const quote = await mint.createQuote({ amount: 4 });
    await mint.settle(quote.id);
    const blinded = wallet
      .denominations(4)
      .map((a, i) => wallet.blind(a, `sum-coin-${i}`));
    const sigs = await mint.mint(quote.id, outs(blinded));
    const proofs = blinded.map((b, i) => wallet.unblind(b, sigs[i]!));
    const change = wallet
      .denominations(3)
      .map((a, i) => wallet.blind(a, `short-${i}`));
    await expect(mint.swap(proofs, outs(change))).rejects.toMatchObject({
      code: 20003,
    });
  });

  it("refuses to sign a blinded message for a keyset it does not hold", async () => {
    const { mint } = makeTill();
    const quote = await mint.createQuote({ amount: 1 });
    await mint.settle(quote.id);
    const foreign = deriveMintKeyset(utf8("a foreign till, sixteen bytes"));
    const foreignWallet = makeWallet(foreign);
    await expect(
      mint.mint(quote.id, outs([foreignWallet.blind(1, "wrong keyset")])),
    ).rejects.toMatchObject({ code: 20006 });
  });
});

function stillGoodProof(keyset: MintKeyset, wallet: Wallet) {
  const blinded = wallet.blind(1, "a coin still good");
  const signed = signBlinded(keyset, {
    amount: 1,
    B_: blinded.B_,
    id: keyset.id,
  });
  return wallet.unblind(blinded, signed);
}
