/**
 * The signing maths for ecash.
 *
 * NUT-02 keysets, NUT-00 hash-to-curve and blinding, NUT-01 signatures. This
 * is the side of the desk that holds the private keys; a wallet only needs the
 * public half and the unblinding step.
 *
 * It is written against `@noble/curves` directly, not against the wallet
 * library, so that a test can make the two disagree. They must not.
 */

import type { Unit } from "@dokwa/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToNumberBE } from "@noble/curves/utils.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
} from "@noble/hashes/utils.js";

const Point = secp256k1.Point;
const Fn = Point.Fn;

const HASH_TO_CURVE_TAG = utf8ToBytes("Secp256k1_HashToCurve_Cashu_");
const DLEQ_TAG = utf8ToBytes("Cashu_DLEQ_R_v1");

const MAX_HASH_TO_CURVE_ATTEMPTS = 2 ** 16;
const MAX_DLEQ_ATTEMPTS = 256;

export interface MintKeyset {
  /** NUT-02 keyset id, hex */
  readonly id: string;
  readonly unit: Unit;
  /** denomination in the keyset unit, as a decimal string, to compressed public key hex */
  readonly keys: Readonly<Record<string, string>>;
  /** denomination to 32-byte secret key. Never leaves the till. */
  readonly secretKeys: Readonly<Record<string, Uint8Array>>;
}

export interface MintKeysetOptions {
  unit?: Unit;
  /** how many powers of two, starting at 1 sat. 32 covers 2^31 sats. */
  denominations?: number;
}

export interface BlindedMessage {
  /** denomination */
  amount: number;
  /** blinded point, compressed hex */
  B_: string;
  /** keyset id */
  id: string;
}

export interface BlindedSignature {
  id: string;
  amount: number;
  /** signed blinded point, compressed hex */
  C_: string;
  dleq?: { e: string; s: string };
}

export interface Proof {
  id: string;
  amount: number;
  secret: string;
  /** unblinded signature, compressed hex */
  C: string;
  /** e and s from the mint, r from the wallet that unblinded it (NUT-12) */
  dleq?: { e: string; s: string; r?: string };
}

// ---------------------------------------------------------------- NUT-02 ---

function serialise32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, false);
  return bytes;
}

interface Bip32Node {
  key: Uint8Array;
  chain: Uint8Array;
}

// BIP32 is HMAC-SHA512, not SHA-256: the master node and every child both
// need the 64-byte digest, and the chain code is its second half. An empty
// chain code would be a keyset no other library could derive from this seed.
function masterNode(seed: Uint8Array): Bip32Node {
  const i = hmac(sha512, utf8ToBytes("Bitcoin seed"), seed);
  return { key: i.slice(0, 32), chain: i.slice(32) };
}

/**
 * One BIP32 child. The path used by NUT-02 for a keyset is
 * `m/0'/0'/0'/<counter>`, so the last step is not hardened.
 */
function childNode(parent: Bip32Node, index: number): Bip32Node {
  const hardened = index >= 0x80000000;
  const data = hardened
    ? concatBytes(new Uint8Array([0]), parent.key, serialise32(index))
    : concatBytes(secp256k1.getPublicKey(parent.key, true), serialise32(index));
  const i = hmac(sha512, parent.chain, data);
  const left = bytesToNumberBE(i.slice(0, 32));
  if (left === 0n || left >= Fn.ORDER)
    throw new Error("dokwa: BIP32 produced an invalid key");
  const key = Fn.toBytes(Fn.add(Fn.fromBytes(parent.key), left));
  return { key, chain: i.slice(32) };
}

/** NUT-02 v1: `01` followed by sha256 of `amount:key,...|unit:<unit>`. */
export function keysetId(
  keys: Readonly<Record<string, string>>,
  unit: Unit = "sat",
): string {
  const preimage = Object.entries(keys)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([amount, key]) => `${amount}:${key}`)
    .join(",");
  return "01" + bytesToHex(sha256(utf8ToBytes(`${preimage}|unit:${unit}`)));
}

