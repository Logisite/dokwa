import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { initializeWasmFromBinary } from "lightningdevkit";
import type { Destination, Pending, Replied, Sent, Wire } from "@dokwa/core";
import { openLightning, type LightningNode } from "../src/node.ts";
import type { LightningStore } from "../src/store.ts";

const wasm = new Uint8Array(
  readFileSync(
    new URL(
      "../node_modules/lightningdevkit/liblightningjs.wasm",
      import.meta.url,
    ),
  ),
);
await initializeWasmFromBinary(wasm);

function memoryStore(): LightningStore {
  const state = new Map<string, Uint8Array>();
  return {
    async readState(key) {
      return state.get(key) ?? null;
    },
    async writeStates(entries) {
      for (const [key, bytes] of entries) state.set(key, bytes);
    },
    async listKeys(prefix) {
      return [...state.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

/**
 * A Wire whose peer destination delivers straight to the other node, and
 * which can lie about chunking on the first outbound message: the seam
 * promises bytes in arrival order and nothing else, so the receiver must
 * frame. LDK's read_event buffers the remainder.
 */
function pipeWire(
  deliver: (fromId: string, bytes: Uint8Array) => void,
  options: { splitFirst?: boolean } = {},
): { wire: Wire; sent: () => number } {
  let sent = 0;
  const wire: Wire = {
    async send(to: Destination, bytes: Uint8Array): Promise<Sent> {
      if (to.kind !== "peer") return { status: "failed", reason: "rejected" };
      sent += 1;
      if (options.splitFirst && sent === 1 && bytes.length > 3) {
        const half = Math.floor(bytes.length / 2);
        deliver(to.id, bytes.slice(0, half));
        deliver(to.id, bytes.slice(half));
      } else {
        deliver(to.id, bytes);
      }
      return { status: "delivered" };
    },
    async request(): Promise<Replied> {
      return { status: "failed", reason: "rejected" };
    },
    onBytes(): () => void {
      return () => {};
    },
    onSignal(): () => void {
      return () => {};
    },
    async pending(): Promise<Pending[]> {
      return [];
    },
  };
  return { wire, sent: () => sent };
}

async function pair(options: { splitFirst?: boolean } = {}): Promise<{
  a: LightningNode;
  b: LightningNode;
  sentToB: () => number;
  sentToA: () => number;
}> {
  const nodes: { a?: LightningNode; b?: LightningNode } = {};
  // A's outbound bytes arrive at B, and B's at A. The split lie rides A's
  // first send, which is the Init message.
  const fromA = pipeWire(
    (_from, bytes) => nodes.b?.receiveBytes("a", bytes),
    options,
  );
  const fromB = pipeWire((_from, bytes) => nodes.a?.receiveBytes("b", bytes));
  const nodeB = await openLightning({
    seed: new Uint8Array(32).fill(31),
    wasm,
    store: memoryStore(),
    wire: fromB.wire,
  });
  nodes.b = nodeB;
  const nodeA = await openLightning({
    seed: new Uint8Array(32).fill(32),
    wasm,
    store: memoryStore(),
    wire: fromA.wire,
  });
  nodes.a = nodeA;
  return {
    a: nodeA,
    b: nodeB,
    sentToB: () => fromA.sent(),
    sentToA: () => fromB.sent(),
  };
}

describe("the peer byte surface", () => {
  it("two real LDK nodes complete their handshake over the Wire", async () => {
    const { a, b, sentToA, sentToB } = await pair();
    expect(a.nodeId).not.toBe(b.nodeId);
    // b listens, a dials; the Init bytes go over the wire, the reply comes back
    b.acceptPeer("a");
    a.connectPeer("b", b.nodeId);
    // outbound bytes are handed to the Wire in microtasks, so let the
    // handshake drain
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(sentToB()).toBeGreaterThan(0);
    expect(sentToA()).toBeGreaterThan(0);
    // LDK's own view of the connection, not ours
    expect(a.peers()).toBe(1);
    expect(b.peers()).toBe(1);
  });

  it("a message split across two arrivals is framed by LDK, not the carrier", async () => {
    const { a, b } = await pair({ splitFirst: true });
    b.acceptPeer("a");
    a.connectPeer("b", b.nodeId);
    await new Promise((resolve) => setTimeout(resolve, 25));
    // the first message arrived in two pieces; the handshake still completes
    expect(a.peers()).toBe(1);
    expect(b.peers()).toBe(1);
  });

  it("refuses bytes for a peer it never registered", async () => {
    const { a } = await pair();
    expect(() => a.receiveBytes("nobody", new Uint8Array([1, 2, 3]))).toThrow(
      /no peer is registered/,
    );
  });

  it("refuses a peer id that is not a compressed node key", async () => {
    const { a } = await pair();
    expect(() => a.connectPeer("b", "not a key")).toThrow(/66 hex characters/);
  });
});
