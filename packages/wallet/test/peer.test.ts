import { describe, expect, it } from "vitest";
import type { Destination, Pending, Replied, Sent, Wire } from "@dokwa/core";
import { openWallet } from "../src/wallet.ts";
import { openPeerMintLink, serveMintLink } from "../src/peer.ts";
import { FrameReader, encodeFrame, MAX_FRAME_BYTES } from "../src/frame.ts";
import { memoryStore } from "./memory.ts";
import { counterparty } from "./counterparty.ts";

const SEED = new TextEncoder().encode("dokwa: a till seed, sixteen bytes plus");
const TILL_ID = "till"; // the client's name for the server
const PATRON_ID = "patron"; // the server's name for the client

interface Lies {
  /** deliver the server's first answer as two arrivals */
  splitFirstResponse?: boolean;
  /** hold the server's first answer and deliver it merged with the second */
  mergeTwoResponses?: boolean;
}

/**
 * Two Wires over one in-memory channel. The lie options are the transport
 * misbehaving on purpose: the seam promises bytes, not messages, so the
 * receiver is the thing that has to frame.
 */
function wirePair(lies: Lies = {}) {
  let clientHandler: ((from: Destination, bytes: Uint8Array) => void) | null =
    null;
  let serverHandler: ((from: Destination, bytes: Uint8Array) => void) | null =
    null;
  const counts = { toServer: 0, toClient: 0 };
  const clientFrames: Uint8Array[] = [];
  let held: Uint8Array | null = null;

  const deliver = (
    which: "client" | "server",
    from: Destination,
    bytes: Uint8Array,
  ) => {
    const handler = which === "client" ? clientHandler : serverHandler;
    if (handler) handler(from, bytes);
  };

  const wireFor = (which: "client" | "server", toId: string): Wire => ({
    async send(to: Destination, bytes: Uint8Array): Promise<Sent> {
      if (to.kind !== "peer") return { status: "failed", reason: "rejected" };
      if (which === "client") {
        counts.toServer += 1;
        clientFrames.push(bytes);
        deliver("server", { kind: "peer", id: PATRON_ID }, bytes);
      } else {
        counts.toClient += 1;
        const answer = { kind: "peer" as const, id: TILL_ID };
        if (lies.splitFirstResponse && counts.toClient === 1) {
          const half = Math.floor(bytes.length / 2);
          deliver("client", answer, bytes.slice(0, half));
          deliver("client", answer, bytes.slice(half));
        } else if (lies.mergeTwoResponses) {
          if (!held) {
            held = bytes;
          } else {
            const merged = new Uint8Array(held.length + bytes.length);
            merged.set(held);
            merged.set(bytes, held.length);
            held = null;
            deliver("client", answer, merged);
          }
        } else {
          deliver("client", answer, bytes);
        }
      }
      void toId;
      return { status: "delivered" };
    },
    async request(): Promise<Replied> {
      return { status: "failed", reason: "rejected" };
    },
    onBytes(handler): () => void {
      if (which === "client") clientHandler = handler;
      else serverHandler = handler;
      return () => {
        if (which === "client") clientHandler = null;
        else serverHandler = null;
      };
    },
    onSignal(): () => void {
      return () => {};
    },
    async pending(): Promise<Pending[]> {
      return [];
    },
  });

  return {
    client: wireFor("client", TILL_ID),
    server: wireFor("server", PATRON_ID),
    counts,
    frames: clientFrames,
    /** deliver bytes as if the carrier had brought a frame from the till */
    inject: (bytes: Uint8Array) =>
      deliver("client", { kind: "peer", id: TILL_ID }, bytes),
  };
}

function setup(lies: Lies = {}) {
  const till = counterparty(SEED);
  const pair = wirePair(lies);
  const stop = serveMintLink({
    wire: pair.server,
    peerId: PATRON_ID,
    mint: till,
  });
  const link = openPeerMintLink({
    wire: pair.client,
    peerId: TILL_ID,
    timeoutMs: 5000,
  });
  const wallet = openWallet({ store: memoryStore(), mint: link });
  return { till, wallet, link, pair, stop };
}

const text = (s: string) => new TextEncoder().encode(s);

