/**
 * One honest answer about whether there is signal.
 *
 * The browser's `navigator.onLine` is not an answer: an interface can be up
 * while the other side of it is unreachable. We take it as a hint and probe a
 * real endpoint in front of it. A probe that fails is `false`; we never turn a
 * failed probe into an optimistic `true`.
 *
 * The probe is swappable so a caller can point it at whatever the app needs
 * to reach. The default is the signet chain endpoint: it is small, CORS-open
 * and reachable from the browser without credentials.
 */

import type { Unsubscribe } from "@dokwa/core";

export const DEFAULT_PROBE_URL =
  "https://mempool.space/signet/api/blocks/tip/height";

export type Probe = () => Promise<boolean>;

export interface SignalOptions {
  /** A real reachability check. Must resolve false on any failure. */
  probe?: Probe;
  /** How often to re-probe while the tab is alive. */
  intervalMs?: number;
  /** Timeout for the default probe. */
  probeTimeoutMs?: number;
}

export interface Signal {
  online(): boolean;
  on(handler: (online: boolean) => void): Unsubscribe;
  check(): Promise<boolean>;
  start(): void;
  stop(): void;
}

/** The default probe: a real request to a real signet endpoint. */
export function httpProbe(
  url = DEFAULT_PROBE_URL,
  timeoutMs = 5000,
  fetchImpl: typeof fetch = fetch,
): Probe {
  return async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: { accept: "text/plain" },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createSignal(options: SignalOptions = {}): Signal {
  const probe = options.probe ?? httpProbe();
  const intervalMs = options.intervalMs ?? 15_000;

  let currentlyOnline = false;
  let running = false;
  let checking: Promise<boolean> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<(online: boolean) => void>();

  function set(next: boolean): void {
    if (next === currentlyOnline) return;
    currentlyOnline = next;
    for (const listener of [...listeners]) listener(next);
  }

  async function check(): Promise<boolean> {
    if (checking) return checking;
    checking = (async () => {
      const next = await probe().catch(() => false);
      set(next);
      return next;
    })().finally(() => {
      checking = null;
    });
    return checking;
  }

  function start(): void {
    if (running) return;
    running = true;
    void check();
    timer = setInterval(() => void check(), intervalMs);
    // Node keeps a timer alive that a test never asked to keep.
    (timer as { unref?: () => void }).unref?.();
    if (typeof window !== "undefined") {
      window.addEventListener("online", onBrowserOnline);
      window.addEventListener("offline", onBrowserOffline);
    }
  }

  function stop(): void {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onBrowserOnline);
      window.removeEventListener("offline", onBrowserOffline);
    }
  }

  function onBrowserOnline(): void {
    void check();
  }

  function onBrowserOffline(): void {
    set(false);
  }

  return {
    online: () => currentlyOnline,
    on(handler) {
      listeners.add(handler);
      // "Whether there is signal" means the caller can ask once by
      // subscribing; the first call is the current answer, not a change.
      handler(currentlyOnline);
      return () => {
        listeners.delete(handler);
      };
    },
    check,
    start,
    stop,
  };
}
