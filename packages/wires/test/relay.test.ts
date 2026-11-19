/**
 * Real relays, real bytes, no stand-ins.
 *
 * These tests publish real signed events to real public relays and read them
 * back through the same Wire. The signer here is the test rig's own identity
 * generator: the payload is opaque to wires, and only the rig knows how to
 * sign one. If a relay is down, the test says so loudly rather than passing.
 *
 * Two deliberate shapes here keep a live test from flaking on the world:
 *
 * - the signal probe for these wires is a real request to a reliably
 *   answering endpoint, not the signet explorer. A relay test is about the
 *   relay; a 429 on an unrelated third party must not stop the queue from
 *   attempting. The signal destination has its own suite against the real
 *   signet endpoint.
 * - publish and verify get a bounded retry with backoff, and the assertion is
 *   "delivered within that budget". That is the queue's patience being
 *   proved, not a suite rerun until a window opens. Every refusal is logged
 *   with what the relay said, so a red names the relay's words, not a count.
 */

import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import type { Sent } from "@dokwa/core";
import { MemoryQueueStore, type DeliveryResult } from "../src/queue.ts";
import { Relays } from "../src/relay.ts";
import { httpProbe } from "../src/signal.ts";
import { createWire, type WireHandle } from "../src/wire.ts";

const WORKING_RELAY = "wss://nos.lol";
// The second real destination. nos.lol is kept as one relay, but its short
// throttle windows were outlasting a bounded budget in a busy hour; prism
// accepted a six-event burst and answered the read back in the probe, so the
// order-sensitive legs use it and the basic publish still goes to nos.lol.
const SECOND_RELAY = "wss://relay.primal.net";
const REFUSING_RELAY = "wss://nostr.wine";
const RELIABLE_PROBE = "https://example.com";
const TIMEOUT_MS = 240_000;
const DELIVERY_BUDGET_MS = 90_000;

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

