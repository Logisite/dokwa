/**
 * The outbox.
 *
 * A `later` from `send` is a promise: this is where it is kept. One record per
 * send, ordered per destination, removed only after `delivered` (or a
 * destination that explicitly refused it). It survives a reload because the
 * records live in IndexedDB, not in a variable.
 *
 * Retries are per destination and exponential. They stop while the signal is
 * down and resume when it comes back; there is no tight loop and no timer per
 * message. A destination that refuses a payload is removed and reported; it
 * is never retried into a quiet success.
 */

import type { Destination, Failure, Pending, Sent } from "@dokwa/core";
import Dexie, { type Table } from "dexie";

export interface QueueItem {
  /** Sortable within one millisecond, unique across reloads. */
  id: string;
  to: Destination;
  /** Derived from `to`, so the store can index it. */
  toKey: string;
  bytes: Uint8Array;
  queuedAt: number;
  attempts: number;
  nextAttemptAt: number;
}

export interface DeliveryResult {
  id: string;
  to: Destination;
  status: "delivered" | "failed";
  reason?: Failure;
}

export interface QueueStore {
  add(item: QueueItem): Promise<void>;
  all(): Promise<QueueItem[]>;
  put(item: QueueItem): Promise<void>;
  delete(id: string): Promise<void>;
}

export function destinationKey(to: Destination): string {
  switch (to.kind) {
    case "relay":
      return `relay:${to.url}`;
    case "chain":
      return `chain:${to.network}`;
    case "peer":
      return `peer:${to.id}`;
  }
}

export class MemoryQueueStore implements QueueStore {
  private readonly items = new Map<string, QueueItem>();

  async add(item: QueueItem): Promise<void> {
    this.items.set(item.id, clone(item));
  }

  async all(): Promise<QueueItem[]> {
    return [...this.items.values()].map(clone);
  }

