/**
 * The chain wallet: an address from a seed, an address per deposit, a payout
 * signed and sent.
 *
 * The descriptor and the keys come from the seed through bdk's own maths, so
 * the same seed always gives the same wallet and no other component holds a
 * copy. The lookups are a Wire, taken as an argument and never imported: the
 * chain destination is the only thing this package ever asks the outside
 * world for, and every answer arrives as bytes it then decodes.
 */

import {
  seed_to_descriptor,
  Wallet as BdkWallet,
  type DescriptorPair,
} from "@bitcoindevkit/bdk-wallet-web";
import type { Wire } from "@dokwa/core";

export type ChainNetwork = "signet";

export interface ChainWalletOptions {
  /** the one secret this wallet is derived from */
  seed: Uint8Array;
  network?: ChainNetwork;
  /**
   * The lookups and the broadcast. Injected, not imported: this package
   * opens no socket of its own.
   */
  wire?: Wire;
}

export interface ChainDescriptors {
  external: string;
  internal: string;
}

export interface DepositAddress {
  /** the signet address, bech32m */
  address: string;
  /** the derivation index it came from */
  index: number;
  keychain: "external";
}

export interface ChainWallet {
  readonly network: ChainNetwork;
  readonly descriptors: ChainDescriptors;
  /** a fresh address for the next deposit */
  newDepositAddress(): DepositAddress;
}

export function chainDescriptors(
  seed: Uint8Array,
  network: ChainNetwork = "signet",
): ChainDescriptors & { pair: DescriptorPair } {
  const pair = seed_to_descriptor(seed, network, "p2wpkh");
  return { external: pair.external, internal: pair.internal, pair };
}

export function createChainWallet(options: ChainWalletOptions): ChainWallet {
  const network = options.network ?? "signet";
  const descriptors = chainDescriptors(options.seed, network);
  const wallet = BdkWallet.create(
    network,
    descriptors.external,
    descriptors.internal,
  );

  return {
    network,
    descriptors: {
      external: descriptors.external,
      internal: descriptors.internal,
    },

    newDepositAddress(): DepositAddress {
      const info = wallet.reveal_next_address("external");
      return {
        address: info.address.toString(),
        index: info.index,
        keychain: "external",
      };
    },
  };
}
