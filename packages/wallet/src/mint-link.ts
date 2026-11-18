/**
 * What a wallet needs from a mint, and nothing else.
 *
 * This is a structural interface: @dokwa/mint's `openMint` returns an object
 * that satisfies it without either package importing the other. A cross-device
 * till arrives as a different object behind the same shape, framing NUT
 * requests over the peer channel, and the wallet's body does not change.
 */

import type { BlindedMessage, BlindedSignature, Proof } from "@dokwa/keys";

export interface MintLinkKeys {
  keysets: Array<{
    id: string;
    unit: string;
    active: boolean;
    keys: Record<string, string>;
  }>;
}

export interface MintLinkCheckState {
  Y: string;
  state: "UNSPENT" | "SPENT";
  witness: null;
}

export interface MintLink {
  /** the public keysets, denominations included */
  keys(): MintLinkKeys;
  /** pay a paid quote: blinded messages in, blind signatures out */
  mint(quoteId: string, outputs: BlindedMessage[]): Promise<BlindedSignature[]>;
  /** spend proofs and get fresh ones back, same total */
  swap(inputs: Proof[], outputs: BlindedMessage[]): Promise<BlindedSignature[]>;
  /** whether a Y has been spent, read without spending */
  checkstate(ys: string[]): Promise<MintLinkCheckState[]>;
  /** how the till names itself in a token; optional */
  describe?(): { pubkey?: string; url?: string };
}
