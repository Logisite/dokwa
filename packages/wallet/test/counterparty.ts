import {
  createIdentity,
  deriveMintKeyset,
  secretToY,
  signBlinded,
  validateBlindedMessage,
  verifyProof,
  type BlindedMessage,
  type BlindedSignature,
  type MintKeyset,
  type Proof,
} from "@dokwa/keys";
import type {
  MintLink,
  MintLinkCheckState,
  MintLinkKeys,
  MintLinkQuote,
} from "../src/mint-link.ts";

/**
 * The counterparty the wallet is tested against: a real signer with a real
 * all-or-nothing spent list and a real quote store, built from the signing
 * primitives in @dokwa/keys. It is not the mint package, on purpose: the
 * layer rule keeps the mint out of the wallet's package, and the real till
 * object joins the wallet in the apps/web rigs. Everything cryptographic
 * here is real; the bookkeeping is deliberately minimal and honest about it.
 */
export function counterparty(seed: Uint8Array): MintLink & {
  keyset: MintKeyset;
  /** the venue hands out coins directly, for token-shaped tests */
  issue(outputs: BlindedMessage[]): BlindedSignature[];
  /** the operator confirms the cash is in the box */
  settle(quoteId: string): MintLinkQuote;
} {
  const keyset = deriveMintKeyset(seed);
  const identity = createIdentity(seed);
  const spent = new Set<string>();
  const quotes = new Map<string, MintLinkQuote>();
  const keysResponse: MintLinkKeys = {
    keysets: [
      {
        id: keyset.id,
        unit: keyset.unit,
        active: true,
        keys: { ...keyset.keys },
      },
    ],
  };

  function signOutputs(outputs: BlindedMessage[]): BlindedSignature[] {
    if (outputs.length === 0) throw new Error("cp: no outputs");
    return outputs.map((output) => {
      validateBlindedMessage(keyset, output);
      return signBlinded(keyset, output, { dleq: true });
    });
  }

  return {
    keyset,

    issue(outputs: BlindedMessage[]): BlindedSignature[] {
      return signOutputs(outputs);
    },

    keys(): MintLinkKeys {
      return keysResponse;
    },

    describe() {
      return { pubkey: identity.pubkey };
    },

    async createQuote(input: {
      amount: number;
      method?: string;
      description?: string;
    }) {
      if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
        throw new Error("cp: invalid amount");
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      const quote: MintLinkQuote = {
        id: [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""),
        amount: input.amount,
        request: `cash at the till: ${input.description ?? "a token"}`,
        state: "UNPAID",
        expiry: Date.now() + 15 * 60 * 1000,
      };
      quotes.set(quote.id, quote);
      return quote;
    },

    async readQuote(id: string): Promise<MintLinkQuote | null> {
      return quotes.get(id) ?? null;
    },

    settle(quoteId: string): MintLinkQuote {
      const quote = quotes.get(quoteId);
      if (!quote) throw new Error("cp: unknown quote");
      if (quote.state === "ISSUED") throw new Error("cp: quote already issued");
      const paid = { ...quote, state: "PAID" };
      quotes.set(quoteId, paid);
      return paid;
    },

    async mint(
      quoteId: string,
      outputs: BlindedMessage[],
    ): Promise<BlindedSignature[]> {
      const quote = quotes.get(quoteId);
      if (!quote) throw new Error("cp: unknown quote");
      if (quote.state === "ISSUED")
        throw new Error("cp: quote already claimed");
      if (quote.state === "UNPAID") throw new Error("cp: quote is not paid");
      const total = outputs.reduce((sum, output) => sum + output.amount, 0);
      // a malformed request must not burn a paid quote, so validate fully
      // before the claim below
      if (total !== quote.amount) throw new Error("cp: wrong amount");
      for (const output of outputs) validateBlindedMessage(keyset, output);
      // the claim is one synchronous step, record before sign
      quotes.set(quoteId, { ...quote, state: "ISSUED" });
      return signOutputs(outputs);
    },

    async swap(
      inputs: Proof[],
      outputs: BlindedMessage[],
    ): Promise<BlindedSignature[]> {
      if (inputs.length === 0) throw new Error("cp: no inputs");
      const ys: string[] = [];
      for (const input of inputs) {
        if (input.id !== keyset.id)
          throw new Error("cp: proof is for another keyset");
        if (!verifyProof(keyset, input))
          throw new Error("cp: proof does not verify");
        ys.push(secretToY(input.secret));
      }
      if (new Set(ys).size !== ys.length)
        throw new Error("cp: duplicate input");
      // all or nothing: the check and the writes are one synchronous block
      const existing = ys.filter((y) => spent.has(y));
      if (existing.length > 0) throw new Error("cp: token already spent");
      for (const y of ys) spent.add(y);
      return signOutputs(outputs);
    },

    async checkstate(ys: string[]): Promise<MintLinkCheckState[]> {
      return ys.map((Y) => ({
        Y,
        state: spent.has(Y) ? "SPENT" : "UNSPENT",
        witness: null,
      }));
    },
  };
}
