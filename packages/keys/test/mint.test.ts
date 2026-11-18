import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  deriveMintKeyset,
  hashToCurve,
  keysetId,
  publicKeyset,
  serialisePublicKeyset,
  secretToY,
  signBlinded,
  validateBlindedMessage,
  verifyDleq,
  verifyProof,
} from "../src/mint.ts";

// The wallet side of the maths, written here from the NUT-00 rule rather than
// imported from the source under test. Blinding: B_ = Y + rG, where Y is
// hash_to_curve(secret). Signing: C_ = aB_. Unblinding: C = C_ - rA, where
// A is the mint's public key for the denomination. If the mint signed with a,
// then aY equals C, which is what verifyProof checks.
const Point = secp256k1.Point;
const Fn = Point.Fn;

function randomScalar(): bigint {
  const bytes = secp256k1.utils.randomSecretKey();
  return Fn.fromBytes(bytes) || 1n;
}

function blind(secret: string) {
  const r = randomScalar();
  const Y = hashToCurve(secret);
  const B_ = Y.add(Point.BASE.multiply(r));
  return { r, B_: B_.toHex(true) };
}

function unblind(C_: string, r: bigint, mintPubkeyHex: string): string {
  const A = Point.fromHex(mintPubkeyHex);
  const C = Point.fromHex(C_).subtract(A.multiply(r));
  return C.toHex(true);
}

function toProof(
  keyset: ReturnType<typeof deriveMintKeyset>,
  amount: number,
  secret: string,
  blinded: { r: bigint; B_: string },
) {
  const sig = signBlinded(
    keyset,
    { amount, B_: blinded.B_, id: keyset.id },
    { dleq: true },
  );
  const C = unblind(sig.C_, blinded.r, keyset.keys[String(amount)]!);
  return {
    sig,
    proof: {
      id: keyset.id,
      amount,
      secret,
      C,
      dleq: { e: sig.dleq!.e, s: sig.dleq!.s, r: blinded.r.toString() },
    },
  };
}

describe("keysets", () => {
  it("derives the same keys from the same seed", () => {
    const seed = utf8ToBytes("dokwa: the till's seed");
    const a = deriveMintKeyset(seed);
    const b = deriveMintKeyset(seed);
    expect(a.id).toBe(b.id);
    expect(a.keys).toEqual(b.keys);
    expect(a.keys["1"]).toBeDefined();
    expect(a.keys["8"]).toBeDefined();
  });

  it("derives different keys from different seeds", () => {
    const a = deriveMintKeyset(utf8ToBytes("one seed, at least sixteen bytes"));
    const b = deriveMintKeyset(utf8ToBytes("another seed, also long enough"));
    expect(a.id).not.toBe(b.id);
  });

  it("computes the id from the public keys alone, by the rule written here", () => {
    const keyset = deriveMintKeyset(utf8ToBytes("dokwa: the till's seed"));
    const preimage = Object.entries(keyset.keys)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([amount, key]) => `${amount}:${key}`)
      .join(",");
    const expected =
      "01" + bytesToHex(sha256(utf8ToBytes(`${preimage}|unit:${keyset.unit}`)));
    expect(keyset.id).toBe(expected);
    expect(keysetId(keyset.keys, "sat")).toBe(expected);
  });

  it("the public half carries no secret keys", () => {
    const keyset = deriveMintKeyset(utf8ToBytes("dokwa: the till's seed"));
    const pub = serialisePublicKeyset(keyset);
    expect(JSON.stringify(pub)).not.toContain("secretKeys");
    expect(Object.keys(pub.keys)).toEqual(Object.keys(keyset.keys));
    // and the exported public-only view too
    expect(publicKeyset(keyset).keys).toEqual(keyset.keys);
  });

  it("refuses a seed that is too small", () => {
    expect(() => deriveMintKeyset(new Uint8Array(8))).toThrow();
  });
});

describe("hash to curve", () => {
  const SECP_P = 2n ** 256n - 2n ** 32n - 977n;

  it("is deterministic", () => {
    const a = hashToCurve("one secret").toHex(true);
    const b = hashToCurve("one secret").toHex(true);
    expect(a).toBe(b);
    expect(secretToY("one secret")).toBe(a);
  });

  it("gives different points for different secrets", () => {
    expect(hashToCurve("one secret").toHex(true)).not.toBe(
      hashToCurve("another secret").toHex(true),
    );
  });

  it("produces a point that satisfies the curve equation", () => {
    const Y = hashToCurve("on curve or not at all");
    // y^2 = x^3 + 7 (mod p), checked with plain bigint arithmetic
    const { x, y } = Y.toAffine();
    expect((y * y - (x * x * x + 7n)) % SECP_P).toBe(0n);
  });

  it("the recorded Y equals the point for the secret string or its bytes", () => {
    const secret = utf8ToBytes("bytes or string, same result");
    expect(secretToY("bytes or string, same result")).toBe(secretToY(secret));
  });
});

