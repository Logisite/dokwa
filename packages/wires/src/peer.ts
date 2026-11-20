/**
 * The peer link: one WebRTC data channel, bytes in and bytes out.
 *
 * The identity of the peer and the way offers and answers travel are supplied
 * by the room as a `PeerSignaller`. That keeps signing outside wires while
 * letting signalling use the same relay the rest of the app uses. The data
 * channel itself is ordered and reliable; we add no framing on top, so a
 * receiver sees exactly the chunks the platform delivered and frames them.
 *
 * The Destination id is the link identity. When a caller needs one connection
 * distinguished from another (a stale outbox item from an earlier session
 * must never reach a new channel), it chooses a per-link id, for example the
 * peer's public key plus a link nonce carried in the code. Wires keys the
 * outbox and the peer record by that string and hands it back unchanged in
 * `onBytes`, so two links with the same peer and different ids are two
 * queues, two records and two destinations. No second field is needed.
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
  /**
   * Optional: resolves when this signaller can receive replies, for example
   * when its relay subscription has answered EOSE. The offer is not published
   * before this settles, so an answer cannot arrive before the offerer is
   * listening.
   */
  readonly ready?: Promise<void>;
}

export interface PeerOptions {
  signaller?: PeerSignaller;
  iceServers?: RTCIceServer[];
  /**
   * "all" (default) or "relay". Relay forces every candidate through a TURN
   * server, which is how a TURN path is proved rather than assumed.
   */
  iceTransportPolicy?: RTCIceTransportPolicy;
  /**
   * How long a data channel may take to open. In the code path the clock runs
   * from the offer being generated to the answer being applied, so a code
   * carried by hand needs minutes, not the relay default of seconds.
   */
  connectTimeoutMs?: number;
  /**
   * How ICE candidates reach the peer.
   *
   * "trickle" (the default) sends each candidate as its own `ice` signal,
   * which is what a live relay or data channel is for.
   *
   * "complete" waits for gathering to finish and puts the candidates in the
   * offer or answer SDP, so one code carries everything. That is the shape
   * the specification's signalling QR needs (D8, 9.3): two phones, no
   * network, one code each way. Use `iceServers: []` for a hotspot with no
   * uplink, so gathering does not wait on an unreachable STUN server.
   */
  iceGathering?: "trickle" | "complete";
  /** How long "complete" waits for gathering before sending the SDP as-is. */
  iceGatheringTimeoutMs?: number;
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
  /** The offer this record answered, and the answer it sent. */
  lastOfferSdp: string;
  lastAnswerSdp: string;
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

  /** One state change, delivered to every onState listener. */
  private emit(id: string, state: PeerState): void {
    this.emitState(id, state);
    for (const listener of [...this.stateListeners]) listener(id, state);
  }

  async connect(id: string): Promise<void> {
    if (typeof RTCPeerConnection === "undefined") {
      throw new Error("RTCPeerConnection is unavailable");
    }
    if (!this.signaller) throw new Error("no peer signaller");
    // Publish only once the signaller can hear the reply. Without this the
    // offer can go out before the REQ is live, the answer is missed, and ICE
    // fails with no remote candidates.
    if (this.signaller.ready) await this.signaller.ready;

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
    await this.settleIce(record.pc);
    await this.signaller.send(id, {
      type: "offer",
      sdp: record.pc.localDescription?.sdp ?? offer.sdp ?? "",
    });

    await record.ready;
  }

  /**
   * In "complete" mode the SDP must carry its candidates before it leaves,
   * because a code has no second channel to trickle them through. In
   * "trickle" mode there is nothing to wait for.
   */
  private settleIce(pc: RTCPeerConnection): Promise<void> {
    if (this.options.iceGathering !== "complete") return Promise.resolve();
    return waitForIceGathering(pc, this.options.iceGatheringTimeoutMs ?? 5_000);
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
    this.signalQueue.clear();
  }

  /**
   * Signals for one peer are applied one at a time. A relay can deliver two
   * offers back to back, and both used to pass the duplicate check before
   * either recorded a remote description; the second then answered a record
   * already stable and the link died. Serialising per peer fixes the race
   * without dropping any signal.
   */
  private handleSignal(from: string, signal: PeerSignal): Promise<void> {
    const prior = this.signalQueue.get(from) ?? Promise.resolve();
    const run = prior
      .then(() => this.applySignal(from, signal))
      .catch(() => {
        // applySignal reports and cleans up its own failures.
      });
    this.signalQueue.set(from, run);
    void run.finally(() => {
      if (this.signalQueue.get(from) === run) this.signalQueue.delete(from);
    });
    return run;
  }

  private readonly signalQueue = new Map<string, Promise<void>>();

