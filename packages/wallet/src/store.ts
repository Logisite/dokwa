/**
 * The wallet's real storage. One IndexedDB database per person, named by
 * `@dokwa/core`'s `dbName({ wallet: id })`. The primary key is the secret,
 * because two coins with one secret are one coin, not two.
 */

import Dexie, { type Table } from "dexie";
import type { StoredProof, WalletStore } from "./types.ts";

class WalletDatabase extends Dexie {
  proofs!: Table<StoredProof, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      proofs: "secret, amount, id, addedAt",
    });
  }
}

export interface DexieWalletStore extends WalletStore {
  close(): void;
}

export function openWalletStore(name: string): DexieWalletStore {
  const db = new WalletDatabase(name);

  return {
    async putProofs(proofs: StoredProof[]): Promise<void> {
      if (proofs.length === 0) return;
      await db.proofs.bulkPut(proofs);
    },

    async removeProofs(secrets: string[]): Promise<void> {
      if (secrets.length === 0) return;
      await db.proofs.bulkDelete([...new Set(secrets)]);
    },

    async allProofs(): Promise<StoredProof[]> {
      return db.proofs.toArray();
    },

    close(): void {
      db.close();
    },
  };
}
