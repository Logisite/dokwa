/**
 * The till's small bookkeeping vocabulary. Not a second copy of the Cashu
 * types: a quote and a spent secret, as they are stored.
 */

export type QuoteState = "UNPAID" | "PAID" | "ISSUED";
export interface MintQuote {
  /** NUT-04 quote id */
  id: string;
  /** NUT-04 payment method; "manual" is cash over the counter */
  method: string;
  /** what the payer is shown; for a manual quote, an instruction */
  request: string;
  unit: string;
  amount: number;
  state: QuoteState;
  expiry: number | null;
  createdAt: number;
  paidAt?: number;
  issuedAt?: number;
}

import type { BlindedSignature } from "@dokwa/keys";

export type SpendResult = { ok: true } | { ok: false; spent: string[] };

// ------------------------------------------------------------------- melt ---

/**
 * The payer of a payout, injected because mint may not import chain. The
 * chain wallet of the till pays; a rig may stand in with the same shape.
 */
export interface MeltPayer {
  /** pay the amount to the address; returns the broadcast txid */
  pay(to: MeltPayout): Promise<string>;
}

export interface MeltPayout {
  address: string;
  /** the amount the wallet named, without the fee */
  amountSat: number;
  /**
   * Margin above the payout the inputs must cover. The chain wallet pays
   * the real broadcast fee; this reserves a ceiling for it. Inputs that
   * cannot cover payout plus reserve are refused loudly.
   */
  feeReserve?: number;
}

export interface MeltOptions {
  /** what the payout pays; without one, melt is disabled and says so */
  payer?: MeltPayer;
}

/** NUT-05's input/output form: inputs to spend, outputs for the change. */
export interface MeltTo {
  address: string;
  amountSat: number;
  feeReserve?: number;
}

export interface MeltResult {
  txid: string;
  /** signed change outputs; the wallet unblinds them with its own blinds */
  signatures: BlindedSignature[];
}

/** A real signet payout broadcast fits under this margin. */
export const DEFAULT_FEE_RESERVE = 250;

/**
 * The one thing that makes double-spending impossible.
 *
 * `spend` is all-or-nothing: it records every Y, or records none. It is called
 * before a signature for the new coins is produced, so a crash between the two
 * cannot issue the same coins twice.
 */
export interface MintStore {
  spend(ys: string[]): Promise<SpendResult>;
  spent(ys: string[]): Promise<string[]>;

  readQuote(id: string): Promise<MintQuote | null>;
  /**
   * Write a new quote. Creating is not `updateQuote`: that reads first and
   * refuses what is not there, and a quote is not there yet.
   */
  putQuote(quote: MintQuote): Promise<void>;
  /**
   * Read, change and write one quote in one atomic step. The callback returns
   * null to refuse the change. Returning null means the state was not what the
   * caller required.
   */
  updateQuote(
    id: string,
    update: (quote: MintQuote) => MintQuote | null,
  ): Promise<MintQuote | null>;
}
