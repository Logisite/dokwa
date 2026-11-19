/**
 * The radio-off signaller. Offer, answer and ICE travel as `dokwa:` peer
 * codes, carried by a hand, a camera or a sheet of paper. No socket, no relay,
 * no signal: this is the QR floor the specification names.
 *
 * Wires never sees this: it receives the PeerSignaller through its injection
 * point and carries the bytes of the channel after the codes have opened it.
 */

import { encodeCode, parseCode, type Unsubscribe } from "@dokwa/core";
import type { Identity } from "@dokwa/keys";
import type { PeerSignal, PeerSignaller } from "@dokwa/wires";

/** The sender's id rides in the code, because the code's `id` names its target. */
interface CodePayload {
  pubkey: string;
  signal: PeerSignal;
}

export interface CodeSignaller extends PeerSignaller {
  readonly id: string;
  /** called with the code to hand to the other device when a signal is ready */
  onCode(handler: (code: string) => void): Unsubscribe;
  /** read a code from the other device; false means it was not one of ours */
  deliver(code: string): boolean;
}

export function createCodeSignaller(identity: Identity): CodeSignaller {
  const signals = new Set<(from: string, signal: PeerSignal) => void>();
  const codes = new Set<(code: string) => void>();

  return {
    id: identity.pubkey,

    async send(to, signal) {
      const payload: CodePayload = { pubkey: identity.pubkey, signal };
      const code = encodeCode({
        kind: "peer",
        id: to,
        signal: JSON.stringify(payload),
      });
      for (const handler of [...codes]) handler(code);
    },

    onSignal(handler) {
      signals.add(handler);
      return () => {
        signals.delete(handler);
      };
    },

    onCode(handler) {
      codes.add(handler);
      return () => {
        codes.delete(handler);
      };
    },

    deliver(code) {
      const parsed = parseCode(code);
      if (!parsed || parsed.kind !== "peer") return false;
      let payload: CodePayload;
      try {
        payload = JSON.parse(parsed.signal) as CodePayload;
      } catch {
        return false;
      }
      if (
        !payload ||
        typeof payload.pubkey !== "string" ||
        !payload.signal ||
        typeof payload.signal.type !== "string"
      ) {
        return false;
      }
      for (const handler of [...signals]) {
        handler(payload.pubkey, payload.signal);
      }
      return true;
    },
  };
}
