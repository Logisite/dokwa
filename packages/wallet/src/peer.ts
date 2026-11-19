/**
 * The wallet over a peer destination: the cross-device half of the same
 * MintLink the same-page wallet already speaks.
 *
 * Both halves live here because both produce and consume the NUT payload.
 * The carrier is untouched: frames go out as `wire.send({ kind: 'peer' })`
 * and come back through `wire.onBytes`, unopened and unframed by wires.
 */

import type { Wire } from "@dokwa/core";
import type {
  MintLink,
  MintLinkCheckState,
  MintLinkKeys,
  MintLinkQuote,
} from "./mint-link.ts";
import { encodeFrame, FrameReader } from "./frame.ts";
import type { BlindedMessage, BlindedSignature, Proof } from "@dokwa/keys";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * One wire.send is one data-channel message, and a channel caps message size
 * (commonly 64 KiB, not safely above 256 KiB). The carrier does not
 * fragment by contract, so the frame is sent in pieces under the safe size
 * and the receiver's buffering puts them back together.
 */
const SEND_CHUNK_BYTES = 16 * 1024;

async function sendFramed(
  wire: Wire,
  peerId: string,
  frame: Uint8Array,
): Promise<void> {
  for (let offset = 0; offset < frame.length; offset += SEND_CHUNK_BYTES) {
    const sent = await wire.send(
      { kind: "peer", id: peerId },
      frame.slice(offset, offset + SEND_CHUNK_BYTES),
    );
    if (sent.status === "failed")
      throw new Error(
        `wallet: the peer channel refused a frame piece (${sent.reason})`,
      );
  }
}

type Operation =
  "keys" | "quote.create" | "quote.read" | "mint" | "swap" | "checkstate";

interface RequestMessage {
  op: Operation;
  body?: unknown;
}

interface ResponseMessage {
  ok: boolean;
  body?: unknown;
  error?: string;
}

export interface PeerMintLinkOptions {
  wire: Wire;
  /** the wire's id for the till; the same id connectPeer/acceptPeer use */
  peerId: string;
  /** how long one call waits before giving up, in milliseconds */
  timeoutMs?: number;
}

/** A random start for the per-link request id: never 1 on purpose. */
function randomStartId(): number {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  const value = new DataView(bytes.buffer).getUint32(0, false);
  return Math.max(1, value);
}

/**
 * A MintLink that speaks frames to a till reachable as a peer. Open a wallet
 * over it exactly as over an in-process mint.
 *
 * Request ids are random per link, not 1: with the second belt, a stale
 * answer can never match even if routing were confused, and two links in
 * play never collide on their first call.
 */
export function openPeerMintLink(options: PeerMintLinkOptions): MintLink {
  const { wire, peerId } = options;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const reader = new FrameReader();
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let nextId = randomStartId();

  // the listener lives as long as the link; a wallet that closes its store
  // simply stops calling it
  wire.onBytes((from, bytes) => {
    if (from.kind !== "peer" || from.id !== peerId) return;
    for (const frame of reader.push(bytes)) {
      const waiting = pending.get(frame.id);
      if (!waiting) continue; // a late answer for a call already given up
      pending.delete(frame.id);
      clearTimeout(waiting.timer);
      let message: ResponseMessage;
      try {
        message = JSON.parse(decoder.decode(frame.payload)) as ResponseMessage;
      } catch {
        waiting.reject(
          new Error("wallet: the till sent a frame that is not JSON"),
        );
        continue;
      }
      if (message.ok) waiting.resolve(message.body);
      else
        waiting.reject(
          new Error(message.error ?? "wallet: the till refused the call"),
        );
    }
  });

  function call<T>(op: Operation, body?: unknown): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`wallet: the till did not answer ${op} in time`));
      }, timeoutMs);
      pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      const payload = encoder.encode(JSON.stringify({ op, body }));
      void sendFramed(wire, peerId, encodeFrame(id, payload)).catch(() => {
        if (!pending.delete(id)) return;
        clearTimeout(timer);
        reject(new Error(`wallet: the peer channel refused ${op}`));
      });
    });
  }

  return {
    keys: () => call<MintLinkKeys>("keys"),
    createQuote: (input) => call<MintLinkQuote>("quote.create", input),
    readQuote: (id) => call<MintLinkQuote | null>("quote.read", { id }),
    mint: (quoteId, outputs) =>
      call<BlindedSignature[]>("mint", { quoteId, outputs }),
    swap: (inputs, outputs) =>
      call<BlindedSignature[]>("swap", { inputs, outputs }),
    checkstate: (ys) => call<MintLinkCheckState[]>("checkstate", { ys }),
  };
}

export interface ServeMintLinkOptions {
  wire: Wire;
  /** the wire's id for the patron; the same id it uses for this till */
  peerId: string;
  /** anything that satisfies the link, which the real till does */
  mint: MintLink;
  /** called with the reason when a call is refused, for the till's log */
  onRefusal?: (reason: string) => void;
}

/**
 * The till end of the frame: answer the patron's calls over the peer
 * destination. Returns a disposer that stops listening.
 */
export function serveMintLink(options: ServeMintLinkOptions): () => void {
  const { wire, peerId, mint } = options;
  const reader = new FrameReader();

  async function answer(frame: {
    id: number;
    payload: Uint8Array;
  }): Promise<void> {
    let response: ResponseMessage;
    try {
      const message = JSON.parse(
        decoder.decode(frame.payload),
      ) as RequestMessage;
      switch (message.op) {
        case "keys":
          response = { ok: true, body: mint.keys() };
          break;
        case "quote.create":
          response = {
            ok: true,
            body: await mint.createQuote(message.body as { amount: number }),
          };
          break;
        case "quote.read":
          response = {
            ok: true,
            body: await mint.readQuote((message.body as { id: string }).id),
          };
          break;
        case "mint": {
          const body = message.body as {
            quoteId: string;
            outputs: BlindedMessage[];
          };
          response = {
            ok: true,
            body: await mint.mint(body.quoteId, body.outputs),
          };
          break;
        }
        case "swap": {
          const body = message.body as {
            inputs: Proof[];
            outputs: BlindedMessage[];
          };
          response = {
            ok: true,
            body: await mint.swap(body.inputs, body.outputs),
          };
          break;
        }
        case "checkstate":
          response = {
            ok: true,
            body: await mint.checkstate((message.body as { ys: string[] }).ys),
          };
          break;
        default:
          response = {
            ok: false,
            error: `till: unknown operation ${String(message.op)}`,
          };
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      options.onRefusal?.(reason);
      response = { ok: false, error: reason };
    }
    const payload = encoder.encode(JSON.stringify(response));
    await sendFramed(wire, peerId, encodeFrame(frame.id, payload));
  }

  return wire.onBytes((from, bytes) => {
    if (from.kind !== "peer" || from.id !== peerId) return;
    for (const frame of reader.push(bytes)) void answer(frame);
  });
}
