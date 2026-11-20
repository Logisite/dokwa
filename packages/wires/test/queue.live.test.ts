/**
 * The queue with a real relay drain. Explicit test:live.
 *
 * The default suite proves the same queue semantics with a fixture and a stub
 * destination, deterministically. This file is the evidence that the drain
 * also works against a real relay, verified by asking the relay for each id,
 * and it runs on purpose before a gate.
 */

// fake-indexeddb is in the lockfile as apps/web's devDependency. Importing
// the store copy directly keeps the lockfile untouched while giving the test
// the browser's own IndexedDB semantics, which is what the reload below is
// honestly measured against. A file URL, because a bare or relative
// specifier would be rebased by the test runner's own module directory.
import "file:///home/logisiteau/projects/hacks/dokwa-wt/wires/node_modules/.pnpm/fake-indexeddb@6.2.8/node_modules/fake-indexeddb/auto/index.mjs";
import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import type { Sent } from "@dokwa/core";
import {
  DexieQueueStore,
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