describe("the wallet over a peer destination", () => {
  it("acquires and holds ecash through the frame", async () => {
    const { till, wallet } = setup();
    const quote = await wallet.requestQuote({
      amount: 21,
      description: "the door",
    });
    expect(quote.amount).toBe(21);
    till.settle(quote.id);
    expect(await wallet.receiveQuote(quote.id)).toBe(21);
    expect(await wallet.balance()).toBe(21);
  });

  it("refuses the second claim of one quote, through the frame", async () => {
    const { till, wallet } = setup();
    const quote = await wallet.requestQuote({ amount: 4 });
    till.settle(quote.id);
    await wallet.receiveQuote(quote.id);
    await expect(wallet.receiveQuote(quote.id)).rejects.toThrow(
      /claimed again/,
    );
    expect(await wallet.balance()).toBe(4);
  });

  it("the receiver frames an answer split across two arrivals", async () => {
    const { till, wallet, pair } = setup({ splitFirstResponse: true });
    const quote = await wallet.requestQuote({ amount: 8 });
    till.settle(quote.id);
    expect(await wallet.receiveQuote(quote.id)).toBe(8);
    expect(await wallet.balance()).toBe(8);
    expect(pair.counts.toClient).toBeGreaterThan(0);
  });

  it("the receiver frames two answers merged into one arrival", async () => {
    const { link } = setup({ mergeTwoResponses: true });
    const [keys, states] = await Promise.all([
      link.keys(),
      link.checkstate(["00".repeat(33)]),
    ]);
    expect(keys.keysets.length).toBeGreaterThan(0);
    expect(states).toHaveLength(1);
  });

  it("a payload larger than one send is split by the sender and reassembled", async () => {
    const { link, pair } = setup();
    // about 7 bytes of Y plus JSON per entry, roughly 700 entries: well over
    // the 16 KiB send chunk, so the sender must split and the receiver join
    const ys = Array.from(
      { length: 700 },
      (_, i) => `02${i.toString(16).padStart(64, "0")}`,
    );
    const states = await link.checkstate(ys);
    expect(states).toHaveLength(ys.length);
    expect(states[0]!.Y).toBe(ys[0]);
    expect(pair.counts.toClient).toBeGreaterThan(1);
  });

  it("a send refused by the channel rejects the call out loud", async () => {
    const till = counterparty(SEED);
    const pair = wirePair();
    pair.client = {
      ...pair.client,
      async send(): Promise<Sent> {
        return { status: "failed", reason: "rejected" };
      },
    };
    const link = openPeerMintLink({
      wire: pair.client,
      peerId: TILL_ID,
      timeoutMs: 500,
    });
    void serveMintLink({ wire: pair.server, peerId: PATRON_ID, mint: till });
    await expect(link.keys()).rejects.toThrow(/refused/);
  });

  it("a stale frame with an unknown request id is ignored, not fatal", async () => {
    const { link, pair } = setup();
    // a reconnect can drain frames the previous session queued. Craft one
    // with an id this link never issued, carrying a tempting fake answer.
    const payload = new TextEncoder().encode(
      JSON.stringify({
        ok: true,
        body: { keysets: [{ id: "stale", unit: "sat", active: true, keys: {} }] },
      }),
    );
    pair.inject(encodeFrame(0x7fffffff, payload));
    // the next real call still resolves against the live till
    const keys = await link.keys();
    expect(keys.keysets.length).toBeGreaterThan(0);
    expect(keys.keysets[0]!.id).not.toBe("stale");
  });

  it("two links never collide on their first call", async () => {    const first = setup();
    const second = setup();
    const [keysA, keysB] = await Promise.all([
      first.link.keys(),
      second.link.keys(),
    ]);
    expect(keysA.keysets.length).toBeGreaterThan(0);
    expect(keysB.keysets.length).toBeGreaterThan(0);
    const firstFrame = first.pair.frames[0]!;
    const secondFrame = second.pair.frames[0]!;
    const idA = new DataView(
      firstFrame.buffer,
      firstFrame.byteOffset + 4,
      4,
    ).getUint32(0, false);
    const idB = new DataView(
      secondFrame.buffer,
      secondFrame.byteOffset + 4,
      4,
    ).getUint32(0, false);
    expect(idA).not.toBe(idB);
  });
});

describe("the frame codec itself", () => {
  it("round trips two frames delivered in one read", () => {
    const reader = new FrameReader();
    const a = encodeFrame(1, text("one"));
    const b = encodeFrame(2, text("two"));
    const merged = new Uint8Array(a.length + b.length);
    merged.set(a);
    merged.set(b, a.length);
    const frames = reader.push(merged);
    expect(frames.map((f) => f.id)).toEqual([1, 2]);
    expect(new TextDecoder().decode(frames[1]!.payload)).toBe("two");
    expect(reader.pending()).toBe(0);
  });

  it("keeps the remainder of a frame that has not fully arrived", () => {
    const reader = new FrameReader();
    const frame = encodeFrame(7, text("a payload"));
    expect(reader.push(frame.slice(0, 5))).toHaveLength(0);
    expect(reader.pending()).toBe(5);
    const rest = reader.push(frame.slice(5));
    expect(rest).toHaveLength(1);
    expect(new TextDecoder().decode(rest[0]!.payload)).toBe("a payload");
  });

  it("refuses an impossible declared length loudly", () => {
    const reader = new FrameReader();
    const bad = new Uint8Array(8);
    new DataView(bad.buffer).setUint32(0, MAX_FRAME_BYTES + 1, false);
    expect(() => reader.push(bad)).toThrow(/impossible length/);
  });
});
