/**
 * Real relays, real bytes, no stand-ins.
 *
 * These tests publish real signed events to real public relays and read them
 * back through the same Wire. The signer here is the test rig's own identity
 * generator: the payload is opaque to wires, and only the rig knows how to
 * sign one. If a relay is down, the test says so loudly rather than passing.
 *
 * One honest behaviour these tests lean on: public relays throttle. nos.lol
 * answers OK false "not acceptable at this point" after a burst, and that is
 * a temporary no, not a policy no. The queue is what makes that survivable:
 * a throttle keeps the item and retries on backoff, so the tests wait for
 * the real delivered instead of failing on a thirty second window.
 */

import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import type { Sent } from "@dokwa/core";
import { MemoryQueueStore, type DeliveryResult } from "../src/queue.ts";
import { Relays } from "../src/relay.ts";
import { createWire, type WireHandle } from "../src/wire.ts";

const WORKING_RELAY = "wss://nos.lol";
const REFUSING_RELAY = "wss://nostr.wine";
const TIMEOUT_MS = 120_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The rig's signing key. Wires never sees it; the payload is just bytes. */
const rigSecretKey = generateSecretKey();
const rigPubkey = getPublicKey(rigSecretKey);

function signedNote(text: string) {
  return finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["t", "dokwa-wires-test"]],
      content: text,
    },
    rigSecretKey,
  );
}

function publishFrame(event: { id: string }): Uint8Array {
  return encoder.encode(JSON.stringify(["EVENT", event]));
}

function subscribeFrame(sub: string, ids: string[]): Uint8Array {
  return encoder.encode(
    JSON.stringify(["REQ", sub, { ids, limit: ids.length }]),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Collect raw bytes from a wire until the predicate says stop. */
function collectUntil(
  wire: WireHandle,
  predicate: (text: string) => boolean,
  timeoutMs = 20_000,
): { frames: string[]; stop: () => void; done: Promise<string[]> } {
  const frames: string[] = [];
  let settled = false;
  let resolveDone: (frames: string[]) => void = () => {};
  const done = new Promise<string[]>((resolve) => {
    resolveDone = resolve;
  });
  const stop = wire.onBytes((from, bytes) => {
    if (from.kind !== "relay") return;
    const text = decoder.decode(bytes);
    frames.push(text);
    if (!settled && predicate(text)) {
      settled = true;
      resolveDone([...frames]);
    }
  });
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      resolveDone([...frames]);
    }
  }, timeoutMs);
  (timer as { unref?: () => void }).unref?.();
  return {
    frames,
    stop: () => {
      clearTimeout(timer);
      stop();
    },
    done,
  };
}

async function waitForOnline(wire: WireHandle, timeoutMs = 20_000) {
  const started = Date.now();
  while (!wire.isOnline()) {
    if (Date.now() - started > timeoutMs)
      throw new Error("signal never came up");
    await sleep(250);
  }
}

/**
 * Send through the queue and wait for the real outcome. A policy no comes
 * back as failed immediately; a throttle (or an offline moment) becomes
 * `later`, and the queue's retries carry it to delivered. This is the same
 * path a receipt takes, so it is the path the tests use.
 */
async function deliverToRelay(
  wire: WireHandle,
  url: string,
  bytes: Uint8Array,
  timeoutMs = 90_000,
): Promise<Sent> {
  const results: DeliveryResult[] = [];
  const stop = wire.onResult((result) => {
    if (result.to.kind === "relay" && result.to.url === url)
      results.push(result);
  });
  try {
    const sent = await wire.send({ kind: "relay", url }, bytes);
    if (sent.status === "failed") return sent;
    if (sent.status === "delivered") return sent;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const mine = results[0];
      if (mine) {
        return mine.status === "delivered"
          ? { status: "delivered" }
          : { status: "failed", reason: mine.reason ?? "rejected" };
      }
      await sleep(1_000);
    }
    throw new Error(`queue never delivered to ${url} within ${timeoutMs}ms`);
  } finally {
    stop();
  }
}

