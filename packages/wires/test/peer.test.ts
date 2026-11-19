/**
 * The peer link where a browser is not.
 *
 * Node has no RTCPeerConnection, so the real two-tab rig lives in
 * packages/wires/testbed, driven by a real browser. What can be honest in
 * Node is the answer the link gives when the platform is missing: failed
 * and unreachable, never delivered, never a crash.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryQueueStore } from "../src/queue.ts";
import { Peers } from "../src/peer.ts";
import { createWire } from "../src/wire.ts";

const encoder = new TextEncoder();

/**
 * The smallest platform stub that can drive the real peer link: a data
 * channel that opens when the local description is set, and an SDP that is
 * only ever passed back to the signaller. This is a stub for the browser
 * platform, not for a destination; the real platform proof is the two-tab
 * testbed run cited on the board.
 */
class FakeChannel {
  readyState = "connecting";
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: unknown[] = [];
  send(data: unknown): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = "closed";
    this.onclose?.();
  }
}

class FakePeerConnection {
  localDescription: { type: string; sdp: string } | null = null;
  connectionState = "new";
  iceGatheringState = "complete";
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: { channel: FakeChannel }) => void) | null = null;
  private channel: FakeChannel | null = null;

  constructor(_configuration?: unknown) {}

  createDataChannel(_label?: string, _options?: unknown): FakeChannel {
    this.channel = new FakeChannel();
    return this.channel;
  }

  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: "offer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n" };
  }

  async setLocalDescription(description: {
    type: string;
    sdp: string;
  }): Promise<void> {
    this.localDescription = description;
    // The platform opens the channel just after the description lands.
    setTimeout(() => {
      if (!this.channel) return;
      this.channel.readyState = "open";
      this.channel.onopen?.();
    }, 0);
  }

  close(): void {
    this.connectionState = "closed";
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("the peer link's state, on a stubbed platform", () => {
  it("onPeerState sees connecting then open, in that order", async () => {
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    const states: string[] = [];
    const peers = new Peers(
      {
        signaller: {
          async send() {},
          onSignal() {
            return () => {};
          },
        },
      },
      () => {},
    );
    peers.onState((_id, state) => states.push(state));
    try {
      const sent = await peers.send("till", encoder.encode("handshake"));
      expect(sent).toEqual({ status: "delivered" });
      expect(states).toEqual(["connecting", "open"]);
    } finally {
      peers.close();
    }
  });
});
