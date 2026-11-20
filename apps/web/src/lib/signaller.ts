/**
 * The room's PeerSignaller: offer, answer and ICE as signed Nostr events over
 * the same relay destination the app already holds. Wires carries bytes; the
 * room reads and signs them, because signalling names devices and wires never
 * sees a key.
 *
 * A REQ sent through `wire.send({ kind: 'relay' })` is how the subscription
 * exists, and `onBytes` hands back every frame on the connection. The filter
 * is ours, the subscription id is ours, and an EVENT is verified here before
 * its content is allowed to move a peer.
 */

import type { Wire } from "@dokwa/core";
import { signEvent, verifyEvent, type Identity } from "@dokwa/keys";
import type { PeerSignal, PeerSignaller } from "@dokwa/wires";

const SIGNALLING_KIND = 25050;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const DEFAULT_SIGNALLING_RELAY = "wss://relay.primal.net";

export interface RelaySignallerOptions {
  wire: Wire;
  identity: Identity;
  /** the caller-chosen link id: identity plus a per-connection nonce */
  selfId?: string;
  relay?: string;
}

export interface RelaySignaller extends PeerSignaller {
  /** the wire id this device answers to */
  readonly id: string;
  /** resolves when the relay has answered the subscription with EOSE */
  ready: Promise<void>;
  close(): void;
}

type Listener = (from: string, signal: PeerSignal) => void;

export function createRelaySignaller(
  options: RelaySignallerOptions,
): RelaySignaller {
  const { wire, identity } = options;
  const id = options.selfId ?? identity.pubkey;
  const relay = options.relay ?? DEFAULT_SIGNALLING_RELAY;
  const devicePubkey = identity.pubkey;
  const subscription = `dokwa-signal-${devicePubkey.slice(0, 8)}`;
  const listeners = new Set<Listener>();
  let settle: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    settle = resolve;
  });

  function sendFrame(frame: unknown): void {
    void wire.send(
      { kind: "relay", url: relay },
      encoder.encode(JSON.stringify(frame)),
    );
  }

  sendFrame([
    "REQ",
    subscription,
    {
      kinds: [SIGNALLING_KIND],
      "#p": [devicePubkey],
      since: Math.floor(Date.now() / 1000) - 60,
    },
  ]);

  const stop = wire.onBytes((from, bytes) => {
    if (from.kind !== "relay" || from.url !== relay) return;
    let frame: unknown;
    try {
      frame = JSON.parse(decoder.decode(bytes));
    } catch {
      return;
    }
    if (!Array.isArray(frame)) return;
    if (frame[0] === "EOSE") {
      if (frame[1] === subscription) settle?.();
      return;
    }
    if (frame[0] === "CLOSED" && frame[1] === subscription) {
      // the relay dropped the subscription; the queue will not rebuild it
      // because the REQ was a one-shot send. Say so instead of going quiet.
      console.warn(`dokwa: signalling subscription ${subscription} closed`);
      return;
    }
    if (frame[0] !== "EVENT") return;
    const event = frame[frame.length - 1] as
      | { kind?: unknown; content?: unknown; pubkey?: unknown; tags?: unknown }
      | undefined;
    if (
      !event ||
      event.kind !== SIGNALLING_KIND ||
      typeof event.content !== "string" ||
      typeof event.pubkey !== "string" ||
      event.pubkey === identity.pubkey
    ) {
      return;
    }
    const tagged = Array.isArray(event.tags)
      ? event.tags.some(
          (tag) =>
            Array.isArray(tag) && tag[0] === "p" && tag[1] === devicePubkey,
        )
      : false;
    if (!tagged) return;
    const signed = event as Parameters<typeof verifyEvent>[0];
    if (!verifyEvent(signed)) return;
    let envelope: { sender: string; signal: PeerSignal };
    try {
      envelope = JSON.parse(event.content) as typeof envelope;
    } catch {
      return;
    }
    if (
      !envelope ||
      typeof envelope.sender !== "string" ||
      !envelope.signal ||
      typeof envelope.signal.type !== "string"
    ) {
      return;
    }
    for (const listener of [...listeners]) {
      listener(envelope.sender, envelope.signal);
    }
  });

  // The relay confirms with EOSE, not with the send's `delivered`. A timeout
  // keeps a silent relay from holding a connect button forever.
  const fallback = globalThis.setTimeout(() => settle?.(), 4000);

  return {
    id,
    ready,
    async send(to, signal) {
      const event = signEvent(identity, {
        kind: SIGNALLING_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", to.split(":")[0] ?? to]],
        content: JSON.stringify({ sender: id, signal }),
      });
      const sent = await wire.send(
        { kind: "relay", url: relay },
        encoder.encode(JSON.stringify(["EVENT", event])),
      );
      if (sent.status === "failed") {
        throw new Error(
          `signalling: the relay refused the ${signal.type} (${sent.reason})`,
        );
      }
    },
    onSignal(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    close() {
      globalThis.clearTimeout(fallback);
      stop();
      sendFrame(["CLOSE", subscription]);
    },
  };
}