  private async applySignal(from: string, signal: PeerSignal): Promise<void> {
    if (signal.type === "bye") {
      this.destroy(from);
      return;
    }

    if (signal.type === "offer") {
      const existing = this.records.get(from);
      // A signalling transport may replay an offer: a relay on reconnect, a
      // queued event, a retried frame. An open record ignores repeats. A
      // connecting record with the same offer resends its answer, because the
      // first answer may simply have been lost; ignoring it would leave the
      // caller stuck in connecting forever. A different offer is applied as
      // a fresh one.
      if (existing?.channel?.readyState === "open") {
        console.warn(
          `[wires:peer] ignoring a repeated offer on an open link from ${from.slice(0, 8)}`,
        );
        return;
      }
      if (
        existing &&
        existing.remoteSet &&
        existing.lastAnswerSdp &&
        existing.lastOfferSdp === signal.sdp
      ) {
        console.warn(
          `[wires:peer] resending the answer for a repeated offer from ${from.slice(0, 8)}`,
        );
        try {
          await this.signaller?.send(from, {
            type: "answer",
            sdp: existing.lastAnswerSdp,
          });
        } catch (error) {
          console.warn(
            `[wires:peer] could not resend the answer to ${from.slice(0, 8)}:`,
            (error as Error)?.message,
          );
        }
        return;
      }
      const record = existing ?? this.createRecord(from);
      try {
        await record.pc.setRemoteDescription({
          type: "offer",
          sdp: signal.sdp,
        });
        record.remoteSet = true;
        record.lastOfferSdp = signal.sdp;
        await this.flushCandidates(record);
        const answer = await record.pc.createAnswer();
        await record.pc.setLocalDescription(answer);
        await this.settleIce(record.pc);
        const answerSdp = record.pc.localDescription?.sdp ?? answer.sdp ?? "";
        record.lastAnswerSdp = answerSdp;
        await this.signaller?.send(from, { type: "answer", sdp: answerSdp });
      } catch (error) {
        // Destroying is right for a fresh offer that cannot be applied, but
        // the reason must be visible rather than swallowed into "peer closed".
        console.warn(
          `[wires:peer] offer from ${from.slice(0, 8)} could not be applied:`,
          (error as Error)?.message,
        );
        this.destroy(from);
      }
      return;
    }

    const record = this.records.get(from);
    if (!record) return;

    if (signal.type === "answer") {
      if (record.remoteSet) {
        // A replayed answer would reject in a stable state; ignore it.
        console.warn(
          `[wires:peer] ignoring a repeated answer from ${from.slice(0, 8)}`,
        );
        return;
      }
      try {
        await record.pc.setRemoteDescription({
          type: "answer",
          sdp: signal.sdp,
        });
        record.remoteSet = true;
        await this.flushCandidates(record);
      } catch (error) {
        console.warn(
          `[wires:peer] answer from ${from.slice(0, 8)} could not be applied:`,
          (error as Error)?.message,
        );
        this.destroy(from);
      }
      return;
    }

    if (signal.type === "ice") {
      // In "complete" mode the candidates are already inside the SDP; stray
      // ice signals are ignored rather than added twice.
      if (this.options.iceGathering === "complete") return;
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
      iceTransportPolicy: this.options.iceTransportPolicy,
    });
    let resolveReady!: (channel: RTCDataChannel) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<RTCDataChannel>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // The answerer never awaits `ready`; a destroyed record would otherwise
    // leave a rejected promise with no handler and show up as an unhandled
    // rejection. Mark it handled; `connect` still receives the rejection.
    void ready.catch(() => {});

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
      lastOfferSdp: "",
      lastAnswerSdp: "",
    };
    this.records.set(id, record);
    this.emit(id, "connecting");

    record.timer = setTimeout(() => {
      if (record.settled) return;
      record.settled = true;
      record.rejectReady(new PeerTimeout());
      this.destroy(id);
    }, this.options.connectTimeoutMs ?? 15_000);
    (record.timer as { unref?: () => void }).unref?.();

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      // In "complete" mode the candidate is already being gathered into the
      // SDP, and there is no channel to trickle it through.
      if (this.options.iceGathering === "complete") return;
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
      this.emit(record.id, "open");
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
    this.emit(id, "closed");
  }
}

class PeerTimeout extends Error {}

/**
 * Resolve when ICE gathering has finished, or when the cap expires. The cap
 * matters on a hotspot with no uplink: an unreachable STUN server must not
 * hold a code hostage. The gathered candidates are already inside the SDP by
 * the time this resolves.
 */
function waitForIceGathering(
  pc: RTCPeerConnection,
  timeoutMs: number,
): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", onChange);
      pc.removeEventListener("icecandidate", onCandidate);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const onCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate === null) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    (timer as { unref?: () => void }).unref?.();
    pc.addEventListener("icegatheringstatechange", onChange);
    pc.addEventListener("icecandidate", onCandidate);
  });
}
