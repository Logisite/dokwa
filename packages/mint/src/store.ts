/**
 * The till's real storage. One IndexedDB database, named by `@dokwa/core`'s
 * `dbName("till")`, holding the spent secrets and the quotes.
 *
 * The transactional guarantee is IndexedDB's, not ours: a read and a write in
 * one `rw` transaction cannot interleave with another tab's transaction on the
 * same object store. That is why the spent list can be checked and written in
 * one call.
 */

import Dexie, { type Table } from "dexie";
import type { MintQuote, MintStore, SpendResult } from "./types.ts";

interface SpentRow {
  /** Y = hash_to_curve(secret), compressed hex; the primary key */
  y: string;
  /** epoch milliseconds; for the morning's reconciliation */
  at: number;
}

class TillDatabase extends Dexie {
  spent!: Table<SpentRow, string>;
  quotes!: Table<MintQuote, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      spent: "y, at",
      quotes: "id, state, expiry",
    });
  }
}

export interface DexieStore extends MintStore {
  /** close the connection; a reload opens it again */
  close(): void;
}

export function openMintStore(name: string): DexieStore {
  const db = new TillDatabase(name);

  return {
    async spend(ys: string[]): Promise<SpendResult> {
      if (ys.length === 0) return { ok: true };
      return db.transaction("rw", db.spent, async () => {
        const existing = await db.spent
          .where("y")
          .anyOf([...new Set(ys)])
          .toArray();
        if (existing.length > 0)
          return { ok: false, spent: existing.map((row) => row.y) };
        const at = Date.now();
        await db.spent.bulkAdd([...new Set(ys)].map((y) => ({ y, at })));
        return { ok: true };
      });
    },

    async spent(ys: string[]): Promise<string[]> {
      if (ys.length === 0) return [];
      const rows = await db.spent
        .where("y")
        .anyOf([...new Set(ys)])
        .toArray();
      return rows.map((row) => row.y);
    },

    async readQuote(id: string): Promise<MintQuote | null> {
      return (await db.quotes.get(id)) ?? null;
    },

    async putQuote(quote: MintQuote): Promise<void> {
      await db.quotes.put(quote);
    },

    async updateQuote(
      id: string,
      update: (quote: MintQuote) => MintQuote | null,
    ): Promise<MintQuote | null> {
      return db.transaction("rw", db.quotes, async () => {
        const current = await db.quotes.get(id);
        if (!current) return null;
        const next = update(current);
        if (!next) return null;
        await db.quotes.put(next);
        return next;
      });
    },

    close(): void {
      db.close();
    },
  };
}
