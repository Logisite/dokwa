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
} from "../src/mint-link.ts";

/**
 * The counterparty the wallet is tested against: a real signer with a real
 * all-or-nothing spent list, built from the signing primitives in @dokwa/keys.
 * It is not the mint package, on purpose: the layer rule keeps the mint out of
 * the wallet's package, and the real till object joins the wallet in the
 * apps/web/test rig the structure doc names. Everything cryptographic here is
 * real; the bookkeeping is deliberately minimal and honest about it.
 */
export function counterparty(seed: Uint8Array): MintLink & {
  keyset: MintKeyset;
  issue(outputs: BlindedMessage[]): BlindedSignature[];
} {
  const keyset = deriveMintKeyset(seed);
  const identity = createIdentity(seed);
  const spent = new Set<string>();
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

    async mint(): Promise<BlindedSignature[]> {
      throw new Error("cp: this counterparty issues without quotes");
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
