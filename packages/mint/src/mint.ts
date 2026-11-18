/**
 * The till.
 *
 * A Cashu mint small enough to live in the tab that also shows the money. It
 * holds the keyset, answers the four calls a wallet makes, and keeps the one
 * list that makes a token spendable exactly once.
 *
 * The order in every issuing call is the money-safety rule: record the secret
 * (or claim the quote) first, sign second. A crash can lose a coin; it can
 * never make the same coin twice.
 */

import type { Unit } from "@dokwa/core";
import {
  serialisePublicKeyset,
  signBlinded,
  secretToY,
  validateBlindedMessage,
  verifyProof,
  type BlindedMessage,
  type BlindedSignature,
  type Identity,
  type MintKeyset,
  type Proof,
} from "@dokwa/keys";
import { MintOperationError } from "@cashu/cashu-ts";
import type { MintQuote, MintStore } from "./types.ts";

/** NUT error codes, from the standard list. */
const ERR_KEYSET_UNKNOWN = 10002;
const ERR_QUOTE_NOT_PAID = 10003;
const ERR_QUOTE_EXPIRED = 10004;
const ERR_QUOTE_ISSUED = 10005;
const ERR_AMOUNT_INVALID = 20003;
const ERR_OUTPUTS_INVALID = 20006;
const ERR_INPUTS_INVALID = 20007;
const ERR_TOKEN_SPENT = 11001;

export interface MintOptions {
  keyset: MintKeyset;
  /** the till's identity; its pubkey names the mint in `/v1/info` */
  identity: Identity;
  /**
   * The label a token carries. It is an identifier, not an address: the till
   * opens no socket, and a wallet reaches it through `request`.
   */
  url: string;
  store: MintStore;
  now?: () => number;
  /** how long a cash quote may be settled, in seconds */
  quoteTtlSeconds?: number;
}

export interface MintKeysResponse {
  keysets: Array<{
    id: string;
    unit: string;
    active: boolean;
    keys: Record<string, string>;
  }>;
}

export interface MintKeysetsResponse {
  keysets: Array<{
    id: string;
    unit: string;
    active: boolean;
  }>;
}

export interface MintInfoResponse {
  name: string;
  pubkey: string;
  version: string;
  description: string;
  contact: never[];
  max_array_length: number;
  nuts: {
    "4": {
      methods: Array<{
        method: string;
        unit: string;
        min_amount: number | null;
        max_amount: number | null;
        description: boolean;
      }>;
      disabled: boolean;
    };
    "5": { methods: never[]; disabled: boolean };
    "7": { supported: boolean };
    "8": { supported: boolean };
    "9": { supported: boolean };
    "12": { supported: boolean };
  };
}

export interface CheckState {
  Y: string;
  state: "UNSPENT" | "SPENT";
  witness: null;
}

export interface Mint {
  readonly url: string;
  readonly keyset: MintKeyset;
  readonly identity: Identity;
  readonly store: MintStore;

  info(): MintInfoResponse;
  keys(id?: string): MintKeysResponse;
  keysets(): MintKeysetsResponse;

  createQuote(input: {
    amount: number;
    method?: string;
    unit?: Unit;
    description?: string;
  }): Promise<MintQuote>;
  readQuote(id: string): Promise<MintQuote | null>;
  /** The operator confirms the cash is in the box. Real money, no invoice. */
  settle(quoteId: string): Promise<MintQuote>;

  mint(quoteId: string, outputs: BlindedMessage[]): Promise<BlindedSignature[]>;
  swap(inputs: Proof[], outputs: BlindedMessage[]): Promise<BlindedSignature[]>;
  checkstate(ys: string[]): Promise<CheckState[]>;
}

