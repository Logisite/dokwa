/**
 * @dokwa/wallet. Holding, sending, receiving, verifying ecash.
 *
 * The public surface is this file. Everything else in the package is internal.
 */

export { openWallet } from "./wallet.ts";
export { openWalletStore, type DexieWalletStore } from "./store.ts";
export type {
  MintLink,
  MintLinkCheckState,
  MintLinkKeys,
} from "./mint-link.ts";
export type { StoredProof, WalletStore } from "./types.ts";
export type { TokenCheck, Wallet, WalletOptions } from "./wallet.ts";
