import type { StoredProof, WalletStore } from "../src/types.ts";

/**
 * A real implementation of the store contract in memory: the same shape the
 * Dexie store gives the wallet in a browser, minus durability. Writes are
 * immediate and reads are honest; nothing here simulates a mint or a key.
 */
export function memoryStore(): WalletStore {
  const proofs = new Map<string, StoredProof>();

  return {
    async putProofs(incoming: StoredProof[]): Promise<void> {
      for (const proof of incoming) proofs.set(proof.secret, proof);
    },

    async removeProofs(secrets: string[]): Promise<void> {
      for (const secret of secrets) proofs.delete(secret);
    },

    async allProofs(): Promise<StoredProof[]> {
      return [...proofs.values()];
    },
  };
}
