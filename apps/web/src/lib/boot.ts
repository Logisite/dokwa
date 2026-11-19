/**
 * Where the three parts meet. Exactly one file composes the packages that
 * phase one merged; a screen calls `lib/`, never a package directly.
 *
 * The same-page path here is the one crypto specified on the board: while the
 * mint is the object in the same page, the wallet calls it in process, and no
 * bytes cross the seam. The `Wire` is still created and real, because the
 * chain lookups, the queued receipts and the node's socket all ride it, and
 * their screens must be able to say what it is doing.
 *
 * Till-only wasm is imported lazily. A wallet must not pay for a Lightning
 * node or a chain wallet it never opens.
 */

import { dbName, type Wire } from "@dokwa/core";
import {
  createIdentity,
  deriveMintKeyset,
  type Identity,
  type MintKeyset,
} from "@dokwa/keys";
import {
  openMint,
  openMintStore,
  type DexieStore,
  type Mint,
} from "@dokwa/mint";
import {
  openWallet,
  openWalletStore,
  type DexieWalletStore,
  type MintLink,
  type Wallet,
} from "@dokwa/wallet";
import { createWire, type WireHandle } from "@dokwa/wires";
import type { ChainWallet } from "@dokwa/chain";
import type { LightningNode } from "@dokwa/lightning";
import { loadSeed } from "./seed.ts";

/** The till's float is a wallet like any other, under the wallet storage name. */
export const TILL_FLOAT = "till-float";

export interface TillHandle {
  /** the one secret this till derives from */
  seed: Uint8Array;
  /** true only on the open that created the seed */
  created: boolean;
  identity: Identity;
  keyset: MintKeyset;
  mint: Mint;
  mintStore: DexieStore;
  /** the venue's own purse, the value it hands out */
  float: Wallet;
  floatStore: DexieWalletStore;
}

export interface WalletHandle {
  id: string;
  seed: Uint8Array;
  created: boolean;
  identity: Identity;
  wallet: Wallet;
  store: DexieWalletStore;
}

export interface RoomWire {
  wire: WireHandle;
  close(): void;
}

/** One wire for the page. Its queue and relay connections are real. */
export function createRoomWire(): RoomWire {
  const wire = createWire();
  return { wire, close: () => wire.close() };
}

export function openTill(): TillHandle {
  const { seed, created } = loadSeed("till");
  const identity = createIdentity(seed);
  const keyset = deriveMintKeyset(seed);
  const mintStore = openMintStore(dbName("till"));
  const mint = openMint({
    keyset,
    identity,
    url: "dokwa:till",
    store: mintStore,
  });
  const floatStore = openWalletStore(dbName({ wallet: TILL_FLOAT }));
  const float = openWallet({ store: floatStore, mint });
  return {
    seed,
    created,
    identity,
    keyset,
    mint,
    mintStore,
    float,
    floatStore,
  };
}

export function openPatron(id: string, mint: MintLink): WalletHandle {
  const { seed, created } = loadSeed(`wallet:${id}`);
  const identity = createIdentity(seed);
  const store = openWalletStore(dbName({ wallet: id }));
  const wallet = openWallet({ store, mint });
  return { id, seed, created, identity, wallet, store };
}

/**
 * A wallet on a device that is only a wallet. The purse and the key are real
 * and the balance is real; the till is not connected because the cross-device
 * NUT frame does not exist yet. Every call that needs a till says so in a
 * sentence instead of pretending to be offline.
 */
export function noTillLink(): MintLink {
  function refuse(): never {
    throw new Error(
      "wallet: no till is connected yet, so there is nothing to ask for value",
    );
  }
  return {
    keys: refuse,
    async createQuote() {
      return refuse();
    },
    async readQuote() {
      return refuse();
    },
    async mint() {
      return refuse();
    },
    async swap() {
      return refuse();
    },
    async checkstate() {
      return refuse();
    },
  };
}

/**
 * The venue's own float, acquired through the wallet's real NUT-04 path: the
 * float asks the till for a quote, the operator's settle is the till's own
 * business, and the wallet claims it with its own blind and unblind maths.
 * `receiveQuote` stores nothing on a refusal, and a second claim of the same
 * quote is refused by the till.
 */
export async function fundTill(till: TillHandle, amount = 21): Promise<number> {
  const held = await till.float.balance();
  if (held > 0) return held;
  const quote = await till.float.requestQuote({
    amount,
    description: "the till's float",
  });
  await till.mint.settle(quote.id);
  await till.float.receiveQuote(quote.id);
  return till.float.balance();
}

/**
 * The chain wallet, lazily. Its sync bypasses the Wire by the sixth ruling;
 * its payouts ride it. The seed is the till's, so the venue has one identity
 * across the mint, the chain and the node.
 */
export async function openChain(
  till: TillHandle,
  wire: Wire,
): Promise<ChainWallet> {
  const { createChainWallet } = await import("@dokwa/chain");
  return createChainWallet({ seed: till.seed, network: "signet", wire });
}

/**
 * The node, lazily, with its wasm fetched from this origin so the service
 * worker can precache it. Its store is the till's node store, separate from
 * the mint's tables because the package owns its own schema.
 */
export async function openNode(
  till: TillHandle,
  wire: Wire,
): Promise<LightningNode> {
  const [{ openLightning, openLightningStore }, wasmModule] = await Promise.all(
    [
      import("@dokwa/lightning"),
      import("lightningdevkit/liblightningjs.wasm?url"),
    ],
  );
  const response = await fetch(wasmModule.default);
  if (!response.ok) {
    throw new Error(
      `lightning: the wasm did not load (${response.status} ${wasmModule.default})`,
    );
  }
  const wasm = new Uint8Array(await response.arrayBuffer());
  const store = openLightningStore(`${dbName("till")}:lightning`);
  return openLightning({
    seed: till.seed,
    wasm,
    store,
    wire,
    network: "signet",
  });
}
