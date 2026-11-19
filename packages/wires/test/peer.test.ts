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
import { Peers, type PeerSignal } from "../src/peer.ts";
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
  static rejectNextRemote = false;
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  signalingState = "stable";
  connectionState = "new";
  iceGatheringState = "complete";
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: { channel: FakeChannel }) => void) | null = null;
  private channel: FakeChannel | null = null;

  constructor() {}

  createDataChannel(): FakeChannel {
    this.channel = new FakeChannel();
    return this.channel;
  }

  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: "offer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n" };
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: "answer", sdp: "v=0\r\no=- 1 0 IN IP4 127.0.0.1\r\n" };
  }

  async setRemoteDescription(description: {
    type: string;
    sdp: string;
  }): Promise<void> {
    if (FakePeerConnection.rejectNextRemote) {
      FakePeerConnection.rejectNextRemote = false;
      throw new Error("Failed to parse SessionDescription: test rejection");
    }
    if (description.type === "offer") {
      if (this.signalingState === "have-local-offer") {
        throw new Error("Called in wrong state: have-local-offer");
      }
      this.signalingState = "have-remote-offer";
    } else {
      if (this.signalingState !== "have-local-offer") {
        throw new Error(`Called in wrong state: ${this.signalingState}`);
      }
      this.signalingState = "stable";
    }
    this.remoteDescription = description;
  }

  async setLocalDescription(description: {
    type: string;
    sdp: string;
  }): Promise<void> {
    if (description.type === "answer") {
      if (this.signalingState !== "have-remote-offer") {
        throw new Error(`Called in wrong state: ${this.signalingState}`);
      }
      this.signalingState = "stable";
    } else {
      this.signalingState = "have-local-offer";
    }
    this.localDescription = description;
    // The platform brings the channel up just after the description lands:
    // the offerer opens the one it created, the answerer receives one.
    setTimeout(() => {
      if (description.type === "offer") {
        if (!this.channel) return;
        this.channel.readyState = "open";
        this.channel.onopen?.();
        return;
      }
      const channel = new FakeChannel();
      this.ondatachannel?.({ channel });
      channel.readyState = "open";
      channel.onopen?.();
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

  it("a repeated offer does not tear down an open link", async () => {
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    let deliver: ((from: string, signal: PeerSignal) => void) | null = null;
    const answers: PeerSignal[] = [];
    const states: string[] = [];
    const peers = new Peers(
      {
        signaller: {
          async send(_to, signal) {
            answers.push(signal);
          },
          onSignal(handler) {
            deliver = handler;
            return () => {
              deliver = null;
            };
          },
        },
      },
      () => {},
    );
    peers.onState((_id, state) => states.push(state));
    try {
      const offer: PeerSignal = {
        type: "offer",
        sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n",
      };
      deliver!("wallet", offer);
      await new Promise((r) => setTimeout(r, 20));
      expect(states).toEqual(["connecting", "open"]);
      expect(answers.filter((signal) => signal.type === "answer")).toHaveLength(
        1,
      );

      // The relay or a retry replays the same offer: ignore it, do not destroy.
      deliver!("wallet", offer);
      await new Promise((r) => setTimeout(r, 20));
      expect(states).not.toContain("closed");
      expect(answers.filter((signal) => signal.type === "answer")).toHaveLength(
        1,
      );
    } finally {
      peers.close();
    }
  });

  it("a rejected remote description is reported, not swallowed", async () => {
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    FakePeerConnection.rejectNextRemote = true;
    const warnings: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
      });
    let deliver: ((from: string, signal: PeerSignal) => void) | null = null;
    const states: string[] = [];
    const peers = new Peers(
      {
        signaller: {
          async send() {},
          onSignal(handler) {
            deliver = handler;
            return () => {
              deliver = null;
            };
          },
        },
      },
      () => {},
    );
    peers.onState((_id, state) => states.push(state));
    try {
      deliver!("wallet", {
        type: "offer",
        sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n",
      });
      await new Promise((r) => setTimeout(r, 20));
      const text = warnings.join(" | ");
      expect(text).toContain("could not be applied");
      expect(text).toContain("Failed to parse SessionDescription");
      // A fresh offer that cannot be applied is destroyed, which is right.
      expect(states).toContain("closed");
    } finally {
      spy.mockRestore();
      peers.close();
    }
  });

  it("two offers back to back produce one answer, not a state error", async () => {
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    const warnings: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
      });
    let deliver: ((from: string, signal: PeerSignal) => void) | null = null;
    const answers: PeerSignal[] = [];
    const states: string[] = [];
    const peers = new Peers(
      {
        signaller: {
          async send(_to, signal) {
            answers.push(signal);
          },
          onSignal(handler) {
            deliver = handler;
            return () => {
              deliver = null;
            };
          },
        },
      },
      () => {},
    );
    peers.onState((_id, state) => states.push(state));
    try {
      const offer: PeerSignal = {
        type: "offer",
        sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n",
      };
      // Both delivered in the same tick, as a relay replay can.
      deliver!("wallet", offer);
      deliver!("wallet", offer);
      await new Promise((r) => setTimeout(r, 40));
      expect(warnings.join(" | ")).not.toContain("could not be applied");
      expect(answers.filter((signal) => signal.type === "answer")).toHaveLength(
        1,
      );
      expect(states).toEqual(["connecting", "open"]);
    } finally {
      spy.mockRestore();
      peers.close();
    }
  });
});