/**
 * Derive a whole keyset from one seed. The seed is the dangerous secret; the
 * keyset id is derived from the public keys, so two devices that agree on the
 * seed agree on the keyset without being told.
 */
export function deriveMintKeyset(
  seed: Uint8Array,
  options: MintKeysetOptions = {},
): MintKeyset {
  const unit = options.unit ?? "sat";
  const denominations = options.denominations ?? 32;
  if (seed.length < 16) throw new Error("dokwa: a seed is at least 16 bytes");
  if (!Number.isInteger(denominations) || denominations < 1)
    throw new Error("dokwa: a keyset has at least one denomination");

  const root = masterNode(seed);
  const first = childNode(
    childNode(childNode(root, 0x80000000), 0x80000000),
    0x80000000,
  );
  const keys: Record<string, string> = {};
  const secretKeys: Record<string, Uint8Array> = {};
  for (let i = 0; i < denominations; i += 1) {
    const node = childNode(first, i);
    const amount = (2n ** BigInt(i)).toString();
    secretKeys[amount] = node.key;
    keys[amount] = bytesToHex(secp256k1.getPublicKey(node.key, true));
  }
  return { id: keysetId(keys, unit), unit, keys, secretKeys };
}

/** The public half, which is all a wallet needs. */
export function publicKeyset(
  keyset: MintKeyset,
): Pick<MintKeyset, "id" | "unit" | "keys"> {
  return { id: keyset.id, unit: keyset.unit, keys: keyset.keys };
}

// ---------------------------------------------------------------- NUT-00 ---

/** NUT-00 hash-to-curve: a tagged hash and a little-endian counter. */
export function hashToCurve(secret: string | Uint8Array): typeof Point.BASE {
  const secretBytes = typeof secret === "string" ? utf8ToBytes(secret) : secret;
  const msgToHash = sha256(concatBytes(HASH_TO_CURVE_TAG, secretBytes));
  const counter = new Uint8Array(4);
  const view = new DataView(counter.buffer);
  for (let i = 0; i < MAX_HASH_TO_CURVE_ATTEMPTS; i += 1) {
    view.setUint32(0, i, true);
    const hash = sha256(concatBytes(msgToHash, counter));
    try {
      return Point.fromHex(
        bytesToHex(concatBytes(new Uint8Array([0x02]), hash)),
      );
    } catch {
      // not a point on this curve; the counter moves
    }
  }
  throw new Error("dokwa: no curve point found for this secret");
}

/**
 * Y, the point a spent list records. Compressed hex. The secret is whatever
 * the proof carries: a string on our side, bytes when a wallet library hands
 * one over, and hash-to-curve already takes both.
 */
export function secretToY(secret: string | Uint8Array): string {
  return hashToCurve(secret).toHex(true);
}

// ---------------------------------------------------------------- NUT-12 ---

function hashE(points: Array<typeof Point.BASE>): Uint8Array {
  return sha256(
    utf8ToBytes(points.map((point) => point.toHex(false)).join("")),
  );
}

function dleqNonce(
  secretKey: Uint8Array,
  A: typeof Point.BASE,
  B_: typeof Point.BASE,
  C_: typeof Point.BASE,
): bigint {
  const base = concatBytes(
    DLEQ_TAG,
    A.toBytes(false),
    B_.toBytes(false),
    C_.toBytes(false),
  );
  for (let counter = 0; counter < MAX_DLEQ_ATTEMPTS; counter += 1) {
    const digest = hmac(
      sha256,
      secretKey,
      concatBytes(base, new Uint8Array([counter])),
    );
    const value = bytesToNumberBE(digest);
    if (value > 0n && value < Fn.ORDER) return value;
  }
  throw new Error("dokwa: DLEQ nonce derivation failed");
}