describe("relay destination, real relays", () => {
  it(
    "publishes a real signed event and hears delivered",
    async () => {
      const wire = createWire({ queue: { store: new MemoryQueueStore() } });
      await waitForOnline(wire);
      try {
        const event = signedNote(`dokwa relay publish test ${Date.now()}`);
        const sent = await deliverToRelay(
          wire,
          WORKING_RELAY,
          publishFrame(event),
        );
        expect(sent).toEqual({ status: "delivered" });
        expect(event.id).toMatch(/^[0-9a-f]{64}$/);
        expect(rigPubkey).toMatch(/^[0-9a-f]{64}$/);
        expect(await wire.pending()).toEqual([]);
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "subscribes, then sees the published event come back as bytes",
    async () => {
      const wire = createWire({ queue: { store: new MemoryQueueStore() } });
      await waitForOnline(wire);
      try {
        const event = signedNote(`dokwa relay round trip ${Date.now()}`);
        const collect = collectUntil(
          wire,
          (text) => text.includes(event.id),
          45_000,
        );
        // Ask the relay for this exact event id before it exists. The answer
        // arrives when the publish lands, through the same open socket.
        await wire.send(
          { kind: "relay", url: WORKING_RELAY },
          subscribeFrame("dokwa-test-round-trip", [event.id]),
        );
        const sent = await deliverToRelay(
          wire,
          WORKING_RELAY,
          publishFrame(event),
        );
        expect(sent).toEqual({ status: "delivered" });

        const seen = await collect.done;
        collect.stop();
        const found = seen.some((text) => text.includes(event.id));
        expect(found).toBe(true);
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "verifies an accepted event is actually stored on the relay",
    async () => {
      const wire = createWire({ queue: { store: new MemoryQueueStore() } });
      await waitForOnline(wire);
      try {
        const event = signedNote(`dokwa relay verify ${Date.now()}`);
        const sent = await deliverToRelay(
          wire,
          WORKING_RELAY,
          publishFrame(event),
        );
        expect(sent).toEqual({ status: "delivered" });
        // The later check: ask the relay for the id and require the event back.
        // This is what catches a relay that said OK and then dropped it.
        const verified = await wire.verifyRelay(
          WORKING_RELAY,
          event.id,
          20_000,
        );
        expect(verified).toEqual({ status: "delivered" });
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "reports a relay that answered and refused as failed, rejected",
    async () => {
      const wire = createWire({ queue: { store: new MemoryQueueStore() } });
      await waitForOnline(wire);
      try {
        const event = signedNote(`dokwa relay refused ${Date.now()}`);
        const sent = await wire.send(
          { kind: "relay", url: REFUSING_RELAY },
          publishFrame(event),
        );
        // nostr.wine's no is policy: "restricted". Final, not worth a retry.
        expect(sent).toEqual({
          status: "failed",
          reason: "rejected",
        });
        // A refused write is not queued: retrying it forever would be a lie.
        expect(await wire.pending()).toEqual([]);
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "a socket that opens but never confirms: transport fails, queue holds",
    async () => {
      const event = signedNote(`dokwa relay hostile ${Date.now()}`);

      // At the transport layer the honest answer is failed: connected, never
      // confirmed, timed out. An echo server is a real socket that does this.
      const relays = new Relays({
        okTimeoutMs: 4_000,
        connectTimeoutMs: 10_000,
      });
      const sent = await relays.send(
        "wss://ws.postman-echo.com/raw",
        publishFrame(event),
      );
      relays.close();
      expect(sent).toEqual({ status: "failed", reason: "timeout" });

      // Through the wire that failure is worth another try, so the caller
      // hears later and the queue keeps it. Nothing calls this delivered.
      const wire = createWire({
        queue: { store: new MemoryQueueStore() },
        relay: { okTimeoutMs: 4_000, connectTimeoutMs: 10_000 },
      });
      await waitForOnline(wire);
      try {
        const queued = await wire.send(
          { kind: "relay", url: "wss://ws.postman-echo.com/raw" },
          publishFrame(event),
        );
        expect(queued).toEqual({ status: "later" });
        const pending = await wire.pending();
        expect(pending.length).toBe(1);
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );
});

describe("relay subscription replay across a real disconnect", () => {
  it("replays a live subscription after the relay drops the socket", async () => {
    const relays = new Relays({ connectTimeoutMs: 10_000 });
    let resolveFirst: (text: string) => void = () => {};
    let resolveSecond: (text: string) => void = () => {};
    let firstId = "";
    let secondId = "";
    const first = new Promise<string>((r) => {
      resolveFirst = r;
    });
    const second = new Promise<string>((r) => {
      resolveSecond = r;
    });
    relays.onFrame((_url, bytes) => {
      const text = decoder.decode(bytes);
      const kind = text.slice(0, 24);
      if (kind.startsWith('"NOTICE"') || kind.startsWith('"OK"')) return;
      if (!firstId) return;
      if (secondId && text.includes(secondId)) resolveSecond(text);
      else if (text.includes(firstId)) resolveFirst(text);
    });

    // A publish against a throttling relay: the same bytes are accepted the
    // moment the window opens, so retry the same event on a real backoff.
    const publishRetry = async (event: { id: string }) => {
      const frame = publishFrame(event);
      for (let attempt = 0; attempt < 8; attempt++) {
        const sent = await relays.send(WORKING_RELAY, frame);
        if (sent.status === "delivered") return sent;
        expect(sent).toEqual({ status: "failed", reason: "unreachable" });
        await sleep(6_000);
      }
      throw new Error(`relay never accepted ${event.id}`);
    };

    // One live subscription on the real relay.
    const firstEvent = signedNote(`dokwa replay before cut ${Date.now()}`);
    firstId = firstEvent.id;
    await relays.send(
      WORKING_RELAY,
      subscribeFrame("dokwa-replay-sub", [firstEvent.id]),
    );
    const pubSent = await publishRetry(firstEvent);
    expect(pubSent).toEqual({ status: "delivered" });
    await first;

    // The relay drops the socket from its side. Ours closes under it.
    const record = (
      relays as unknown as {
        connections: Map<string, { socket: WebSocket | null }>;
      }
    ).connections.get(WORKING_RELAY);
    expect(record).toBeDefined();
    record!.socket?.close();

    // The reconnect replays the subscription by itself. A new event then
    // arrives on it without anyone re-sending the REQ.
    await sleep(3_000);
    const secondEvent = signedNote(`dokwa replay after cut ${Date.now()}`);
    secondId = secondEvent.id;
    const sent = await publishRetry(secondEvent);
    expect(sent).toEqual({ status: "delivered" });
    await second;
    relays.close();
  }, 180_000);
});
