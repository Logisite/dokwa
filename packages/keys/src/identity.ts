/**
 * One identity, one signer.
 *
 * An identity is a secp256k1 secret key with a BIP340 signer. The public half
 * is x-only, 32 bytes of hex, because the signed records in this build are
 * nostr-shaped events: the same key that signs a receipt also names its author.
 *
 * Nothing here talks to a relay. It produces a signature and checks one.
 */

import type { PublicKey } from "@dokwa/core";
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  randomBytes,
  utf8ToBytes,
} from "@noble/hashes/utils.js";

/** Domain separation, so an identity seed can never be mistaken for another. */
const IDENTITY_TAG = utf8ToBytes("dokwa:identity:v1");

export interface Identity {
  /** x-only public key, 64 characters of lowercase hex */
  readonly pubkey: PublicKey;
  /** Sign a 32-byte digest with BIP340. Returns 128 characters of hex. */
  signDigest(digest: Uint8Array): string;
  /** Hash a message with SHA-256 and sign the digest. */
  signMessage(message: Uint8Array): string;
}

/** 32 bytes from the platform CSPRNG. */
export function randomSeed(): Uint8Array {
  return randomBytes(32);
}

/**
 * The identity for a seed. The same seed always gives the same key, which is
 * what lets a device be restored from the one secret the owner keeps.
 */
export function identityFromSeed(seed: Uint8Array): Identity {
  if (seed.length < 16) throw new Error("dokwa: a seed is at least 16 bytes");
  const secret = sha256(concatBytes(IDENTITY_TAG, seed));
  const pubkey = bytesToHex(schnorr.getPublicKey(secret));
  return {
    pubkey,
    signDigest(digest: Uint8Array): string {
      if (digest.length !== 32)
        throw new Error("dokwa: a digest to sign is 32 bytes");
      return bytesToHex(schnorr.sign(digest, secret));
    },
    signMessage(message: Uint8Array): string {
      return this.signDigest(sha256(message));
    },
  };
}

export function createIdentity(seed: Uint8Array = randomSeed()): Identity {
  return identityFromSeed(seed);
}

/** True only for a signature this public key made over this digest. */
export function verifyDigest(
  digest: Uint8Array,
  signature: string,
  pubkey: PublicKey,
): boolean {
  if (digest.length !== 32) return false;
  try {
    return schnorr.verify(hexToBytes(signature), digest, hexToBytes(pubkey));
  } catch {
    return false;
  }
}

export function verifyMessage(
  message: Uint8Array,
  signature: string,
  pubkey: PublicKey,
): boolean {
  return verifyDigest(sha256(message), signature, pubkey);
}

/**
 * The event envelope. This is a nostr event, deliberately: relays already
 * carry it, and the id rule is the standard one, so a receipt signed here can
 * be checked by anything that reads nostr.
 */
export interface EventTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface SignedEvent extends EventTemplate {
  id: string;
  pubkey: PublicKey;
  sig: string;
}

/** sha256 of the canonical serialisation, as nostr defines it. */
export function eventId(
  event: EventTemplate & { pubkey: PublicKey },
): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return bytesToHex(sha256(utf8ToBytes(serialized)));
}

export function signEvent(
  identity: Identity,
  template: EventTemplate,
): SignedEvent {
  const pubkey = identity.pubkey;
  const id = eventId({ ...template, pubkey });
  const sig = identity.signDigest(hexToBytes(id));
  return { ...template, id, pubkey, sig };
}

/** Checks the id and the signature. Content is the caller's business. */
export function verifyEvent(event: SignedEvent): boolean {
  if (eventId(event) !== event.id) return false;
  return verifyDigest(hexToBytes(event.id), event.sig, event.pubkey);
}
