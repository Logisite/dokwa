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

/**
 * A NUT-04 quote as the wallet sees it. `request` is what the payer is shown:
 * a payment instruction for cash at the till, or a lightning request later.
 */
export interface MintLinkQuote {
  id: string;
  amount: number;
  request: string;
  /** UNPAID, PAID or ISSUED */
  state: string;
  expiry: number | null;
}

export interface MintLink {
  /**
   * The public keysets, denominations included. Synchronous in process, and
   * a promise across a peer destination, where even this answer travels as
   * bytes; callers await it either way.
   */
  keys(): MintLinkKeys | Promise<MintLinkKeys>;
  /**
   * Ask the till for value: the NUT-04 quote request. This is the call a
   * patron on another device frames over the peer channel, so it lives on
   * the link rather than only on the venue side.
   */
  createQuote(input: {
    amount: number;
    method?: string;
    description?: string;
  }): Promise<MintLinkQuote>;
  /** whether the operator has confirmed the payment, read without paying */
  readQuote(id: string): Promise<MintLinkQuote | null>;
  /** pay a paid quote: blinded messages in, blind signatures out */
  mint(quoteId: string, outputs: BlindedMessage[]): Promise<BlindedSignature[]>;
  /** spend proofs and get fresh ones back, same total */
  swap(inputs: Proof[], outputs: BlindedMessage[]): Promise<BlindedSignature[]>;
  /** whether a Y has been spent, read without spending */
  checkstate(ys: string[]): Promise<MintLinkCheckState[]>;
  /** how the till names itself in a token; optional */
  describe?(): { pubkey?: string; url?: string };
}
