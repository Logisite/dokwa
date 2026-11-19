/**
 * The peer testbed. Two tabs of this page are two peers.
 *
 * Everything here is rig, not package: the signaller signs its own ephemeral
 * events over the relay destination, the demo receiver frames with a length
 * prefix to show framing is the receiver's job, and the log is the evidence
 * the driver reads. Wires itself is imported and used exactly as the app
 * will use it: createWire, wire.send, wire.onBytes, no extras.
 */

import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import type { Destination, Sent } from "@dokwa/core";
import {
  createWire,
  type PeerSignal,
  type PeerSignaller,
  type WireHandle,
} from "@dokwa/wires";

const RELAY = "wss://nos.lol";
const SIGNALLING_KIND = 25050; // ephemeral: no relay needs to keep these

// -- The rig's own identity and signaller. This code signs; the package
// above it still does not. ---------------------------------------------------

const rigSecretKey = generateSecretKey();
const myPubkey = getPublicKey(rigSecretKey);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type SignallingListener = (from: string, signal: PeerSignal) => void;

const listeners = new Set<SignallingListener>();

function relayFrame(kind: unknown, payload: unknown): Uint8Array {
  return encoder.encode(
    JSON.stringify(kind === "EVENT" ? ["EVENT", payload] : [kind, payload]),
  );
}

async function publishSignal(to: string, signal: PeerSignal): Promise<void> {
  const event = finalizeEvent(
    {
      kind: SIGNALLING_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", to]],
      content: JSON.stringify(signal),
    },
    rigSecretKey,
  );
  await wire.send({ kind: "relay", url: RELAY }, relayFrame("EVENT", event));
}

const signaller: PeerSignaller = {
  async send(to, signal) {
    await publishSignal(to, signal);
  },
  onSignal(handler) {
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  },
};

// -- The wire, exactly as the app will hold it. ------------------------------

const wire: WireHandle = createWire({
  // One queue per tab: two tabs share an origin, and each is its own peer
  // with its own outbox, so the storage names are kept apart the same way
  // two devices would keep theirs apart.
  queue: { dbName: `dokwa:wires:testbed-${myPubkey.slice(0, 8)}` },
  peer: { signaller },
});

// Subscribe for signalling events addressed to this tab.
wire
  .send(
    { kind: "relay", url: RELAY },
    encoder.encode(
      JSON.stringify([
        "REQ",
        `dokwa-testbed-${myPubkey.slice(0, 8)}`,
        {
          kinds: [SIGNALLING_KIND],
          "#p": [myPubkey],
          since: Math.floor(Date.now() / 1000) - 60,
        },
      ]),
    ),
  )
  .then((sent: Sent) => log(`signalling subscription: ${JSON.stringify(sent)}`))
  .catch((error: unknown) =>
    log(`signalling subscription failed: ${String(error)}`),
  );

wire.onBytes((from: Destination, bytes: Uint8Array) => {
  if (from.kind === "relay") {
    // Signalling frames arrive as bytes; the rig reads them because the rig
    // is the signaller. Application bytes never pass through here.
    let frame: unknown;
    try {
      frame = JSON.parse(decoder.decode(bytes));
    } catch {
      return;
    }
    if (!Array.isArray(frame) || frame[0] !== "EVENT") return;
    const event = frame[frame.length - 1] as
      { kind?: unknown; content?: unknown; pubkey?: unknown } | undefined;
    if (
      !event ||
      event.kind !== SIGNALLING_KIND ||
      typeof event.content !== "string"
    )
      return;
    let signal: PeerSignal;
    try {
      signal = JSON.parse(event.content) as PeerSignal;
    } catch {
      return;
    }
    const from = typeof event.pubkey === "string" ? event.pubkey : "";
    if (from === myPubkey) return; // the relay echoes our own events: ignore
    log(`signalling: ${signal.type} from ${from.slice(0, 8)}`);
    for (const listener of [...listeners]) listener(from, signal);
    return;
  }
  if (from.kind === "peer") {
    // The app's raw bytes. Log them byte-exact, then hand them to the demo
    // receiver, which frames with a length prefix.
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    log(`peer bytes (${bytes.length}): ${hex}`);
    incoming.push(new Uint8Array(bytes));
    frameReceived();
  }
});

// -- The demo receiver: framing is the receiver's job. ----------------------

const incoming: Uint8Array[] = [];
let buffer = new Uint8Array(0);
const framed: number[][] = [];

function frameReceived(): void {
  buffer = concat(buffer, ...incoming.splice(0));
  for (;;) {
    if (buffer.length < 2) return;
    const length = (buffer[0] << 8) | buffer[1]!;
    if (buffer.length < 2 + length) return;
    const message = buffer.slice(2, 2 + length);
    framed.push([...message]);
    buffer = buffer.slice(2 + length);
    log(`framed message: ${[...message].join(",")}`);
  }
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

// -- The driver surface ------------------------------------------------------

function log(text: string): void {
  const at = document.getElementById("log")!;
  at.textContent += `\n${new Date().toISOString()} ${text}`;
  (window as unknown as { __log: string[] }).__log.push(text);
}

(window as unknown as { __log: string[] }).__log = [];

const api = {
  myPubkey,
  wire,
  async connectTo(id: string): Promise<void> {
    if (!id || id.startsWith('"'))
      throw new Error("peer id is not a bare hex pubkey");
    log(`connecting to ${id.slice(0, 8)}`);
    await wire.send({ kind: "peer", id }, encoder.encode("")); // opens the link
    log("connect send answered");
  },
  async sendBytes(bytes: number[]): Promise<Sent> {
    // Every payload the testbed sends is length prefixed, so the demo
    // receiver's stream is a single coherent framing stream. Two bytes big
    // endian, then the payload.
    const frame = [bytes.length >> 8, bytes.length & 255, ...bytes];
    const sent = await wire.send(
      { kind: "peer", id: api.peerId },
      new Uint8Array(frame),
    );
    log(`sent ${bytes.length} bytes: ${JSON.stringify(sent)}`);
    return sent;
  },
  peerId: "",
  framed,
  log,
};

Object.assign(window, { __tb: api });
document.getElementById("mine")!.textContent = `identity: ${myPubkey}`;

// An empty send opens the data channel without carrying a payload.
wire.onSignal((online) => log(`signal: ${online ? "up" : "down"}`));
