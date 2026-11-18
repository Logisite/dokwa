/**
 * Relays are websocket pipes that speak NIP-01 frames.
 *
 * Wires does not know what an event means. It knows `["EVENT", …]` has an id
 * a relay answers with `["OK", id, true|false, …]`, and that `["REQ", …]`
 * starts a subscription. That much is transport, not payload.
 *
 * Every frame that arrives is handed back as bytes, in order, unopened. A
 * subscription is replayed after a reconnect because a relay forgets
 * connections, not because we interpret the filter.
 */

import type { Sent, Unsubscribe } from "@dokwa/core";

export type RelayState = "connecting" | "open" | "closed";

export interface RelayOptions {
  /** How long a publish waits for the relay's OK. */
  okTimeoutMs?: number;
  /** How long a socket may take to open. */
  connectTimeoutMs?: number;
  /** Give up reconnecting after this, per connection. */
  maxBackoffMs?: number;
  WebSocketImpl?: typeof WebSocket;
}

type Frame = unknown[];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function parseFrame(text: string): Frame | null {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * A relay that answers OK false is refusing these bytes, but not every no is
 * a final one. strfry answers "not acceptable at this point" when it is
 * throttling writes: the destination is real, the socket is open, the event
 * is fine, and the same bytes will be accepted in a minute. Calling that
 * `rejected` would make the queue drop a receipt over a thirty second
 * window, so a throttle is `unreachable`: worth another honest try.
 * Everything else, a policy no like "restricted" or a malformed event, is
 * `rejected` and the queue is right to give up on it.
 */
const THROTTLE_RE =
  /not acceptable at this point|rate.?limit|slow down|too many requests/i;

export function classifyRefusal(message: string): "rejected" | "unreachable" {
  return THROTTLE_RE.test(message) ? "unreachable" : "rejected";
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

interface PendingOk {
  resolve: (sent: Sent) => void;
  timer: ReturnType<typeof setTimeout>;
}

class Connection {
  readonly url: string;
  private readonly options: RelayOptions;
  private readonly onFrame: (url: string, bytes: Uint8Array) => void;
  private readonly onState: (url: string, state: RelayState) => void;

  private socket: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private readonly subscriptions = new Map<string, string>();
  private readonly pendingOks = new Map<string, PendingOk[]>();
  private backoffMs = 1_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUs = false;

  constructor(
    url: string,
    options: RelayOptions,
    onFrame: (url: string, bytes: Uint8Array) => void,
    onState: (url: string, state: RelayState) => void,
  ) {
    this.url = url;
    this.options = options;
    this.onFrame = onFrame;
    this.onState = onState;
  }

  async publish(text: string, id: string): Promise<Sent> {
    let socket: WebSocket;
    try {
      socket = await this.open();
    } catch (error) {
      return {
        status: "failed",
        reason: error instanceof TimeoutError ? "timeout" : "unreachable",
      };
    }

    return new Promise<Sent>((resolve) => {
      const timeout = this.options.okTimeoutMs ?? 15_000;
      const entry: PendingOk = {
        resolve,
        timer: setTimeout(() => {
          this.removePending(id, entry);
          resolve({ status: "failed", reason: "timeout" });
        }, timeout),
      };
      (entry.timer as { unref?: () => void }).unref?.();
      const list = this.pendingOks.get(id) ?? [];
      list.push(entry);
      this.pendingOks.set(id, list);
      try {
        socket.send(text);
      } catch {
        this.removePending(id, entry);
        resolve({ status: "failed", reason: "unreachable" });
      }
    });
  }

  async write(text: string, subscriptionId?: string): Promise<Sent> {
    let socket: WebSocket;
    try {
      socket = await this.open();
    } catch (error) {
      return {
        status: "failed",
        reason: error instanceof TimeoutError ? "timeout" : "unreachable",
      };
    }

    if (subscriptionId !== undefined) {
      this.subscriptions.set(subscriptionId, text);
    }
    try {
      socket.send(text);
      return { status: "delivered" };
    } catch {
      return { status: "failed", reason: "unreachable" };
    }
  }

  dropSubscription(id: string): void {
    this.subscriptions.delete(id);
  }

  verify(eventId: string, timeoutMs: number): Promise<Sent> {
    const sub = `verify-${eventId.slice(0, 12)}-${Math.random().toString(36).slice(2)}`;
    return new Promise<Sent>((resolve) => {
      let settled = false;
      const finish = (sent: Sent) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.offFrame(listener);
        void this.write(JSON.stringify(["CLOSE", sub]));
        resolve(sent);
      };
      const listener = (url: string, bytes: Uint8Array) => {
        if (url !== this.url) return;
        const frame = parseFrame(decoder.decode(bytes));
        if (!frame || frame[0] !== "EVENT") return;
        // A NIP-01 EVENT answer is ["EVENT", <sub id>, <event>]. The event
        // carries the id we asked for; do not assume which slot on relays
        // that answer the shape loosely, so scan the frame for it.
        for (const slot of frame) {
          const event = slot as { id?: unknown } | null;
          if (
            event &&
            typeof event === "object" &&
            event.id === eventId
          ) {
            finish({ status: "delivered" });
            return;
          }
        }
      };
      this.onFrameHook(listener);
      const timer = setTimeout(
        () => finish({ status: "failed", reason: "timeout" }),
        timeoutMs,
      );
      (timer as { unref?: () => void }).unref?.();
      void this.write(
        JSON.stringify(["REQ", sub, { ids: [eventId], limit: 1 }]),
        sub,
      ).then((sent) => {
        if (sent.status === "failed") finish(sent);
      });
    });
  }

  close(): void {
    this.closedByUs = true;
    this.clearReconnect();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // already gone
      }
    }
    this.socket = null;
  }

  private readonly frameHooks = new Set<
    (url: string, bytes: Uint8Array) => void
  >();

  private onFrameHook(handler: (url: string, bytes: Uint8Array) => void): void {
    this.frameHooks.add(handler);
  }

  private offFrame(handler: (url: string, bytes: Uint8Array) => void): void {
    this.frameHooks.delete(handler);
  }

  private open(): Promise<WebSocket> {
    if (this.socket?.readyState === 1) return Promise.resolve(this.socket);
    if (this.opening) return this.opening;

    const Impl =
      this.options.WebSocketImpl ??
      (typeof WebSocket !== "undefined" ? WebSocket : undefined);
    if (!Impl) {
      return Promise.reject(new Error("no WebSocket implementation"));
    }

    this.onState(this.url, "connecting");
    this.opening = new Promise<WebSocket>((resolve, reject) => {
      const timeoutMs = this.options.connectTimeoutMs ?? 10_000;
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new Impl(this.url);
      } catch {
        this.opening = null;
        reject(new Error("unreachable"));
        return;
      }
      socket.binaryType = "arraybuffer";

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          socket.close();
        } catch {
          // ignore
        }
        this.opening = null;
        this.onState(this.url, "closed");
        reject(new TimeoutError());
      }, timeoutMs);
      (timer as { unref?: () => void }).unref?.();

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket = socket;
        this.opening = null;
        this.backoffMs = 1_000;
        this.onState(this.url, "open");
        // A relay forgot every subscription when the last socket closed.
        for (const frame of this.subscriptions.values()) {
          try {
            socket.send(frame);
          } catch {
            // the close handler will schedule another try
          }
        }
        resolve(socket);
      };

      socket.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.opening = null;
        this.onState(this.url, "closed");
        reject(new Error("unreachable"));
      };

      socket.onclose = () => {
        clearTimeout(timer);
        const wasOpening = !settled;
        settled = true;
        this.opening = null;
        if (this.socket === socket) this.socket = null;
        this.onState(this.url, "closed");
        this.rejectPending("unreachable");
        if (wasOpening) reject(new Error("unreachable"));
        if (!this.closedByUs && this.subscriptions.size > 0) {
          this.scheduleReconnect();
        }
      };

      socket.onmessage = (message: MessageEvent) => {
        const data = message.data;
        const bytes =
          typeof data === "string"
            ? encoder.encode(data)
            : data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : new Uint8Array();
        const frame = parseFrame(decoder.decode(bytes));
        if (frame && frame[0] === "OK") {
          const id = frame[1];
          const accepted = frame[2];
          if (typeof id === "string" && typeof accepted === "boolean") {
            const message = typeof frame[3] === "string" ? frame[3] : "";
            if (!accepted && message) {
              console.warn(`relay ${this.url} refused ${id.slice(0, 16)}: ${message}`);
            }
            this.resolvePending(
              id,
              accepted
                ? { status: "delivered" }
                : { status: "failed", reason: classifyRefusal(message) },
            );
          }
        }
        this.onFrame(this.url, cloneBytes(bytes));
        for (const hook of [...this.frameHooks]) hook(this.url, bytes);
      };
    });

    return this.opening;
  }

  private rejectPending(reason: "unreachable" | "timeout"): void {
    for (const id of [...this.pendingOks.keys()]) {
      this.resolvePending(id, { status: "failed", reason });
    }
  }

  private resolvePending(id: string, sent: Sent): void {
    const list = this.pendingOks.get(id);
    if (!list) return;
    this.pendingOks.delete(id);
    for (const entry of list) {
      clearTimeout(entry.timer);
      entry.resolve(sent);
    }
  }

  private removePending(id: string, entry: PendingOk): void {
    const list = this.pendingOks.get(id);
    if (!list) return;
    const index = list.indexOf(entry);
    if (index >= 0) list.splice(index, 1);
    if (list.length === 0) this.pendingOks.delete(id);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(
      this.options.maxBackoffMs ?? 30_000,
      this.backoffMs * 2,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open().catch(() => {
        if (!this.closedByUs && this.subscriptions.size > 0) {
          this.scheduleReconnect();
        }
      });
    }, delay);
    (this.reconnectTimer as { unref?: () => void }).unref?.();
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

