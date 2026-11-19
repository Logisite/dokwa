/**
 * The Lightning node's own storage. One Dexie database per node, one table,
 * and every write of node state is one transaction: the channel manager and
 * the network graph go in together or not at all, because losing one without
 * the other on a reload is a forced channel close.
 */

import Dexie, { type Table } from "dexie";

interface StateRow {
  key: string;
  bytes: Uint8Array;
  at: number;
}

class NodeDatabase extends Dexie {
  state!: Table<StateRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      state: "key, at",
    });
  }
}

export interface LightningStore {
  readState(key: string): Promise<Uint8Array | null>;
  /**
   * Every key in one transaction. A crash between the channel manager and
   * the network graph writes neither.
   */
  writeStates(entries: Array<[string, Uint8Array]>): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
}

export interface DexieLightningStore extends LightningStore {
  close(): void;
}

export function openLightningStore(name: string): DexieLightningStore {
  const db = new NodeDatabase(name);

  return {
    async readState(key: string): Promise<Uint8Array | null> {
      const row = await db.state.get(key);
      return row ? row.bytes : null;
    },

    async writeStates(entries: Array<[string, Uint8Array]>): Promise<void> {
      if (entries.length === 0) return;
      const at = Date.now();
      await db.transaction("rw", db.state, () =>
        db.state.bulkPut(entries.map(([key, bytes]) => ({ key, bytes, at }))),
      );
    },

    async listKeys(prefix: string): Promise<string[]> {
      const rows = await db.state.toArray();
      return rows.map((r) => r.key).filter((key) => key.startsWith(prefix));
    },

    close(): void {
      db.close();
    },
  };
}
