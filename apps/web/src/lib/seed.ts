/**
 * The one secret per role.
 *
 * The contract names the databases (`dokwa:till`, `dokwa:wallet:<id>`) and
 * leaves everything inside them free. The seed is the room's own small
 * secret, kept beside those stores rather than inside a package's tables:
 * the mint, the wallet, the chain and the node each derive from it, and none
 * of them owns it.
 *
 * A seed is written once, on the first open, and never replaced. The same
 * seed always gives the same identity, the same keyset and the same wallet,
 * which is what makes a reload recover the device instead of inventing a new
 * one.
 */

const PREFIX = "dokwa:seed:";

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  if (!/^[0-9a-f]+$/.test(text) || text.length % 2 !== 0) {
    throw new Error("dokwa: the stored seed is not hex");
  }
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export interface LoadedSeed {
  seed: Uint8Array;
  /** true only on the open that created the role */
  created: boolean;
}

export function loadSeed(role: string): LoadedSeed {
  const key = PREFIX + role;
  const stored = globalThis.localStorage.getItem(key);
  if (stored) {
    const seed = fromHex(stored);
    if (seed.length < 16) throw new Error("dokwa: the stored seed is short");
    return { seed, created: false };
  }
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  globalThis.localStorage.setItem(key, toHex(seed));
  return { seed, created: true };
}

/** True when this origin already knows the role, without creating one. */
export function hasSeed(role: string): boolean {
  return globalThis.localStorage.getItem(PREFIX + role) !== null;
}

/**
 * The export. A till shows this before anything of value exists, because the
 * seed is the only way to restore the device and there is no account to
 * recover it from. It is the same bytes `loadSeed` reads.
 */
export function seedHex(seed: Uint8Array): string {
  return toHex(seed);
}
