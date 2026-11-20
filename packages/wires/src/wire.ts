/**
 * The one implementation of `Wire`.
 *
 * Three destinations, one queue, one signal answer. `send` always goes
 * through the outbox, so `later` is a stored promise rather than a word. A
 * chain question uses `request` because it needs an answer and cannot be
 * replayed safely; relays and peers use `send` and `onBytes`.
 */

import type {
  Destination,
  Pending,
  Sent,
  Unsubscribe,
  Wire,
} from "@dokwa/core";
import { Chain, DEFAULT_SIGNET_ENDPOINT } from "./chain.ts";
import {
  DexieQueueStore,
  Outbox,
  type DeliveryResult,
  type QueueStore,
} from "./queue.ts";
import { Peers, type PeerSignaller, type PeerState } from "./peer.ts";
import { Relays, type RelayState } from "./relay.ts";
import { createSignal, type Probe, type SignalOptions } from "./signal.ts";

export interface WireOptions {
  /** Base URL of the signet Esplora endpoint. */
  signet?: string;
  /** Timeout for chain requests, relay OKs and peer openings. */
  timeoutMs?: number;
  chain?: { signet?: string; timeoutMs?: number; fetch?: typeof fetch };
  queue?: {
    dbName?: string;
    store?: QueueStore;
    baseBackoffMs?: number;
    maxBackoffMs?: number;
  };
  signal?: SignalOptions & { probe?: Probe };
  peer?: {
    signaller?: PeerSignaller;
    iceServers?: RTCIceServer[];
    iceTransportPolicy?: RTCIceTransportPolicy;
    connectTimeoutMs?: number;
    /** See PeerOptions: "complete" for a code/QR signaller. */
    iceGathering?: "trickle" | "complete";
    iceGatheringTimeoutMs?: number;
  };
  relay?: {
    okTimeoutMs?: number;
    connectTimeoutMs?: number;
    maxBackoffMs?: number;
    WebSocketImpl?: typeof WebSocket;
  };
}

export interface RelayVerification {
  url: string;
  sent: Sent;
}

export interface WireHandle extends Wire {
  /** The same honest answer `onSignal` reports, without waiting for a change. */
  isOnline(): boolean;
  /** Ask this relay for an event id. The later check for "accepted then dropped". */
  verifyRelay(url: string, eventId: string, timeoutMs?: number): Promise<Sent>;
  /** What has finished, including the failures the seam has no field for. */
  onResult(handler: (result: DeliveryResult) => void): Unsubscribe;
  onRelayState(handler: (url: string, state: RelayState) => void): Unsubscribe;
  onPeerState(handler: (id: string, state: PeerState) => void): Unsubscribe;
  /** The conversation the seam does not have: hand the peer link a signaller. */
  setPeerSignaller(signaller: PeerSignaller | undefined): void;
  close(): void;
}

function deliverable(
  to: Destination,
  bytes: Uint8Array,
  relays: Relays,
  chain: Chain,
  peers: Peers,
): Promise<Sent> {
  switch (to.kind) {
    case "relay":
      return relays.send(to.url, bytes);
    case "chain":
      // A chain lookup needs an answer; it is `request`, not `send`.
      return Promise.resolve({ status: "failed", reason: "rejected" });
    case "peer":
      return peers.send(to.id, bytes);
  }
}

export function createWire(options: WireOptions = {}): WireHandle {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const signal = createSignal(options.signal);
  const relays = new Relays({
    okTimeoutMs: options.relay?.okTimeoutMs ?? timeoutMs,
    connectTimeoutMs: options.relay?.connectTimeoutMs ?? timeoutMs,
    maxBackoffMs: options.relay?.maxBackoffMs,
    WebSocketImpl: options.relay?.WebSocketImpl,
  });
  const chain = new Chain({
    signet: options.chain?.signet ?? options.signet ?? DEFAULT_SIGNET_ENDPOINT,
    timeoutMs: options.chain?.timeoutMs ?? timeoutMs,
    fetch: options.chain?.fetch,
  });

  const bytesListeners = new Set<
    (from: Destination, bytes: Uint8Array) => void
  >();
  const resultListeners = new Set<(result: DeliveryResult) => void>();

  const peers = new Peers(
    {
      signaller: options.peer?.signaller,
      iceServers: options.peer?.iceServers,
      iceTransportPolicy: options.peer?.iceTransportPolicy,
      connectTimeoutMs: options.peer?.connectTimeoutMs ?? timeoutMs,
      iceGathering: options.peer?.iceGathering,
      iceGatheringTimeoutMs: options.peer?.iceGatheringTimeoutMs,
    },
    (id, bytes) => {
      for (const listener of [...bytesListeners])
        listener({ kind: "peer", id }, bytes);
    },
  );

  const store =
    options.queue?.store ??
    (options.queue?.dbName
      ? new DexieQueueStore(options.queue.dbName)
      : new DexieQueueStore());

  const outbox = new Outbox({
    store,
    deliver: (to, bytes) => deliverable(to, bytes, relays, chain, peers),
    isOnline: () => signal.online(),
    baseBackoffMs: options.queue?.baseBackoffMs,
    maxBackoffMs: options.queue?.maxBackoffMs,
    onResult: (result) => {
      for (const listener of [...resultListeners]) listener(result);
    },
  });

  relays.onFrame((url, bytes) => {
    for (const listener of [...bytesListeners])
      listener({ kind: "relay", url }, bytes);
  });

  signal.on((online) => {
    if (online) void outbox.drain();
  });

  signal.start();

  const handle: WireHandle = {
    async send(to, bytes) {
      return outbox.send(to, bytes);
    },

    async request(to, bytes) {
      if (to.kind !== "chain") {
        return { status: "failed", reason: "rejected" };
      }
      return chain.request(bytes);
    },

    onBytes(handler) {
      bytesListeners.add(handler);
      return () => {
        bytesListeners.delete(handler);
      };
    },

    onSignal(handler) {
      return signal.on(handler);
    },

    async pending(): Promise<Pending[]> {
      return outbox.pending();
    },

    isOnline() {
      return signal.online();
    },

    verifyRelay(url, eventId, verifyTimeoutMs) {
      return relays.verify(url, eventId, verifyTimeoutMs ?? timeoutMs);
    },

    onResult(handler) {
      resultListeners.add(handler);
      return () => {
        resultListeners.delete(handler);
      };
    },

    onRelayState(handler) {
      return relays.onState(handler);
    },

    onPeerState(handler) {
      return peers.onState(handler);
    },

    setPeerSignaller(signaller) {
      peers.setSignaller(signaller);
    },

    close() {
      signal.stop();
      outbox.stop();
      peers.close();
      relays.close();
    },
  };

  return handle;
}