function randomId(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function sum(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

function validAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0;
}

export function openMint(options: MintOptions): Mint {
  const { keyset, identity, url, store } = options;
  const now = options.now ?? (() => Date.now());
  const ttl = (options.quoteTtlSeconds ?? 900) * 1000;
  const publicKeys = serialisePublicKeyset(keyset);
  const maxAmount = Object.keys(keyset.keys).reduce(
    (total, amount) => total + Number(amount),
    0,
  );

  function validateOutputs(outputs: BlindedMessage[]): void {
    if (outputs.length === 0)
      throw new MintOperationError(ERR_OUTPUTS_INVALID, "no outputs");
    for (const output of outputs) {
      try {
        validateBlindedMessage(keyset, output);
      } catch (error) {
        throw new MintOperationError(
          ERR_OUTPUTS_INVALID,
          error instanceof Error ? error.message : "invalid output",
        );
      }
    }
  }

  function validateInputs(inputs: Proof[]): void {
    if (inputs.length === 0)
      throw new MintOperationError(ERR_INPUTS_INVALID, "no inputs");
    for (const input of inputs) {
      if (input.id !== keyset.id)
        throw new MintOperationError(
          ERR_INPUTS_INVALID,
          `proof belongs to keyset ${input.id}, not ${keyset.id}`,
        );
      if (!keyset.keys[String(input.amount)])
        throw new MintOperationError(
          ERR_INPUTS_INVALID,
          `no denomination ${input.amount}`,
        );
      if (!verifyProof(keyset, input))
        throw new MintOperationError(
          ERR_INPUTS_INVALID,
          "proof signature is invalid",
        );
    }
  }

  const mint: Mint = {
    url,
    keyset,
    identity,
    store,

    info(): MintInfoResponse {
      return {
        name: "dokwa till",
        pubkey: identity.pubkey,
        version: "0.1.0",
        description: "a till that signs its own ecash",
        contact: [],
        max_array_length: 1000,
        nuts: {
          "4": {
            methods: [
              {
                method: "manual",
                unit: keyset.unit,
                min_amount: 1,
                max_amount: maxAmount,
                description: true,
              },
            ],
            disabled: false,
          },
          "5": { methods: [], disabled: true },
          "7": { supported: true },
          "8": { supported: false },
          "9": { supported: true },
          "12": { supported: true },
        },
      };
    },

    keys(id?: string): MintKeysResponse {
      if (id !== undefined && id !== keyset.id)
        throw new MintOperationError(
          ERR_KEYSET_UNKNOWN,
          `keyset ${id} is not known here`,
        );
      return {
        keysets: [
          {
            id: publicKeys.id,
            unit: publicKeys.unit,
            active: true,
            keys: publicKeys.keys,
          },
        ],
      };
    },

    keysets(): MintKeysetsResponse {
      return {
        keysets: [{ id: keyset.id, unit: keyset.unit, active: true }],
      };
    },

    async createQuote(input): Promise<MintQuote> {
      const method = input.method ?? "manual";
      if (!validAmount(input.amount))
        throw new MintOperationError(ERR_AMOUNT_INVALID, "invalid amount");
      if (input.amount > maxAmount)
        throw new MintOperationError(ERR_AMOUNT_INVALID, "amount too large");
      if ((input.unit ?? keyset.unit) !== keyset.unit)
        throw new MintOperationError(
          ERR_AMOUNT_INVALID,
          `this till issues ${keyset.unit}`,
        );
      const createdAt = now();
      const quote: MintQuote = {
        id: randomId(),
        method,
        request: `cash at the till: ${input.description ?? "a token"}`,
        unit: keyset.unit,
        amount: input.amount,
        state: "UNPAID",
        expiry: createdAt + ttl,
        createdAt,
      };
      await store.putQuote(quote);
      return quote;
    },

    async readQuote(id: string): Promise<MintQuote | null> {
      return store.readQuote(id);
    },

    async settle(quoteId: string): Promise<MintQuote> {
      const settled = await store.updateQuote(quoteId, (quote) => {
        if (quote.state === "ISSUED") return null;
        if (quote.state === "PAID") return quote;
        return { ...quote, state: "PAID", paidAt: now() };
      });
      if (settled) return settled;
      const quote = await store.readQuote(quoteId);
      if (!quote)
        throw new MintOperationError(ERR_QUOTE_NOT_PAID, "unknown quote");
      throw new MintOperationError(
        ERR_QUOTE_ISSUED,
        "quote has already been issued",
      );
    },

    async mint(
      quoteId: string,
      outputs: BlindedMessage[],
    ): Promise<BlindedSignature[]> {
      validateOutputs(outputs);
      const amount = sum(outputs.map((output) => output.amount));

      // Check before claiming, so a malformed request cannot burn a paid quote.
      const before = await store.readQuote(quoteId);
      if (!before)
        throw new MintOperationError(ERR_QUOTE_NOT_PAID, "unknown quote");
      if (before.state === "ISSUED")
        throw new MintOperationError(
          ERR_QUOTE_ISSUED,
          "quote has already been issued",
        );
      if (before.state === "UNPAID")
        throw new MintOperationError(ERR_QUOTE_NOT_PAID, "quote is not paid");
      if (before.expiry !== null && before.expiry < now())
        throw new MintOperationError(ERR_QUOTE_EXPIRED, "quote has expired");
      if (before.amount !== amount)
        throw new MintOperationError(
          ERR_AMOUNT_INVALID,
          `quote is for ${before.amount}, outputs are ${amount}`,
        );

      // The record, before the answer: a crash after this line leaves the
      // quote issued and the coins unissued. It can never issue twice.
      const claimed = await store.updateQuote(quoteId, (quote) =>
        quote.state === "PAID"
          ? { ...quote, state: "ISSUED", issuedAt: now() }
          : null,
      );
      if (!claimed)
        throw new MintOperationError(
          ERR_QUOTE_ISSUED,
          "quote was claimed by another call",
        );

      return outputs.map((output) => signBlinded(keyset, output));
    },

    async swap(
      inputs: Proof[],
      outputs: BlindedMessage[],
    ): Promise<BlindedSignature[]> {
      validateInputs(inputs);
      validateOutputs(outputs);
      const inputAmount = sum(inputs.map((input) => input.amount));
      const outputAmount = sum(outputs.map((output) => output.amount));
      if (inputAmount !== outputAmount)
        throw new MintOperationError(
          ERR_AMOUNT_INVALID,
          `inputs are ${inputAmount}, outputs are ${outputAmount}`,
        );

      const ys = inputs.map((input) => secretToY(input.secret));
      if (new Set(ys).size !== ys.length)
        throw new MintOperationError(ERR_TOKEN_SPENT, "duplicate input");

      // The record, before the answer. Spending first is what makes a crash
      // lose a coin rather than mint one twice.
      const spent = await store.spend(ys);
      if (!spent.ok)
        throw new MintOperationError(ERR_TOKEN_SPENT, "token already spent");

      return outputs.map((output) => signBlinded(keyset, output));
    },

    async checkstate(ys: string[]): Promise<CheckState[]> {
      const spent = new Set(await store.spent(ys));
      return ys.map((Y) => ({
        Y,
        state: spent.has(Y) ? "SPENT" : "UNSPENT",
        witness: null,
      }));
    },
  };

  return mint;
}
