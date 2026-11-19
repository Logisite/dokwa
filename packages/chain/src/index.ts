/**
 * @dokwa/chain. The bitcoin wallet: descriptor, address, deposit, payout.
 *
 * The public surface is this file. Everything else in the package is internal.
 */

export {
  chainDescriptors,
  createChainWallet,
  type ChainBalance,
  type ChainDescriptors,
  type ChainNetwork,
  type ChainWallet,
  type ChainWalletOptions,
  type DepositAddress,
  type Payout,
} from "./wallet.ts";
