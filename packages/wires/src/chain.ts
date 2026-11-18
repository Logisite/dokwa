/**
 * The chain destination.
 *
 * A chain query is bytes we do not read. The bytes are a tiny HTTP request
 * envelope produced by the caller (`method`, `path`, optional text `body`)
 * and the answer is the endpoint's raw body, still unopened. This lets the
 * caller use a real Esplora endpoint for signet lookups and broadcasts while
 * wires remains an HTTP pipe, not a chain interpreter.
 *
 * A bare UTF-8 path beginning with `/` is accepted as a `GET`, because a
 * lookup is the common case.
 */

import type { Replied } from "@dokwa/core";

export const DEFAULT_SIGNET_ENDPOINT = "https://mempool.space/signet/api";

export interface ChainRequest {
  method?: "GET" | "POST";
  path: string;
  body?: string;
}

export interface ChainOptions {
  /** Base URL of the signet endpoint, without a trailing slash. */
  signet?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function parseRequest(bytes: Uint8Array): ChainRequest | null {
  const text = decoder.decode(bytes).trim();
  if (text.startsWith("/")) return { method: "GET", path: text };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.path !== "string") return null;
    const method = value.method === "POST" ? "POST" : "GET";
    const body = typeof value.body === "string" ? value.body : undefined;
    return { method, path: value.path, body };
  } catch {
    return null;
  }
}

function safeUrl(base: string, path: string): string | null {
  // A destination is a base plus a path, never an absolute URL supplied by a
  // payload. That keeps the request on the configured chain endpoint.
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return null;
  return `${base.replace(/\/+$/, "")}${path}`;
}

export class Chain {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ChainOptions = {}) {
    this.endpoint = options.signet ?? DEFAULT_SIGNET_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async request(bytes: Uint8Array): Promise<Replied> {
    const request = parseRequest(bytes);
    if (!request) return { status: "failed", reason: "rejected" };
    const url = safeUrl(this.endpoint, request.path);
    if (!url) return { status: "failed", reason: "rejected" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    (timer as { unref?: () => void }).unref?.();

    try {
      const response = await this.fetchImpl(url, {
        method: request.method,
        headers:
          request.method === "POST"
            ? { "content-type": "text/plain", accept: "*/*" }
            : { accept: "*/*" },
        body: request.method === "POST" ? request.body ?? "" : undefined,
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.ok) {
        const body = new Uint8Array(await response.arrayBuffer());
        return { status: "ok", bytes: body };
      }

      // 400/404 says the endpoint understood and refused this query. 429 and
      // 5xx say try later; there is no chain queue, so the caller decides.
      if (response.status === 429 || response.status >= 500) {
        return { status: "failed", reason: "unreachable" };
      }
      return { status: "failed", reason: "rejected" };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { status: "failed", reason: "timeout" };
      }
      return { status: "failed", reason: "unreachable" };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function chainRequestBytes(request: ChainRequest): Uint8Array {
  return encoder.encode(JSON.stringify(request));
}
