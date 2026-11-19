/**
 * The chain destination against real signet.
 *
 * `request` carries a tiny HTTP envelope and returns the endpoint's raw
 * body, unopened. Wires is a pipe, not a chain interpreter: the test is the
 * only place that knows what a block height or a transaction looks like.
 * The endpoint is real (mempool.space signet), the ids are real, and an
 * unreachable endpoint here is a real refusal to connect, not a mock.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { MemoryQueueStore } from "../src/queue.ts";
import {
  Chain,
  DEFAULT_SIGNET_ENDPOINT,
  chainRequestBytes,
} from "../src/chain.ts";
import { createWire } from "../src/wire.ts";

const TIMEOUT_MS = 90_000;
const decoder = new TextDecoder();

async function waitForOnline(
  isOnline: () => boolean,
  timeoutMs = 20_000,
): Promise<void> {
  const started = Date.now();
  while (!isOnline()) {
    if (Date.now() - started > timeoutMs)
      throw new Error("signal never came up");
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** One real signet txid, taken live from the tip block of the real chain. */
let realTxid = "";
let realBlockHash = "";

beforeAll(async () => {
  const chain = new Chain({
    signet: DEFAULT_SIGNET_ENDPOINT,
    timeoutMs: 30_000,
  });
  const tip = await chain.request(
    chainRequestBytes({ path: "/blocks/tip/hash" }),
  );
  expect(tip.status).toBe("ok");
  realBlockHash = decoder
    .decode(tip.status === "ok" ? tip.bytes : new Uint8Array())
    .trim();
  realTxid = "";
  expect(realBlockHash).toMatch(/^[0-9a-f]{64}$/);

  const txids = await chain.request(
    chainRequestBytes({ path: `/block/${realBlockHash}/txids` }),
  );
  expect(txids.status).toBe("ok");
  const list: unknown = JSON.parse(
    decoder.decode(txids.status === "ok" ? txids.bytes : new Uint8Array()),
  );
  expect(Array.isArray(list)).toBe(true);
  expect((list as string[]).length).toBeGreaterThan(0);
  realTxid = (list as string[])[0] ?? "";
  expect(realTxid).toMatch(/^[0-9a-f]{64}$/);
}, TIMEOUT_MS);

describe("chain destination, real signet", () => {
  it(
    "answers a chain question with the endpoint's own bytes",
    async () => {
      const wire = createWire({ queue: { store: new MemoryQueueStore() } });
      await waitForOnline(() => wire.isOnline());
      try {
        const replied = await wire.request(
          { kind: "chain", network: "signet" },
          chainRequestBytes({ path: "/blocks/tip/height" }),
        );
        expect(replied.status).toBe("ok");
        if (replied.status !== "ok") return;
        const height = Number(decoder.decode(replied.bytes).trim());
        expect(Number.isFinite(height)).toBe(true);
        expect(height).toBeGreaterThan(100_000);
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "fetches a real signet transaction through request",
    async () => {
      const wire = createWire({ queue: { store: new MemoryQueueStore() } });
      await waitForOnline(() => wire.isOnline());
      try {
        const replied = await wire.request(
          { kind: "chain", network: "signet" },
          chainRequestBytes({ path: `/tx/${realTxid}` }),
        );
        expect(replied.status).toBe("ok");
        if (replied.status !== "ok") return;
        // The bytes are the explorer's own JSON for this txid, unmodified.
        const text = decoder.decode(replied.bytes);
        expect(text).toContain(realTxid);
        const parsed: unknown = JSON.parse(text);
        expect((parsed as { txid?: unknown }).txid).toBe(realTxid);
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "fetches the raw transaction bytes for a broadcast-worthy id",
    async () => {
      const wire = createWire({ queue: { store: new MemoryQueueStore() } });
      await waitForOnline(() => wire.isOnline());
      try {
        const replied = await wire.request(
          { kind: "chain", network: "signet" },
          chainRequestBytes({ path: `/tx/${realTxid}/hex` }),
        );
        expect(replied.status).toBe("ok");
        if (replied.status !== "ok") return;
        const hex = decoder.decode(replied.bytes).trim();
        expect(hex).toMatch(/^[0-9a-f]+$/);
        expect(hex.length).toBeGreaterThanOrEqual(20);
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "calls a query the endpoint refuses a failed, rejected",
    async () => {
      const wire = createWire({ queue: { store: new MemoryQueueStore() } });
      await waitForOnline(() => wire.isOnline());
      try {
        const replied = await wire.request(
          { kind: "chain", network: "signet" },
          chainRequestBytes({ path: `/tx/${"0".repeat(64)}` }),
        );
        // A txid that never existed: the endpoint understood and said no.
        expect(replied).toEqual({ status: "failed", reason: "rejected" });
      } finally {
        wire.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "reports a dead endpoint as failed, unreachable",
    async () => {
      // A real address with nothing listening: the connection genuinely fails.
      const chain = new Chain({
        signet: "http://127.0.0.1:1",
        timeoutMs: 10_000,
      });
      const replied = await chain.request(
        chainRequestBytes({ path: "/blocks/tip/height" }),
      );
      expect(replied.status).toBe("failed");
      expect(replied.status === "failed" && replied.reason).toBe("unreachable");
    },
    TIMEOUT_MS,
  );

  it(
    "refuses an envelope that tries to leave the configured endpoint",
    async () => {
      const chain = new Chain({ signet: DEFAULT_SIGNET_ENDPOINT });
      // A payload that names an absolute URL is not a path on this endpoint.
      const smuggled = chainRequestBytes({
        path: "https://evil.example/api/tx" as string,
      } as never);
      const replied = await chain.request(smuggled);
      expect(replied).toEqual({ status: "failed", reason: "rejected" });
    },
    TIMEOUT_MS,
  );
});