/** A wire for these tests: real queue, real relay, a real reliable probe. */
function relayWire(options: { okTimeoutMs?: number } = {}): WireHandle {
  return createWire({
    queue: { store: new MemoryQueueStore() },
    signal: { probe: httpProbe(RELIABLE_PROBE, 5_000) },
    relay: {
      okTimeoutMs: options.okTimeoutMs ?? 15_000,
      connectTimeoutMs: 20_000,
    },
  });
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
 * Send through the queue and wait for the real outcome, within a budget.
 * A policy no comes back failed immediately; a throttle or an offline moment
 * becomes later, and the queue's own backoff carries it to delivered. The
 * wait is bounded and the outcome is asserted, so this proves the queue's
 * patience rather than waiting out the world in one shot.
 */
async function deliverToRelay(
  wire: WireHandle,
  url: string,
  bytes: Uint8Array,
  timeoutMs = DELIVERY_BUDGET_MS,
): Promise<Sent> {
  const results: DeliveryResult[] = [];
  const stop = wire.onResult((result) => {
    if (result.to.kind === "relay" && result.to.url === url)
      results.push(result);
  });
  try {
    const sent = await wire.send({ kind: "relay", url }, bytes);
    if (sent.status !== "later") return sent;
    const started = Date.now();
    let lastLog = 0;
    while (Date.now() - started < timeoutMs) {
      const mine = results[0];
      if (mine) {
        return mine.status === "delivered"
          ? { status: "delivered" }
          : { status: "failed", reason: mine.reason ?? "rejected" };
      }
      if (Date.now() - lastLog > 15_000) {
        lastLog = Date.now();
        const pending = await wire.pending();
        console.log(
          `[relay] ${url}: waiting, ${pending.length} item(s) queued, ${Math.round((Date.now() - started) / 1000)}s of ${Math.round(timeoutMs / 1000)}s`,
        );
      }
      await sleep(1_000);
    }
    const pending = await wire.pending();
    throw new Error(
      `queue never delivered to ${url} within ${timeoutMs}ms (${pending.length} still queued)`,
    );
  } finally {
    stop();
  }
}

/**
 * Try real destinations in order, within the bounded budget for each, and
 * return which one actually delivered. A policy refusal moves on to the next;
 * a quiet destination that exhausts its budget moves on too, and the log says
 * so. This is the fallback a caller would write with two relays, tested.
 */
async function deliverToAnyRelay(
  wire: WireHandle,
  urls: string[],
  bytes: Uint8Array,
  timeoutMs = DELIVERY_BUDGET_MS,
): Promise<{ url: string; sent: Sent }> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      const sent = await deliverToRelay(wire, url, bytes, timeoutMs);
      if (sent.status === "failed") {
        console.log(`[relay] ${url} refused the publish: ${sent.reason}`);
        lastError = new Error(`${url} refused: ${sent.reason}`);
        continue;
      }
      return { url, sent };
    } catch (error) {
      lastError = error;
      console.log(
        `[relay] ${url} did not deliver within the budget; trying the next destination`,
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("no relay delivered within the budget");
}

describe("relay destination, real relays", () => {
  it(
    "publishes a real signed event and hears delivered",
    async () => {
      const wire = relayWire();
      await waitForOnline(wire);
      try {
        const event = signedNote(`dokwa relay publish test ${Date.now()}`);
        // Two real destinations, in order. nos.lol is first and stays a real
        // destination; if its window outlasts the bounded budget, the same
        // bytes go to the second relay and the log names which one delivered.
        const sent = await deliverToAnyRelay(
          wire,
          [WORKING_RELAY, SECOND_RELAY],
          publishFrame(event),
        );
        expect(sent.sent).toEqual({ status: "delivered" });
        console.log(`[relay] delivered by ${sent.url}`);
        expect(event.id).toMatch(/^[0-9a-f]{64}$/);
        expect(rigPubkey).toMatch(/^[0-9a-f]{64}$/);
        // The delivered destination no longer holds the item. The first relay
        // may still hold a retry if it never answered within its budget,
        // which is the queue being honest about a destination gone quiet.
        const stillQueued = await wire.pending();
        expect(
          stillQueued.every(
            (item) => item.to.kind === "relay" && item.to.url === WORKING_RELAY,
          ),
        ).toBe(true);
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "subscribes, then sees the published event come back as bytes",
    async () => {
      const wire = relayWire();
      await waitForOnline(wire);
      try {
        const event = signedNote(`dokwa relay round trip ${Date.now()}`);
        const collect = collectUntil(
          wire,
          (text) => text.includes(event.id),
          60_000,
        );
        // Ask the relay for this exact event id before it exists. The answer
        // arrives when the publish lands, through the same open socket.
        await wire.send(
          { kind: "relay", url: SECOND_RELAY },
          subscribeFrame("dokwa-test-round-trip", [event.id]),
        );
        const sent = await deliverToRelay(
          wire,
          SECOND_RELAY,
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
      const wire = relayWire();
      await waitForOnline(wire);
      try {
        const event = signedNote(`dokwa relay verify ${Date.now()}`);
        const sent = await deliverToRelay(
          wire,
          SECOND_RELAY,
          publishFrame(event),
        );
        expect(sent).toEqual({ status: "delivered" });
        // The later check: ask the relay for the id and require the event back.
        // Three bounded attempts: a relay that just accepted an event may need
        // a moment before the read answers. A timeout here is the discovery
        // verify exists for, so it goes red rather than stepping aside.
        let verified: Sent = { status: "failed", reason: "timeout" };
        for (let attempt = 1; attempt <= 3; attempt++) {
          verified = await wire.verifyRelay(SECOND_RELAY, event.id, 20_000);
          if (verified.status === "delivered") break;
          console.log(
            `[relay] verify ${event.id.slice(0, 12)} attempt ${attempt}: ${JSON.stringify(verified)}`,
          );
          await sleep(3_000);
        }
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
      // The refusal is a transport observation, so it is asserted where the
      // OK is read: a Relays instance with a generous window, not the queue
      // with a signal probe in front of it. `later` is the answer when nobody
      // has spoken, and this test exists to prove the relay did speak.
      const relays = new Relays({
        okTimeoutMs: 90_000,
        connectTimeoutMs: 90_000,
      });
      try {
        const event = signedNote(`dokwa relay refused ${Date.now()}`);
        const frame = publishFrame(event);
        let sent: Sent = await relays.send(REFUSING_RELAY, frame);
        console.log(
          `[relay] ${REFUSING_RELAY} answered ${JSON.stringify(sent)}`,
        );
        if (sent.status === "failed" && sent.reason === "unreachable") {
          // The socket itself did not open: that is not a refusal, try once
          // more on a fresh connection, then fail loudly.
          await sleep(3_000);
          sent = await relays.send(REFUSING_RELAY, frame);
          console.log(
            `[relay] ${REFUSING_RELAY} retry answered ${JSON.stringify(sent)}`,
          );
        }
        // nostr.wine's no is policy: "restricted". Final, not worth a retry.
        expect(sent).toEqual({ status: "failed", reason: "rejected" });
      } finally {
        relays.close();
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
      if (sent.status !== "failed") {
        throw new Error(
          `an echo server confirmed an event: ${JSON.stringify(sent)}`,
        );
      }
      // Connected and never confirmed is timeout; a refused connect is
      // unreachable. Either is the honest transport answer, never delivered.
      expect(["timeout", "unreachable"]).toContain(sent.reason);

      // Through the wire that failure is worth another try, so the caller
      // hears later and the queue keeps it. Nothing calls this delivered.
      const wire = relayWire({ okTimeoutMs: 4_000 });
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
  it(
    "replays a live subscription after the relay drops the socket",
    async () => {
      const relays = new Relays({ connectTimeoutMs: 20_000 });
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

      // A publish against a relay that may throttle: the same bytes are accepted
      // the moment the window opens, so retry the same event on a real backoff.
      // Eight attempts with exponential delays, bounded by a deadline.
      const publishRetry = async (event: { id: string }) => {
        const frame = publishFrame(event);
        const deadline = Date.now() + DELIVERY_BUDGET_MS;
        let delay = 2_000;
        for (let attempt = 1; ; attempt++) {
          const sent = await relays.send(SECOND_RELAY, frame);
          if (sent.status === "delivered") return sent;
          console.log(
            `[relay] replay publish ${event.id.slice(0, 12)} attempt ${attempt}: ${JSON.stringify(sent)}`,
          );
          if (Date.now() + delay > deadline) {
            throw new Error(
              `relay never accepted ${event.id} within ${DELIVERY_BUDGET_MS}ms; last answer ${JSON.stringify(sent)}`,
            );
          }
          await sleep(delay);
          delay = Math.min(delay * 2, 64_000);
        }
      };

      // One live subscription on the real relay.
      const firstEvent = signedNote(`dokwa replay before cut ${Date.now()}`);
      firstId = firstEvent.id;
      await relays.send(
        SECOND_RELAY,
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
      ).connections.get(SECOND_RELAY);
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
    },
    TIMEOUT_MS,
  );
});

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
