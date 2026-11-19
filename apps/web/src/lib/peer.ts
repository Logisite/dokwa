/**
 * The two ends of the wallet's peer frame: the till answers, the patron
 * speaks. Both are thin compositions over @dokwa/wallet; the screen never
 * touches frame bytes.
 */

import type { Wire } from "@dokwa/core";
import type { Mint } from "@dokwa/mint";
import { openPeerMintLink, serveMintLink, type MintLink } from "@dokwa/wallet";
import type { PeerSignaller } from "@dokwa/wires";

/**
 * Answer every patron who opens a channel to this till. The singer's first
 * signal names the peer, so the answer is registered before the channel's
 * first NUT frame can arrive.
 */
export function serveTillOverPeer(options: {
  wire: Wire;
  mint: Mint;
  signaller: PeerSignaller;
}): () => void {
  const served = new Map<string, () => void>();
  const off = options.signaller.onSignal((from) => {
    if (served.has(from)) return;
    served.set(
      from,
      serveMintLink({
        wire: options.wire,
        peerId: from,
        mint: options.mint,
      }),
    );
  });
  return () => {
    off();
    for (const dispose of served.values()) dispose();
    served.clear();
  };
}

/** The patron's MintLink to a till whose wire id came from its code. */
export function openWalletOverPeer(wire: Wire, tillId: string): MintLink {
  return openPeerMintLink({ wire, peerId: tillId, timeoutMs: 60_000 });
}
