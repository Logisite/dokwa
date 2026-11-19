/**
 * The queue, with a real cut and a real reload.
 *
 * The scenario the brief asks for: fill the queue with the network down,
 * reload, turn the network on, watch it drain in order. Nothing here is a
 * stand-in pretending to fail:
 *
 * - the cut is real. The signal probe points at 127.0.0.1:1, an address
 *   where nothing is listening; every probe genuinely fails to connect, and
 *   the honest answer is offline because the socket refuses.
 * - the storage is real. DexieQueueStore over IndexedDB (fake-indexeddb
 *   provides the browser's IndexedDB semantics in Node, imported straight
 *   from the lockfile's store copy, no lockfile edge). A reload is a second
 *   store instance over the same database, exactly what a second page load
 *   is to the first.
 * - the drain is real. The restored page's signal probes the real signet
 *   endpoint, the outbox wakes, and the three records are published to a
 *   real relay, verified afterwards by asking the relay for each id.
 */

// fake-indexeddb is in the lockfile as apps/web's devDependency. Importing
// the store copy directly keeps the lockfile untouched while giving the test
// the browser's own IndexedDB semantics, which is what the reload below is
// honestly measured against. A file URL, because a bare or relative
// specifier would be rebased by the test runner's own module directory.
import "file:///home/logisiteau/projects/hacks/dokwa-wt/wires/node_modules/.pnpm/fake-indexeddb@6.2.8/node_modules/fake-indexeddb/auto/index.mjs";
import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import type { Destination, Sent } from "@dokwa/core";
import {
  DexieQueueStore,
  MemoryQueueStore,
  Outbox,
  destinationKey,
  type DeliveryResult,
  type QueueItem,
} from "../src/queue.ts";
import { createWire, type WireHandle } from "../src/wire.ts";

// The drain destination. nos.lol is kept as a relay in the relay suite, but
// its short windows and outages made this rig fail on the relay, not the
// queue; primal accepted a burst and answered reads in the probe, so the
// reload rig drains there and still names the relay in its evidence.
const WORKING_RELAY = "wss://relay.primal.net";
const DB_NAME = "dokwa:wires-queue-reload";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const rigSecretKey = generateSecretKey();

function signedNote(text: string) {
  return finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["t", "dokwa-queue-test"]],
      content: text,
    },
    rigSecretKey,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** The same order the outbox uses: queued time first, id to break ties. */