class TimeoutError extends Error {}

export class Relays {
  private readonly options: RelayOptions;
  private readonly connections = new Map<string, Connection>();
  private readonly frameListeners = new Set<
    (url: string, bytes: Uint8Array) => void
  >();
  private readonly stateListeners = new Set<
    (url: string, state: RelayState) => void
  >();

  constructor(options: RelayOptions = {}) {
    this.options = options;
  }

  send(url: string, bytes: Uint8Array): Promise<Sent> {
    const text = decoder.decode(bytes);
    const frame = parseFrame(text);
    if (!frame) return Promise.resolve({ status: "failed", reason: "rejected" });
    const type = frame[0];
    if (typeof type !== "string")
      return Promise.resolve({ status: "failed", reason: "rejected" });

    const connection = this.connect(url);

    switch (type) {
      case "EVENT": {
        const event = frame[1] as { id?: unknown } | undefined;
        if (typeof event?.id !== "string")
          return Promise.resolve({ status: "failed", reason: "rejected" });
        return connection.publish(text, event.id);
      }
      case "REQ": {
        const sub = frame[1];
        if (typeof sub !== "string")
          return Promise.resolve({ status: "failed", reason: "rejected" });
        return connection.write(text, sub);
      }
      case "CLOSE": {
        const sub = frame[1];
        if (typeof sub === "string") connection.dropSubscription(sub);
        return connection.write(text);
      }
      case "AUTH":
        return connection.write(text);
      default:
        // A protocol frame we do not need to understand is still bytes.
        return connection.write(text);
    }
  }

  /** Ask the relay for a specific event id. This is the later check. */
  verify(url: string, eventId: string, timeoutMs = 15_000): Promise<Sent> {
    return this.connect(url).verify(eventId, timeoutMs);
  }

  onFrame(handler: (url: string, bytes: Uint8Array) => void): Unsubscribe {
    this.frameListeners.add(handler);
    return () => {
      this.frameListeners.delete(handler);
    };
  }

  onState(handler: (url: string, state: RelayState) => void): Unsubscribe {
    this.stateListeners.add(handler);
    return () => {
      this.stateListeners.delete(handler);
    };
  }

  close(): void {
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
  }

  private connect(url: string): Connection {
    let connection = this.connections.get(url);
    if (!connection) {
      connection = new Connection(
        url,
        this.options,
        (from, bytes) => {
          for (const listener of [...this.frameListeners])
            listener(from, bytes);
        },
        (from, state) => {
          for (const listener of [...this.stateListeners])
            listener(from, state);
        },
      );
      this.connections.set(url, connection);
    }
    return connection;
  }
}
