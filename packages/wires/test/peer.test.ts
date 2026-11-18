/**
 * The peer link where a browser is not.
 *
 * Node has no RTCPeerConnection, so the real two-tab rig lives in
 * packages/wires/testbed, driven by a real browser. What can be honest in
 * Node is the answer the link gives when the platform is missing: failed
 * and unreachable, never delivered, never a crash.
 */

import { describe, expect, it } from "vitest";
import { MemoryQueueStore } from "../src/queue.ts";
import { Peers } from "../src/peer.ts";
import { createWire } from "../src/wire.ts";

const encoder = new TextEncoder();

describe("the peer link without a browser", () => {
  it("at the transport layer: failed, unreachable; through the queue: later", async () => {
    // Transport: the platform cannot open a channel, and the link says so.
    const peers = new Peers({}, () => {});
    const sent = await peers.send("till", encoder.encode("handshake"));
    expect(sent).toEqual({ status: "failed", reason: "unreachable" });

    // Through the wire that is worth another try, so the caller hears later
    // and the queue keeps it visible until the platform or the peer exists.
    const wire = createWire({ queue: { store: new MemoryQueueStore() } });
    try {
      const queued = await wire.send(
        { kind: "peer", id: "till" },
        encoder.encode("handshake"),
      );
      expect(queued).toEqual({ status: "later" });
      expect((await wire.pending()).length).toBe(1);
    } finally {
      wire.close();
    }
  });

  it("refuses a request to a peer: only the chain answers requests", async () => {
    const wire = createWire({ queue: { store: new MemoryQueueStore() } });
    try {
      const replied = await wire.request(
        { kind: "peer", id: "till" },
        encoder.encode("x"),
      );
      expect(replied).toEqual({ status: "failed", reason: "rejected" });
    } finally {
      wire.close();
    }
  });
});