function dleqFor(
  B_: typeof Point.BASE,
  secretKey: Uint8Array,
): { e: string; s: string } {
  const a = Fn.fromBytes(secretKey);
  const A = Point.BASE.multiply(a);
  const C_ = B_.multiply(a);
  const r = dleqNonce(secretKey, A, B_, C_);
  const e = hashE([Point.BASE.multiply(r), B_.multiply(r), A, C_]);
  const scalarE = Fn.fromBytes(e);
  const s = Fn.add(r, Fn.mul(scalarE, a));
  return { e: bytesToHex(e), s: bytesToHex(Fn.toBytes(s)) };
}

// ----------------------------------------------------------- NUT-01 sign ---

function signingKey(keyset: MintKeyset, amount: number): Uint8Array {
  const key = keyset.secretKeys[String(amount)];
  if (!key)
    throw new Error(`dokwa: the keyset has no key for amount ${amount}`);
  return key;
}

/** Sign one blinded message with the till's key for its denomination. */
export function signBlinded(
  keyset: MintKeyset,
  message: BlindedMessage,
  options: { dleq?: boolean } = {},
): BlindedSignature {
  if (message.id !== keyset.id)
    throw new Error(
      `dokwa: output is for keyset ${message.id}, not ${keyset.id}`,
    );
  const secretKey = signingKey(keyset, message.amount);
  const B_ = Point.fromHex(message.B_);
  const a = Fn.fromBytes(secretKey);
  const C_ = B_.multiply(a);
  const signature: BlindedSignature = {
    id: keyset.id,
    amount: message.amount,
    C_: C_.toHex(true),
  };
  if (options.dleq !== false) signature.dleq = dleqFor(B_, secretKey);
  return signature;
}

/**
 * Refuse an output before any secret is recorded. The mint must never burn a
 * spent-list entry signing a point it cannot parse.
 */
export function validateBlindedMessage(
  keyset: MintKeyset,
  message: BlindedMessage,
): void {
  if (message.id !== keyset.id)
    throw new Error(
      `dokwa: output is for keyset ${message.id}, not ${keyset.id}`,
    );
  if (!keyset.keys[String(message.amount)])
    throw new Error(`dokwa: the keyset has no denomination ${message.amount}`);
  Point.fromHex(message.B_);
}

/** k * hash_to_curve(secret) == C. This is the mint checking its own work. */
export function verifyProof(keyset: MintKeyset, proof: Proof): boolean {
  try {
    const secretKey = signingKey(keyset, proof.amount);
    const Y = hashToCurve(proof.secret);
    const C = Point.fromHex(proof.C);
    return Y.multiply(Fn.fromBytes(secretKey)).equals(C);
  } catch {
    return false;
  }
}

/**
 * NUT-12: the same check with only the public key, which is what a wallet has.
 * A proof carries the blinding factor it was unblinded with, so the verifier
 * can put the signature back behind the blind and check the original DLEQ.
 */
export function verifyDleq(keyset: MintKeyset, proof: Proof): boolean {
  if (!proof.dleq?.r) return false;
  try {
    const A = Point.fromHex(keyset.keys[String(proof.amount)] ?? "");
    const Y = hashToCurve(proof.secret);
    const C = Point.fromHex(proof.C);
    const s = Fn.fromBytes(hexToBytes(proof.dleq.s));
    const e = Fn.fromBytes(hexToBytes(proof.dleq.e));
    const r = BigInt(proof.dleq.r);
    const C_ = C.add(A.multiply(r));
    const B_ = Y.add(Point.BASE.multiply(r));
    const R1 = Point.BASE.multiply(s).subtract(A.multiply(e));
    const R2 = B_.multiply(s).subtract(C_.multiply(e));
    return bytesToHex(hashE([R1, R2, A, C_])) === proof.dleq.e;
  } catch {
    return false;
  }
}

/**
 * Serialise the public half for `/v1/keys`. Secret keys are not in it, on
 * purpose: this object is what leaves the till.
 */
export function serialisePublicKeyset(keyset: MintKeyset): {
  id: string;
  unit: string;
  keys: Record<string, string>;
} {
  return { id: keyset.id, unit: keyset.unit, keys: { ...keyset.keys } };
}