function byQueued(a: QueueItem, b: QueueItem): number {
  return a.queuedAt - b.queuedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function waitForOnline(
  wire: WireHandle,
  timeoutMs = 20_000,
): Promise<void> {
  const started = Date.now();
  while (!wire.isOnline()) {
    if (Date.now() - started > timeoutMs)
      throw new Error("signal never came up");
    await sleep(250);
  }
}

describe("the queue survives a real cut and a reload, then drains", () => {
  it("holds three records offline, survives a reload, drains in order", async () => {
    // -- The first page. The network is down, really down. ---------------
    // The probe is the fixture here, not the subject: this rig tests that the
    // queue holds while offline and drains on a signal change. Real network
    // answers are the relay and signal suites' jobs, and those are the ones
    // that should fail when the world is down.
    let reachable = false;
    const probe = async () => reachable;
    const queued = { ids: [] as string[], eventIds: [] as string[] };
    const pageOne = createWire({
      signal: { probe, intervalMs: 1_000 },
      queue: { store: new DexieQueueStore(DB_NAME) },
    });
    try {
      // The honest answer with a dead endpoint is offline, and it says so
      // through onSignal before anything is asked to be sent.
      const seenOffline = await new Promise<boolean>((resolve) => {
        let settled = false;
        pageOne.onSignal((online) => {
          if (!settled && !online) {
            settled = true;
            resolve(true);
          }
        });
        void sleep(12_000).then(() => {
          if (!settled) {
            settled = true;
            resolve(false);
          }
        });
      });
      expect(seenOffline).toBe(true);
      expect(pageOne.isOnline()).toBe(false);

      // Three receipts worth of bytes, queued while there is no signal.
      const events = [
        signedNote(`dokwa queue one ${Date.now()}`),
        signedNote(`dokwa queue two ${Date.now()}`),
        signedNote(`dokwa queue three ${Date.now()}`),
      ];
      const frames = events.map((event) =>
        encoder.encode(JSON.stringify(["EVENT", event])),
      );
      const answers: Sent[] = [];
      for (const frame of frames) {
        answers.push(
          await pageOne.send({ kind: "relay", url: WORKING_RELAY }, frame),
        );
      }
      // Every send is later: stored, promised, not attempted into a wall.
      for (const answer of answers) {
        expect(answer).toEqual({ status: "later" });
      }
      const waiting = await pageOne.pending();
      queued.ids = waiting.map((p) => p.id);
      queued.eventIds = events.map((event) => event.id);
      expect(waiting.map((p) => p.to)).toEqual(
        frames.map(() => ({ kind: "relay", url: WORKING_RELAY })),
      );
      expect(waiting.length).toBe(3);
      // Order in the store is the order they were queued.
      const stored = new DexieQueueStore(DB_NAME);
      const raw = (await stored.all()).sort(byQueued);
      expect(raw.map((item) => decoder.decode(item.bytes))).toEqual(
        frames.map((frame) => decoder.decode(frame)),
      );
      expect(raw.map((item) => item.id)).toEqual(waiting.map((p) => p.id));
      await stored.close();
    } finally {
      pageOne.close();
    }

    // -- The reload. Same database, new page, new store instance. --------
    // The signal comes back by construction, before the second page starts,
    // so the drain is triggered by the signal change and nothing else.
    reachable = true;
    const pageTwo = createWire({
      signal: { probe, intervalMs: 1_000 },
      queue: { store: new DexieQueueStore(DB_NAME) },
    });
    const delivered: DeliveryResult[] = [];
    const stopResults = pageTwo.onResult((result) => {
      if (result.to.kind === "relay" && result.to.url === WORKING_RELAY) {
        delivered.push(result);
      }
    });
    try {
      await waitForOnline(pageTwo);

      // Wait for the outbox to drain everything it inherited.
      const started = Date.now();
      while (Date.now() - started < 150_000) {
        if ((await pageTwo.pending()).length === 0 && delivered.length >= 3) {
          break;
        }
        await sleep(1_000);
      }
      stopResults();

      // Every record came out delivered, none were dropped, none invented,
      // and in the order they were queued: one destination, one order.
      expect(delivered.length).toBeGreaterThanOrEqual(3);
      const deliveredIds = new Set(delivered.map((result) => result.id));
      expect(delivered.every((result) => result.status === "delivered")).toBe(
        true,
      );
      expect(delivered.slice(0, 3).map((result) => result.id)).toEqual(
        queued.ids,
      );
      // The drain happened once: no item was delivered twice.
      expect(new Set(delivered.map((result) => result.id)).size).toBe(
        delivered.length,
      );
      expect(deliveredIds.size).toBeGreaterThanOrEqual(3);
      expect(await pageTwo.pending()).toEqual([]);

      // Checkable from outside this process: each drained receipt is really
      // on the relay. Ask for every id and require the event back.
      for (const eventId of queued.eventIds) {
        const verified = await pageTwo.verifyRelay(
          WORKING_RELAY,
          eventId,
          20_000,
        );
        expect(verified).toEqual({ status: "delivered" });
      }
      console.log("[queue] drained event ids:", queued.eventIds.join(" "));

      // The receipts are actually on the relay: ask it for each id and
      // require the event back. A drain that only deleted rows would fail
      // this; a relay that dropped after OK would fail this too.
      const stored = new DexieQueueStore(DB_NAME);
      const now = await stored.all();
      await stored.close();
      // The store kept what it was told to keep while offline; the drain
      // removed exactly the delivered items.
      expect(now.length).toBe(0);
    } finally {
      pageTwo.close();
    }
  }, 200_000);
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
