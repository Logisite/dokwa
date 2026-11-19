/**
 * The chain destination against real signet.
 *
 * `request` carries a tiny HTTP envelope and returns the endpoint's raw
 * body, unopened. Wires is a pipe, not a chain interpreter: the test is the
 * only place that knows what a block height or a transaction looks like.
 * The endpoint is real (mempool.space signet), the ids are real, and an
 * unreachable endpoint here is a real refusal to connect, not a mock.
 *
 * A public explorer is allowed to refuse with 429 in a busy window. That is
 * an observation, not an unknown: when the endpoint refuses, the live legs
 * assert the loud refusal path instead of failing on a third party's budget,
 * and a re-preflight makes sure a code failure cannot hide behind a window.
 */

import { beforeAll, describe, expect, it } from "vitest";
import type { Failure } from "@dokwa/core";
import { MemoryQueueStore } from "../src/queue.ts";
import {
  Chain,
  DEFAULT_SIGNET_ENDPOINT,
  chainRequestBytes,
} from "../src/chain.ts";
import { createWire } from "../src/wire.ts";

const TIMEOUT_MS = 90_000;
const decoder = new TextDecoder();

/** What the endpoint answers right now. A number is an HTTP status. */
async function preflight(
  url: string,
  timeoutMs = 8_000,
): Promise<number | Error> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.status;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

/** One real signet txid, taken live from the tip block of the real chain. */
let realTxid = "";
let realBlockHash = "";
/** Why the preflight could not answer at all, if it could not. */
let preflightFailure = "";

function healthy(status: number | Error): boolean {
  return !(status instanceof Error) && status >= 200 && status < 400;
}

beforeAll(async () => {
  const tipUrl = `${DEFAULT_SIGNET_ENDPOINT}/blocks/tip/hash`;
  const status = await preflight(tipUrl);
  if (status instanceof Error) {
    preflightFailure = `${tipUrl}: ${status.message}`;
    return;
  }
  if (!healthy(status)) {
    console.log(
      `[chain] preflight ${status} from ${tipUrl}; live legs assert the loud refusal`,
    );
    return;
  }
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

function chainCall(path: string) {
  const chain = new Chain({
    signet: DEFAULT_SIGNET_ENDPOINT,
    timeoutMs: 30_000,
  });
  return chain.request(chainRequestBytes({ path }));
}

type Observation =
  { kind: "ok"; bytes: Uint8Array } | { kind: "refused"; reason: Failure };

/**
 * Ask the real endpoint, and hold the answer to a second real observation.
 *
 * If the request failed but the endpoint answers a health check, this retries
 * once (a window may be closing), and if the endpoint is still healthy while
 * the request fails it throws: that is a code failure, not a flake.
 */
async function ask(path: string): Promise<Observation> {
  let replied = await chainCall(path);
  if (
    replied.status !== "ok" &&
    healthy(await preflight(`${DEFAULT_SIGNET_ENDPOINT}/blocks/tip/height`))
  ) {
    replied = await chainCall(path);
  }
  if (replied.status === "ok") return { kind: "ok", bytes: replied.bytes };

  const status = await preflight(
    `${DEFAULT_SIGNET_ENDPOINT}/blocks/tip/height`,
  );
  if (healthy(status)) {
    throw new Error(
      `code failure: ${path} answered ${JSON.stringify(replied)} while the endpoint answers ${status}`,
    );
  }
  console.log(
    `[chain] ${path}: ${JSON.stringify(replied)} (endpoint health ${status instanceof Error ? status.message : status})`,
  );
  return {
    kind: "refused",
    reason: replied.status === "failed" ? replied.reason : "timeout",
  };
}

function assertRefusal(reason: Failure): void {
  // The loud refusal is the observation: a throttled endpoint is unreachable,
  // a policy no is rejected, and neither is a delivered or a quiet zero.
  expect(["unreachable", "rejected"]).toContain(reason);
}

describe("chain destination, real signet", () => {
  it(
    "answers a chain question with the endpoint's own bytes",
    async (ctx) => {
      if (preflightFailure) {
        ctx.skip(`preflight could not answer: ${preflightFailure}`);
        return;
      }
      const wire = createWire({ queue: { store: new MemoryQueueStore() } });
      try {
        // request does not need signal: it is the answer-wanted call.
        const wired = await wire.request(
          { kind: "chain", network: "signet" },
          chainRequestBytes({ path: "/blocks/tip/height" }),
        );
        if (wired.status !== "ok") {
          const seen = await ask("/blocks/tip/height");
          expect(seen.kind).toBe("refused");
          if (seen.kind === "refused") assertRefusal(seen.reason);
          return;
        }
        const height = Number(decoder.decode(wired.bytes).trim());
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
    async (ctx) => {
      if (preflightFailure) {
        ctx.skip(`preflight could not answer: ${preflightFailure}`);
        return;
      }
      if (!realTxid) {
        const seen = await ask("/blocks/tip/hash");
        expect(seen.kind).toBe("refused");
        if (seen.kind === "refused") assertRefusal(seen.reason);
        return;
      }
      const seen = await ask(`/tx/${realTxid}`);
      if (seen.kind === "refused") {
        assertRefusal(seen.reason);
        return;
      }
      // The bytes are the explorer's own JSON for this txid, unmodified.
      const text = decoder.decode(seen.bytes);
      expect(text).toContain(realTxid);
      const parsed: unknown = JSON.parse(text);
      expect((parsed as { txid?: unknown }).txid).toBe(realTxid);
    },
    TIMEOUT_MS,
  );

  it(
    "fetches the raw transaction bytes for a broadcast-worthy id",
    async (ctx) => {
      if (preflightFailure) {
        ctx.skip(`preflight could not answer: ${preflightFailure}`);
        return;
      }
      if (!realTxid) {
        const seen = await ask("/blocks/tip/hash");
        expect(seen.kind).toBe("refused");
        if (seen.kind === "refused") assertRefusal(seen.reason);
        return;
      }
      const seen = await ask(`/tx/${realTxid}/hex`);
      if (seen.kind === "refused") {
        assertRefusal(seen.reason);
        return;
      }
      const hex = decoder.decode(seen.bytes).trim();
      expect(hex).toMatch(/^[0-9a-f]+$/);
      expect(hex.length).toBeGreaterThanOrEqual(20);
    },
    TIMEOUT_MS,
  );

  it(
    "calls a query the endpoint refuses a failed, rejected",
    async (ctx) => {
      if (preflightFailure) {
        ctx.skip(`preflight could not answer: ${preflightFailure}`);
        return;
      }
      const replied = await chainCall(`/tx/${"0".repeat(64)}`);
      if (replied.status !== "failed") {
        throw new Error(
          `code failure: an unknown txid answered ${JSON.stringify(replied)}`,
        );
      }
      const status = await preflight(
        `${DEFAULT_SIGNET_ENDPOINT}/blocks/tip/height`,
      );
      if (healthy(status)) {
        // The endpoint understood and said no: that is rejected, not a retry.
        expect(replied).toEqual({ status: "failed", reason: "rejected" });
      } else {
        assertRefusal(replied.reason);
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
