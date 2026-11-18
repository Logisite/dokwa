/**
 * The seam between crypto and wires. `build-contract.md` §1 is the argument
 * for it; this is the whole of it in types.
 *
 * Crypto never opens a socket. Wires never looks inside what it carries.
 */

export type Destination =
  | { kind: "relay"; url: string }
  | { kind: "chain"; network: "signet" }
  | { kind: "peer"; id: string };

export type Failure = "rejected" | "unreachable" | "timeout";

export type Sent =
  | { status: "delivered" }
  | { status: "failed"; reason: Failure }
  | { status: "later" };

export type Replied =
  | { status: "ok"; bytes: Uint8Array }
  | { status: "failed"; reason: Failure }
  | { status: "later" };

export type Pending = { id: string; to: Destination; queuedAt: number };

export type Unsubscribe = () => void;

export interface Wire {
  /** Fire and forget. `later` means queued and will be attempted again. */
  send(to: Destination, bytes: Uint8Array): Promise<Sent>;

  /** Needs an answer now. Chain only; a relay and a peer never answer. */
  request(to: Destination, bytes: Uint8Array): Promise<Replied>;

  /** Bytes that arrived, unopened, in the order they arrived. */
  onBytes(handler: (from: Destination, bytes: Uint8Array) => void): Unsubscribe;

  /** Whether there is signal, and when that changes. */
  onSignal(handler: (online: boolean) => void): Unsubscribe;

  /** What is waiting, for a screen that wants to say so. */
  pending(): Promise<Pending[]>;
}
