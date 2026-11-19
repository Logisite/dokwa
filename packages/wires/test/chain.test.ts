/**
 * The chain destination against real signet.
 *
 * `request` carries a tiny HTTP envelope and returns the endpoint's raw
 * body, unopened. Wires is a pipe, not a chain interpreter: the test is the
 * only place that knows what a block height or a transaction looks like.
 * The endpoint is real, the ids are real, and an unreachable endpoint here is
 * a real refusal to connect, not a mock.
 *
 * One endpoint for the whole run, read by the preflight and by the Wire, so
 * "the endpoint answered" and "the request" are always about the same server.
 * Blockstream is the default because mempool's IPv4 path is currently down;
 * DOKWA_SIGNET_ENDPOINT overrides both without either leg drifting.
 *
 * When a request fails while the health check passes, the test asks the same
 * path directly and reports what came back. Only a successful raw answer is a
 * code failure; a raw network error or a 429 is the endpoint, named with its
 * actual status or error instead of the word unreachable.
 */

import { beforeAll, describe, expect, it } from "vitest";
import type { Failure } from "@dokwa/core";
import { MemoryQueueStore } from "../src/queue.ts";
import { Chain, chainRequestBytes } from "../src/chain.ts";
import { createWire } from "../src/wire.ts";

const TIMEOUT_MS = 90_000;
const decoder = new TextDecoder();

/** The one endpoint both the preflight and the Wire use this run. */
const SIGNET_ENDPOINT =
  process.env.DOKWA_SIGNET_ENDPOINT ?? "https://blockstream.info/signet/api";
const HEALTH_PATH = "/blocks/tip/height";

interface RawAnswer {
  status: number;
}

/** What the endpoint answers to a plain fetch, with the real failure cause. */
async function rawGet(
  path: string,
  timeoutMs = 15_000,
): Promise<RawAnswer | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SIGNET_ENDPOINT}${path}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return { status: response.status };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } })?.cause;
    return {
      error: cause?.code ?? (error as Error)?.message ?? String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

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
  const tipUrl = `${SIGNET_ENDPOINT}/blocks/tip/hash`;
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
  const chain = new Chain({ signet: SIGNET_ENDPOINT, timeoutMs: 30_000 });
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
  const chain = new Chain({ signet: SIGNET_ENDPOINT, timeoutMs: 30_000 });
  return chain.request(chainRequestBytes({ path }));
}

type Observation =
  { kind: "ok"; bytes: Uint8Array } | { kind: "refused"; reason: Failure };

function isRawStatus(raw: RawAnswer | { error: string }): raw is RawAnswer {
  return "status" in raw;
}

/**
 * Ask the endpoint, and if the Wire says unreachable, ask the same path
 * directly to see whether the endpoint is answering.
 */
async function ask(path: string): Promise<Observation> {
  let replied = await chainCall(path);
  if (
    replied.status !== "ok" &&
    healthy(await preflight(`${SIGNET_ENDPOINT}${HEALTH_PATH}`))
  ) {
    replied = await chainCall(path);
  }
  if (replied.status === "ok") return { kind: "ok", bytes: replied.bytes };

  const raw = await rawGet(path);
  if (isRawStatus(raw) && raw.status >= 200 && raw.status < 300) {
    throw new Error(
      `code failure: ${path} answered ${JSON.stringify(replied)} while a raw GET to the same path answered ${raw.status}`,
    );
  }
  console.log(
    `[chain] ${path}: ${JSON.stringify(replied)} (raw ${isRawStatus(raw) ? raw.status : raw.error})`,
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
      const wire = createWire({
        queue: { store: new MemoryQueueStore() },
        chain: { signet: SIGNET_ENDPOINT },
      });
      try {
        // request does not need signal: it is the answer-wanted call.
        const wired = await wire.request(
          { kind: "chain", network: "signet" },
          chainRequestBytes({ path: HEALTH_PATH }),
        );
        if (wired.status !== "ok") {
          const seen = await ask(HEALTH_PATH);
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
      const path = `/tx/${"0".repeat(64)}`;
      const replied = await chainCall(path);
      const raw = await rawGet(path);
      const rawStatus = isRawStatus(raw) ? raw.status : null;

      if (rawStatus !== null && rawStatus >= 200 && rawStatus < 300) {
        throw new Error(
          `code failure: an unknown txid answered ${JSON.stringify(replied)} while the raw endpoint answered ${rawStatus}`,
        );
      }
      if (replied.status !== "failed") {
        throw new Error(
          `code failure: an unknown txid answered ${JSON.stringify(replied)}`,
        );
      }
      if (
        rawStatus !== null &&
        rawStatus >= 400 &&
        rawStatus < 500 &&
        rawStatus !== 429
      ) {
        // The endpoint understood and said no: rejected, final.
        expect(replied).toEqual({ status: "failed", reason: "rejected" });
      } else if (rawStatus !== null) {
        // 429 or 5xx: the endpoint refused for now, so unreachable is right.
        expect(replied.status).toBe("failed");
        expect(replied.reason).toBe("unreachable");
      } else {
        // No HTTP answer at all: a network refusal, still loud.
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
        chainRequestBytes({ path: HEALTH_PATH }),
      );
      expect(replied.status).toBe("failed");
      expect(replied.status === "failed" && replied.reason).toBe("unreachable");
    },
    TIMEOUT_MS,
  );

  it(
    "refuses an envelope that tries to leave the configured endpoint",
    async () => {
      const chain = new Chain({ signet: SIGNET_ENDPOINT });
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
