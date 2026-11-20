/**
 * The queue, deterministically.
 *
 * The reload is real storage: DexieQueueStore over IndexedDB (fake-indexeddb
 * gives the browser's IndexedDB semantics in Node, imported from the store
 * copy in the lockfile, no lockfile edge), and a second store instance over
 * the same database is what a second page load is to the first. The signal
 * probe and the destination are fixtures here because the queue's subject is
 * hold, survive, drain in order; the real relay drain is queue.live.test.ts.
 */

// fake-indexeddb is in the lockfile as apps/web's devDependency. A file URL,
// because a bare or relative specifier would be rebased by the test runner.
import "file:///home/logisiteau/projects/hacks/dokwa-wt/wires/node_modules/.pnpm/fake-indexeddb@6.2.8/node_modules/fake-indexeddb/auto/index.mjs";
import { describe, expect, it } from "vitest";
import type { Destination, Sent } from "@dokwa/core";
import {
  DexieQueueStore,
  MemoryQueueStore,
  Outbox,
  destinationKey,
  type DeliveryResult,
  type QueueItem,
} from "../src/queue.ts";

const encoder = new TextEncoder();

/** The same order the outbox uses: queued time first, id to break ties. */
function byQueued(a: QueueItem, b: QueueItem): number {
  return a.queuedAt - b.queuedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

describe("the queue holds offline, survives a reload, and drains in order", () => {
  it("holds three items, reads them back from a second store, drains once", async () => {
    const dbName = `dokwa:wires-queue-deterministic-${Date.now()}`;
    const destination: Destination = {
      kind: "relay",
      url: "wss://example.invalid/relay",
    };
    const delivered: string[] = [];
    let online = false;
    const deliver = async (_to: Destination, bytes: Uint8Array) => {
      delivered.push(new TextDecoder().decode(bytes));
      return { status: "delivered" as const };
    };
    const frames = ["one", "two", "three"].map((text) => encoder.encode(text));

    // -- First page: offline by construction, so every send is stored. -----
    const pageOne = new Outbox({
      store: new DexieQueueStore(dbName),
      deliver,
      isOnline: () => online,
    });
    try {
      const answers: Sent[] = [];
      for (const frame of frames) {
        answers.push(await pageOne.send(destination, frame));
      }
      for (const answer of answers) expect(answer).toEqual({ status: "later" });
      const waiting = await pageOne.pending();
      expect(waiting.length).toBe(3);

      // The store itself is durable: a second instance over the same database
      // sees the same three items in the same order.
      const stored = new DexieQueueStore(dbName);
      const raw = (await stored.all()).sort(byQueued);
      await stored.close();
      expect(raw.map((item) => new TextDecoder().decode(item.bytes))).toEqual(
        frames.map((frame) => new TextDecoder().decode(frame)),
      );
      expect(raw.map((item) => item.id)).toEqual(waiting.map((p) => p.id));
    } finally {
      pageOne.stop();
    }

    // -- Reload: same database, new outbox, signal restored by construction.
    online = true;
    const pageTwo = new Outbox({
      store: new DexieQueueStore(dbName),
      deliver,
      isOnline: () => online,
    });
    try {
      await pageTwo.drain();
      // Delivered once each, in queued order, and the store is empty after.
      expect(delivered).toEqual(["one", "two", "three"]);
      expect(await pageTwo.pending()).toEqual([]);
      const stored = new DexieQueueStore(dbName);
      expect((await stored.all()).length).toBe(0);
      await stored.close();
    } finally {
      pageTwo.stop();
    }
  }, 60_000);
});

describe("the queue's bookkeeping, unit rigs with an honest stub", () => {
  it("a refused payload is deleted and reported, not retried forever", async () => {
    // The stub here is not pretending to be a relay; it isolates the
    // outbox's own promise: rejected means gone and said out loud.
    const store = new MemoryQueueStore();
    const results: DeliveryResult[] = [];
    const outbox = new Outbox({
      store,
      deliver: async () => ({ status: "failed", reason: "rejected" }),
      isOnline: () => true,
      onResult: (result) => results.push(result),
    });
    const sent = await outbox.send(
      { kind: "relay", url: "wss://any.relay" },
      encoder.encode("x"),
    );
    expect(sent).toEqual({ status: "failed", reason: "rejected" });
    expect(await outbox.pending()).toEqual([]);
    expect(results).toEqual([
      {
        id: expect.any(String),
        to: { kind: "relay", url: "wss://any.relay" },
        status: "failed",
        reason: "rejected",
      },
    ]);
  });

  it("a throw in delivery becomes a retry, not a crash", async () => {
    const store = new MemoryQueueStore();
    const outbox = new Outbox({
      store,
      deliver: async () => {
        throw new Error("socket exploded");
      },
      isOnline: () => true,
      baseBackoffMs: 50,
      maxBackoffMs: 100,
    });
    const sent = await outbox.send(
      { kind: "peer", id: "till" },
      encoder.encode("x"),
    );
    expect(sent).toEqual({ status: "later" });
    const items = await store.all();
    expect(items.length).toBe(1);
    expect(items[0]!.attempts).toBe(1);
    // The retry is scheduled for later, not run in a tight loop.
    expect(items[0]!.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it("a stale item for one peer id never reaches another", async () => {
    // The room's failing case: a fresh link's request id starts at 1, and a
    // stale queued answer from an earlier session must not resolve it. The
    // link identity is the Destination id, caller-chosen, so two links to
    // the same peer are two queues: a composite id with a nonce separates
    // them without any seam change.
    const store = new MemoryQueueStore();
    const seen: Array<{ to: Destination; bytes: string }> = [];
    let online = false;
    const outbox = new Outbox({
      store,
      deliver: async (to, bytes) => {
        seen.push({
          to: { ...to } as Destination,
          bytes: new TextDecoder().decode(bytes),
        });
        return { status: "delivered" };
      },
      isOnline: () => online,
    });
    const linkA: Destination = { kind: "peer", id: "tillpub:nonceA" };
    const linkB: Destination = { kind: "peer", id: "tillpub:nonceB" };
    expect(destinationKey(linkA)).not.toBe(destinationKey(linkB));

    const a = await outbox.send(linkA, encoder.encode("A"));
    expect(a).toEqual({ status: "later" });
    online = true;
    const b = await outbox.send(linkB, encoder.encode("B"));
    expect(b).toEqual({ status: "delivered" });

    const peerId = (to: Destination): string =>
      to.kind === "peer" ? to.id : to.kind;
    // B's first call reached B's own destination, and nothing else ran.
    expect(seen.map((item) => peerId(item.to))).toEqual([linkB.id]);
    expect(seen[0]!.bytes).toBe("B");
    // The stale item is still queued for A's link, never delivered to B.
    expect((await outbox.pending()).map((item) => peerId(item.to))).toEqual([
      linkA.id,
    ]);
  });

  it("a send racing a drain on the same destination delivers once", async () => {
    // The bug this pins: a send and a signal-driven drain can both try the
    // same head item in the same moment, and the bytes leave twice. The
    // contract has no idempotency key on purpose, so the queue must not
    // invent duplicates the receiver has to refuse.
    const store = new MemoryQueueStore();
    const calls: string[] = [];
    let releaseDeliver: () => void = () => {};
    const gate = new Promise<void>((r) => {
      releaseDeliver = r;
    });
    const outbox = new Outbox({
      store,
      deliver: async (to, bytes) => {
        calls.push(new TextDecoder().decode(bytes));
        await gate; // hold the attempt open so a drain can race it
        return { status: "delivered" };
      },
      isOnline: () => true,
    });

    const sending = outbox.send(
      { kind: "relay", url: "wss://one.relay" },
      encoder.encode("once"),
    );
    // The drain starts while the send's attempt is still in flight. The
    // send then answers later, because the drain is delivering the same
    // item; the bytes still leave exactly once.
    const draining = outbox.drain();
    releaseDeliver();
    const [sent] = await Promise.all([sending, draining]);
    expect(sent).toEqual({ status: "later" });
    expect(calls).toEqual(["once"]);
    expect(await outbox.pending()).toEqual([]);
  });
});
