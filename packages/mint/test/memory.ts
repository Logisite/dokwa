import type { MintQuote, MintStore, SpendResult } from "../src/types.ts";

/**
 * A real implementation of the store contract in memory. The all-or-nothing
 * rule is kept the same way the Dexie store keeps it: the check and the write
 * happen in one synchronous block, with no await between them, so no other
 * call can interleave. What this store does not have is durability across a
 * process death; that is what the Dexie store and the browser rig are for.
 */
export function memoryStore(): MintStore {
  const spent = new Map<string, number>();
  const quotes = new Map<string, MintQuote>();

  return {
    async spend(ys: string[]): Promise<SpendResult> {
      if (ys.length === 0) return { ok: true };
      const unique = [...new Set(ys)];
      const existing = unique.filter((y) => spent.has(y));
      if (existing.length > 0) return { ok: false, spent: existing };
      const at = Date.now();
      for (const y of unique) spent.set(y, at);
      return { ok: true };
    },

    async spent(ys: string[]): Promise<string[]> {
      return [...new Set(ys)].filter((y) => spent.has(y));
    },

    async readQuote(id: string): Promise<MintQuote | null> {
      return quotes.get(id) ?? null;
    },

    async putQuote(quote: MintQuote): Promise<void> {
      quotes.set(quote.id, quote);
    },

    async updateQuote(
      id: string,
      update: (quote: MintQuote) => MintQuote | null,
    ): Promise<MintQuote | null> {
      const current = quotes.get(id);
      if (!current) return null;
      const next = update(current);
      if (!next) return null;
      quotes.set(id, next);
      return next;
    },
  };
}
