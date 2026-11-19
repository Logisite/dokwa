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

export type SpendResult = { ok: true } | { ok: false; spent: string[] };

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
