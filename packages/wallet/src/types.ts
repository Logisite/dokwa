/**
 * The wallet's small vocabulary: one held proof and one store. The proofs a
 * wallet holds are always fresh from a swap, so none of them are spent; a
 * proof the wallet has sent or redeemed leaves the store.
 */

export interface StoredProof {
  /** keyset id */
  id: string;
  /** denomination, in the keyset unit */
  amount: number;
  /** the wallet's own secret for this coin */
  secret: string;
  /** unblinded signature, compressed hex */
  C: string;
  /** e and s from the mint, r from this wallet (NUT-12) */
  dleq?: { e: string; s: string; r?: string };
  /** epoch milliseconds, for the morning's reconciliation */
  addedAt: number;
}

export interface WalletStore {
  putProofs(proofs: StoredProof[]): Promise<void>;
  /** the primary key is the secret; removing unknown secrets is not an error */
  removeProofs(secrets: string[]): Promise<void>;
  allProofs(): Promise<StoredProof[]>;
}
