/**
 * Sealing: a payload readable only by the person it was sealed to.
 *
 * Built on @noble/ciphers by ruling: a library that exists and is declared
 * beats a construction that is clever. The shape is still ECIES:
 *
 * - an ephemeral secp256k1 key is made per message; the sender ECDHs it
 *   against the recipient's x-only public key (the even-y twin of it), so
 *   every envelope has a fresh key and no nonce bookkeeping
 * - HKDF-SHA256 over the sha256 of the shared point gives one ChaCha
 *  Poly1305 key and its nonce, 32 plus 12 bytes
 * - the AEAD is chacha20poly1305; its tag is checked before anything is
 *   returned, so a wrong key or a changed byte gets nothing, not garbage
 *
 * Envelope: base64( ephemeral compressed pubkey (33) || ciphertext || tag ).
 */

import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { secretFromSeed } from "@dokwa/keys";

const SEAL_INFO = utf8ToBytes("dokwa:seal:v1");
const EPHEMERAL_LENGTH = 33;
const NONCE_LENGTH = 12;

function keysFromShared(sharedPoint: Uint8Array): {
  key: Uint8Array;
  nonce: Uint8Array;
} {
  // The x-coordinate only. The sender ECDHs against the even-y twin of the
  // recipient's x-only key; when the recipient's real point has odd y that
  // twin is the negation, so the two sides get points with the same x and
  // opposite parity byte. Hashing the encoding would disagree half the time.
  const ikm = sha256(sharedPoint.slice(1));
  const okm = hkdf(sha256, ikm, SEAL_INFO, SEAL_INFO, 32 + NONCE_LENGTH);
  return { key: okm.slice(0, 32), nonce: okm.slice(32, 32 + NONCE_LENGTH) };
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Seal plaintext to one recipient, named by their x-only public key. */
export function seal(recipientPubkey: string, plaintext: string): string {
  if (!/^[0-9a-f]{64}$/i.test(recipientPubkey))
    throw new Error("dokwa: a recipient pubkey is 64 hex characters");
  const recipient = hexToBytes(recipientPubkey.toLowerCase());
  const ephemeralSecret = secp256k1.utils.randomSecretKey();
  const ephemeralPub = secp256k1.getPublicKey(ephemeralSecret, true);
  const shared = secp256k1.getSharedSecret(
    ephemeralSecret,
    concatBytes(new Uint8Array([0x02]), recipient),
  );
  const { key, nonce } = keysFromShared(shared);
  const sealed = chacha20poly1305(key, nonce).encrypt(utf8ToBytes(plaintext));
  return toBase64(concatBytes(ephemeralPub, sealed));
}

/**
 * Open a sealed payload with the recipient's secret key. A wrong key or a
 * changed byte returns null: the tag refuses before anything is decrypted.
 */ export function open(
  sealed: string,
  recipientSecret: Uint8Array,
): string | null {
  let envelope: Uint8Array;
  try {
    envelope = fromBase64(sealed);
  } catch {
    return null;
  }
  if (envelope.length < EPHEMERAL_LENGTH + 16) return null;
  const ephemeralPub = envelope.slice(0, EPHEMERAL_LENGTH);
  const body = envelope.slice(EPHEMERAL_LENGTH);
  let shared: Uint8Array;
  try {
    shared = secp256k1.getSharedSecret(recipientSecret, ephemeralPub);
  } catch {
    return null;
  }
  const { key, nonce } = keysFromShared(shared);
  try {
    return new TextDecoder().decode(chacha20poly1305(key, nonce).decrypt(body));
  } catch {
    return null;
  }
}

/**
 * Open a sealed payload with the recipient's seed, the one secret the owner
 * keeps. The derivation is the identity's own, not a second copy of it.
 */
export function openWithSeed(seed: Uint8Array, sealed: string): string | null {
  return open(sealed, secretFromSeed(seed));
}