  async put(item: QueueItem): Promise<void> {
    this.items.set(item.id, clone(item));
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

/** The real store: one table in the role's database. */
export class DexieQueueStore implements QueueStore {
  private readonly db: Dexie;
  private readonly table: Table<QueueItem, string>;

  constructor(dbName = "dokwa:wires") {
    this.db = new Dexie(dbName);
    this.db.version(1).stores({ wire_queue: "id, queuedAt, toKey" });
    this.table = this.db.table<QueueItem, string>("wire_queue");
  }

  async add(item: QueueItem): Promise<void> {
    await this.table.add(item);
  }

  async all(): Promise<QueueItem[]> {
    return this.table.toArray();
  }

  async put(item: QueueItem): Promise<void> {
    await this.table.put(item);
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export interface OutboxOptions {
  store: QueueStore;
  /** The honest attempt. Must resolve, never throw. */
  deliver: (to: Destination, bytes: Uint8Array) => Promise<Sent>;
  isOnline: () => boolean;
  onResult?: (result: DeliveryResult) => void;
  now?: () => number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

function clone(item: QueueItem): QueueItem {
  return {
    ...item,
    to: { ...item.to } as Destination,
    bytes: new Uint8Array(item.bytes),
  };
}

function randomId(now: number, sequence: number): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${now}-${String(sequence % 1_000_000).padStart(6, "0")}-${suffix}`;
}

export class Outbox {
  private readonly store: QueueStore;
  private readonly deliver: OutboxOptions["deliver"];
  private readonly isOnline: OutboxOptions["isOnline"];
  private readonly onResult?: OutboxOptions["onResult"];
  private readonly now: () => number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  private sequence = 0;
  private readonly busy = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(options: OutboxOptions) {
    this.store = options.store;
    this.deliver = options.deliver;
    this.isOnline = options.isOnline;
    this.onResult = options.onResult;
    this.now = options.now ?? (() => Date.now());
    this.baseBackoffMs = options.baseBackoffMs ?? 1_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 5 * 60_000;
  }

  async pending(): Promise<Pending[]> {
    const items = await this.store.all();
    return items
      .sort(compare)
      .map(({ id, to, queuedAt }) => ({ id, to: { ...to } as Destination, queuedAt }));
  }

  /**
   * Add and, when this is the oldest item for its destination and the signal
   * is up, make one real attempt now. Anything else is `later`.
   */
  async send(to: Destination, bytes: Uint8Array): Promise<Sent> {
    const now = this.now();
    const item: QueueItem = {
      id: randomId(now, this.sequence++),
      to: { ...to } as Destination,
      toKey: destinationKey(to),
      bytes: new Uint8Array(bytes),
      queuedAt: now,
      attempts: 0,
      nextAttemptAt: now,
    };
    await this.store.add(item);

    if (!this.isOnline()) return { status: "later" };

    const key = item.toKey;
    if (this.busy.has(key)) return { status: "later" };

    // A newer send must not overtake an older one for the same destination.
    const same = (await this.store.all())
      .filter((candidate) => candidate.toKey === key)
      .sort(compare);
    if (same[0]?.id !== item.id) {
      this.schedule();
      return { status: "later" };
    }

    return this.attemptWithLock(item);
  }

  /** Try every destination now, in parallel; order is kept per destination. */
  async drain(): Promise<void> {
    if (!this.isOnline()) {
      this.clearTimer();
      return;
    }
    const keys = new Set((await this.store.all()).map((item) => item.toKey));
    await Promise.all([...keys].map((key) => this.runDestination(key)));
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private async attemptWithLock(item: QueueItem): Promise<Sent> {
    const key = item.toKey;
    this.busy.add(key);
    try {
      return await this.attempt(item);
    } finally {
      this.busy.delete(key);
      this.schedule();
    }
  }

  private async attempt(item: QueueItem): Promise<Sent> {
    let sent: Sent;
    try {
      sent = await this.deliver(item.to, item.bytes);
    } catch {
      sent = { status: "failed", reason: "unreachable" };
    }

    if (sent.status === "delivered") {
      await this.store.delete(item.id);
      this.onResult?.({ id: item.id, to: item.to, status: "delivered" });
      return sent;
    }

    if (sent.status === "failed") {
      // `rejected` is the destination refusing this payload: keep it would be
      // a lie. `unreachable`/`timeout` are worth another honest try.
      if (sent.reason === "rejected") {
        await this.store.delete(item.id);
        this.onResult?.({
          id: item.id,
          to: item.to,
          status: "failed",
          reason: sent.reason,
        });
        return sent;
      }
      await this.retryLater(item);
      return { status: "later" };
    }

    await this.retryLater(item);
    return { status: "later" };
  }

  private async retryLater(item: QueueItem): Promise<void> {
    const attempts = item.attempts + 1;
    const delay = Math.min(
      this.maxBackoffMs,
      this.baseBackoffMs * 2 ** Math.min(attempts - 1, 16),
    );
    const next: QueueItem = {
      ...item,
      attempts,
      nextAttemptAt: this.now() + delay,
    };
    await this.store.put(next);
    this.schedule();
  }

  private async runDestination(key: string): Promise<void> {
    if (this.busy.has(key)) return;
    this.busy.add(key);
    try {
      for (;;) {
        if (this.stopped || !this.isOnline()) return;
        const head = (await this.store.all())
          .filter((item) => item.toKey === key)
          .sort(compare)[0];
        if (!head) return;
        if (head.nextAttemptAt > this.now()) {
          this.schedule();
          return;
        }
        const sent = await this.attempt(head);
        if (sent.status === "later") return;
      }
    } finally {
      this.busy.delete(key);
      this.schedule();
    }
  }

  private schedule(): void {
    this.clearTimer();
    if (this.stopped || !this.isOnline()) return;
    void this.store.all().then((items) => {
      if (this.stopped || !this.isOnline() || items.length === 0) return;
      const earliest = Math.min(...items.map((item) => item.nextAttemptAt));
      const delay = Math.max(0, earliest - this.now());
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.drain();
      }, delay);
      (this.timer as { unref?: () => void }).unref?.();
    });
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

function compare(a: QueueItem, b: QueueItem): number {
  return a.queuedAt - b.queuedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
