/**
 * The peer link: one WebRTC data channel, bytes in and bytes out.
 *
 * The identity of the peer and the way offers and answers travel are supplied
 * by the room as a `PeerSignaller`. That keeps signing outside wires while
 * letting signalling use the same relay the rest of the app uses. The data
 * channel itself is ordered and reliable; we add no framing on top, so a
 * receiver sees exactly the chunks the platform delivered and frames them.
 */

import type { Sent, Unsubscribe } from "@dokwa/core";

export type PeerSignal =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "bye" };

export interface PeerSignaller {
  send(to: string, signal: PeerSignal): Promise<void>;
  onSignal(handler: (from: string, signal: PeerSignal) => void): Unsubscribe;
}

export interface PeerOptions {
  signaller?: PeerSignaller;
  iceServers?: RTCIceServer[];
  /** How long a data channel may take to open. */
  connectTimeoutMs?: number;
}

export type PeerState = "connecting" | "open" | "closed";

interface PeerRecord {
  id: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  ready: Promise<RTCDataChannel>;
  resolveReady: (channel: RTCDataChannel) => void;
  rejectReady: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
  remoteSet: boolean;
  candidates: RTCIceCandidateInit[];
}

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export class Peers {
  private readonly options: PeerOptions;
  private readonly emitBytes: (id: string, bytes: Uint8Array) => void;
  private readonly emitState: (id: string, state: PeerState) => void;
  private readonly records = new Map<string, PeerRecord>();
  private signaller?: PeerSignaller;
  private unsubscribe?: Unsubscribe;

  constructor(
    options: PeerOptions,
    emitBytes: (id: string, bytes: Uint8Array) => void,
    emitState: (id: string, state: PeerState) => void = () => {},
  ) {
    this.options = options;
    this.emitBytes = emitBytes;
    this.emitState = emitState;
    this.setSignaller(options.signaller);
  }

  setSignaller(signaller: PeerSignaller | undefined): void {
    this.unsubscribe?.();
    this.signaller = signaller;
    this.unsubscribe = signaller?.onSignal((from, signal) => {
      void this.handleSignal(from, signal);
    });
  }

  onState(handler: (id: string, state: PeerState) => void): Unsubscribe {
    // State is advisory; bytes are the contract. One listener is enough for
    // the room to show a connecting badge.
    this.stateListeners.add(handler);
    return () => {
      this.stateListeners.delete(handler);
    };
  }

  private readonly stateListeners = new Set<
    (id: string, state: PeerState) => void
  >();

  async connect(id: string): Promise<void> {
    if (typeof RTCPeerConnection === "undefined") {
      throw new Error("RTCPeerConnection is unavailable");
    }
    if (!this.signaller) throw new Error("no peer signaller");

    const existing = this.records.get(id);
    if (existing) {
      if (existing.channel?.readyState === "open") return;
      await existing.ready;
      return;
    }

    const record = this.createRecord(id);
    const channel = record.pc.createDataChannel("dokwa", { ordered: true });
    this.attach(record, channel);

    const offer = await record.pc.createOffer();
    await record.pc.setLocalDescription(offer);
    await this.signaller.send(id, {
      type: "offer",
      sdp: record.pc.localDescription?.sdp ?? offer.sdp ?? "",
    });

    await record.ready;
  }

  async send(id: string, bytes: Uint8Array): Promise<Sent> {
    if (typeof RTCPeerConnection === "undefined") {
      return { status: "failed", reason: "unreachable" };
    }
    if (!this.signaller) {
      return { status: "failed", reason: "unreachable" };
    }

    try {
      await this.connect(id);
    } catch (error) {
      return {
        status: "failed",
        reason: error instanceof PeerTimeout ? "timeout" : "unreachable",
      };
    }

    const record = this.records.get(id);
    const channel = record?.channel;
    if (!channel || channel.readyState !== "open") {
      return { status: "failed", reason: "unreachable" };
    }

    try {
      channel.send(bytes.slice().buffer);
      return { status: "delivered" };
    } catch {
      return { status: "failed", reason: "unreachable" };
    }
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const record of this.records.values()) this.destroy(record.id);
    this.records.clear();
  }

  private async handleSignal(from: string, signal: PeerSignal): Promise<void> {
    if (signal.type === "bye") {
      this.destroy(from);
      return;
    }

    if (signal.type === "offer") {
      let record = this.records.get(from);
      if (!record) record = this.createRecord(from);
      try {
        await record.pc.setRemoteDescription({
          type: "offer",
          sdp: signal.sdp,
        });
        record.remoteSet = true;
        await this.flushCandidates(record);
        const answer = await record.pc.createAnswer();
        await record.pc.setLocalDescription(answer);
        await this.signaller?.send(from, {
          type: "answer",
          sdp: record.pc.localDescription?.sdp ?? answer.sdp ?? "",
        });
      } catch {
        this.destroy(from);
      }
      return;
    }

    const record = this.records.get(from);
    if (!record) return;

    if (signal.type === "answer") {
      try {
        await record.pc.setRemoteDescription({
          type: "answer",
          sdp: signal.sdp,
        });
        record.remoteSet = true;
        await this.flushCandidates(record);
      } catch {
        this.destroy(from);
      }
      return;
    }

    if (signal.type === "ice") {
      if (record.remoteSet) {
        try {
          await record.pc.addIceCandidate(signal.candidate);
        } catch {
          // an ICE candidate that arrives too late is not fatal
        }
      } else {
        record.candidates.push(signal.candidate);
      }
    }
  }

  private async flushCandidates(record: PeerRecord): Promise<void> {
    const candidates = record.candidates.splice(0);
    for (const candidate of candidates) {
      try {
        await record.pc.addIceCandidate(candidate);
      } catch {
        // stale candidate; the connection will find another path
      }
    }
  }

  private createRecord(id: string): PeerRecord {
    const pc = new RTCPeerConnection({
      iceServers: this.options.iceServers ?? DEFAULT_ICE,
    });
    let resolveReady!: (channel: RTCDataChannel) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<RTCDataChannel>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const record: PeerRecord = {
      id,
      pc,
      channel: null,
      ready,
      resolveReady,
      rejectReady,
      timer: null,
      settled: false,
      remoteSet: false,
      candidates: [],
    };
    this.records.set(id, record);
    this.emitState(id, "connecting");

    record.timer = setTimeout(() => {
      if (record.settled) return;
      record.settled = true;
      record.rejectReady(new PeerTimeout());
      this.destroy(id);
    }, this.options.connectTimeoutMs ?? 15_000);
    (record.timer as { unref?: () => void }).unref?.();

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void this.signaller
        ?.send(id, { type: "ice", candidate: event.candidate.toJSON() })
        .catch(() => {
          // signalling is best effort: host candidates may still connect
        });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.destroy(id);
      }
    };

    pc.ondatachannel = (event) => {
      this.attach(record, event.channel);
    };

    return record;
  }

  private attach(record: PeerRecord, channel: RTCDataChannel): void {
    record.channel = channel;
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      if (record.settled) return;
      record.settled = true;
      if (record.timer) {
        clearTimeout(record.timer);
        record.timer = null;
      }
      record.resolveReady(channel);
      this.emitState(record.id, "open");
    };

    channel.onmessage = (event: MessageEvent) => {
      const data = event.data;
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : typeof data === "string"
            ? new TextEncoder().encode(data)
            : new Uint8Array();
      this.emitBytes(record.id, bytes);
    };

    channel.onclose = () => {
      this.destroy(record.id);
    };
  }

  private destroy(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    this.records.delete(id);
    if (record.timer) clearTimeout(record.timer);
    if (!record.settled) {
      record.settled = true;
      record.rejectReady(new Error("peer closed"));
    }
    try {
      record.channel?.close();
    } catch {
      // ignore
    }
    try {
      record.pc.close();
    } catch {
      // ignore
    }
    this.emitState(id, "closed");
  }
}

class PeerTimeout extends Error {}