describe("blind signing", () => {
  const keyset = deriveMintKeyset(utf8ToBytes("dokwa: the till's seed"));

  it("a blinded signature unblinds into a proof the mint verifies", () => {
    const secret = "a real secret, 018f style";
    const blinded = blind(secret);
    const { proof } = toProof(keyset, 8, secret, blinded);
    expect(verifyProof(keyset, proof)).toBe(true);
  });

  it("a proof the mint did not make is refused", () => {
    const other = deriveMintKeyset(
      utf8ToBytes("another till's seed, long enough"),
    );
    const secret = "a real secret";
    const blinded = blind(secret);
    const { proof } = toProof(other, 4, secret, blinded);
    expect(verifyProof(keyset, proof)).toBe(false);
  });

  it("a changed secret does not verify", () => {
    const blinded = blind("the original secret");
    const { proof } = toProof(keyset, 1, "the original secret", blinded);
    expect(
      verifyProof(keyset, { ...proof, secret: "the original secres" }),
    ).toBe(false);
  });

  it("refuses to sign for the wrong keyset or an unknown amount", () => {
    const { B_ } = blind("s");
    expect(() =>
      signBlinded(keyset, { amount: 1, B_, id: "00" + "f".repeat(64) }),
    ).toThrow();
    expect(() =>
      signBlinded(keyset, { amount: 3, B_, id: keyset.id }),
    ).toThrow();
  });

  it("validate refuses a malformed blinded point before any secret is recorded", () => {
    expect(() =>
      validateBlindedMessage(keyset, { amount: 1, B_: "zz", id: keyset.id }),
    ).toThrow();
    expect(() =>
      validateBlindedMessage(keyset, {
        amount: 1,
        B_: "02" + "0".repeat(64),
        id: keyset.id,
      }),
    ).toThrow();
    expect(() =>
      validateBlindedMessage(keyset, {
        amount: 7,
        B_: blind("x").B_,
        id: keyset.id,
      }),
    ).toThrow();
    expect(() =>
      validateBlindedMessage(keyset, {
        amount: 1,
        B_: blind("x").B_,
        id: keyset.id,
      }),
    ).not.toThrow();
  });

  it("the denomination ladder is powers of two", () => {
    const keyset = deriveMintKeyset(utf8ToBytes("dokwa: the till's seed"), {
      denominations: 5,
    });
    expect(
      Object.keys(keyset.keys).sort((a, b) => Number(a) - Number(b)),
    ).toEqual(["1", "2", "4", "8", "16"]);
  });
});

describe("DLEQ, NUT-12", () => {
  const keyset = deriveMintKeyset(utf8ToBytes("dokwa: the till's seed"));

  it("a proof with its blinding factor verifies with only the public key", () => {
    const secret = "a checked coin";
    const blinded = blind(secret);
    const { proof } = toProof(keyset, 4, secret, blinded);
    expect(verifyDleq(keyset, proof)).toBe(true);
  });

  it("refuses when the blinding factor is missing or lies", () => {
    const secret = "a checked coin";
    const blinded = blind(secret);
    const { proof } = toProof(keyset, 4, secret, blinded);
    expect(
      verifyDleq(keyset, {
        ...proof,
        dleq: { e: proof.dleq!.e, s: proof.dleq!.s },
      }),
    ).toBe(false);
    expect(
      verifyDleq(keyset, {
        ...proof,
        dleq: {
          e: proof.dleq!.e,
          s: proof.dleq!.s,
          r: (blinded.r + 1n).toString(),
        },
      }),
    ).toBe(false);
  });

  it("refuses a dleq from another keyset's signature", () => {
    const other = deriveMintKeyset(
      utf8ToBytes("another till's seed, long enough"),
    );
    const secret = "borrowed dleq";
    const blinded = blind(secret);
    const { proof } = toProof(other, 2, secret, blinded);
    expect(verifyDleq(keyset, { ...proof, id: keyset.id })).toBe(false);
  });
});

describe("BIP32 shape", () => {
  it("uses HMAC-SHA512 at the master node, as BIP32 requires", () => {
    // The master secret is HMAC-SHA512("Bitcoin seed", seed): 64 bytes, the
    // key and the chain code one half each. A 32-byte digest would mean an
    // empty chain code and a keyset no other library could derive.
    const seed = utf8ToBytes("dokwa: the till's seed");
    const i = hmac(sha512, utf8ToBytes("Bitcoin seed"), seed);
    expect(i.length).toBe(64);
    expect(i.slice(0, 32).length).toBe(32);
    expect(i.slice(32).length).toBe(32);
  });

  it("uses HMAC-SHA512 at every child step", () => {
    const seed = utf8ToBytes("dokwa: the till's seed");
    const i = hmac(sha512, utf8ToBytes("Bitcoin seed"), seed);
    const master = { key: i.slice(0, 32), chain: i.slice(32) };
    const pub = secp256k1.getPublicKey(master.key, true);
    expect(pub.length).toBe(33);
    // hardened: 0x00 || key || index(4, big endian) = 37 bytes of HMAC input
    const data = concatBytes(
      new Uint8Array([0]),
      master.key,
      new Uint8Array([0x80, 0, 0, 0]),
    );
    expect(data.length).toBe(37);
    expect(hmac(sha512, master.chain, data).length).toBe(64);
  });
});
