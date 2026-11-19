/**
 * The chain wallet: an address from a seed, an address per deposit, a payout
 * signed and sent.
 *
 * The descriptor and the keys come from the seed through bdk's own maths, so
 * the same seed always gives the same wallet and no other component holds a
 * copy.
 *
 * THE SEAM, AS RULED (board/rulings.md, sixth line): the sync path bypasses
 * the Wire. BDK wasm's Update has a private constructor and EsploraClient is
 * its only producer, so the sync is a declared black-box fetch inside the
 * wasm, scoped to `sync` and `full_scan` against signet, on the human's
 * ruling of 2026-11-18. The offline behaviour is loud by design: a sync that
 * cannot reach the endpoint throws, it never hands back a stale balance as
 * current. Everything that is NOT locked inside the wasm still rides the
 * Wire: a broadcast is bytes out through `wire.send({ kind: chain })`, and
 * `request({ kind: chain })` remains the room's own way to look at signet.
 */

import {
  Amount,
  Address,
  EsploraClient,
  FeeRate,
  Recipient,
  SignOptions,
  seed_to_descriptor,
  Wallet as BdkWallet,
  type DescriptorPair,
} from "@bitcoindevkit/bdk-wallet-web";
import type { Replied, Wire } from "@dokwa/core";

export type ChainNetwork = "signet";

/** The endpoint wires validated against real signet. */
const DEFAULT_ENDPOINT = "https://mempool.space/signet/api";

export interface ChainWalletOptions {
  /** the one secret this wallet is derived from */
  seed: Uint8Array;
  network?: ChainNetwork;
  /**
   * The broadcast rides this. Injected, not imported: this package opens no
   * socket of its own except the ruled sync exception above.
   */
  wire?: Wire;
  /** esplora endpoint for the ruled sync; signet only */
  endpoint?: string;
}

export interface ChainDescriptors {
  external: string;
  internal: string;
}

export interface DepositAddress {
  /** the signet address, bech32 */
  address: string;
  /** the derivation index it came from */
  index: number;
  keychain: "external";
}

export interface ChainBalance {
  confirmedSat: number;
  trustedSpendableSat: number;
  totalSat: number;
}

export interface Payout {
  /** the signed transaction's txid */
  txid: string;
  /** consensus bytes, ready for the Wire */
  raw: Uint8Array;
}

export interface ChainWallet {
  readonly network: ChainNetwork;
  readonly descriptors: ChainDescriptors;
  /** a fresh address for the next deposit */
  newDepositAddress(): DepositAddress;
  /**
   * The ruled sync: a black-box fetch inside the wasm, and the only way this
   * package reaches signet directly. Throws when the endpoint cannot be
   * reached; the balance it returns afterwards is current, never stale.
   */
  sync(): Promise<ChainBalance>;
  /** what the last sync saw, without asking the chain again */
  balance(): ChainBalance;
  /** sign a payout; no bytes leave the device here */
  preparePayout(
    to: { address: string; amountSat: number },
    feeSatPerVb?: number,
  ): Payout;
  /** sign a payout; no bytes leave the device here */
  preparePayout(
    to: { address: string; amountSat: number },
    feeSatPerVb?: number,
  ): Payout;
  /**
   * The payout through the Wire: the bytes carry the HTTP envelope the
   * chain destination parses (method, path, body on the configured
   * endpoint), and `ok` with the echoed txid is the success word, stronger
   * than `delivered`, because the endpoint confirmed it parsed and accepted.
   */
  sendPayout(
    to: { address: string; amountSat: number },
    feeSatPerVb?: number,
  ): Promise<{ payout: Payout; replied: Replied }>;
  /** whether the txid is in the wallet's graph after a sync */
  hasTransaction(txid: string): boolean;
}

export function chainDescriptors(
  seed: Uint8Array,
  network: ChainNetwork = "signet",
): ChainDescriptors & { pair: DescriptorPair } {
  const pair = seed_to_descriptor(seed, network, "p2wpkh");
  return { external: pair.external, internal: pair.internal, pair };
}

/** The HTTP envelope the chain destination parses: method, path, body. */
function chainRequestBytes(request: {
  method?: string;
  path: string;
  body?: string;
}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(request));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createChainWallet(options: ChainWalletOptions): ChainWallet {
  const network = options.network ?? "signet";
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const descriptors = chainDescriptors(options.seed, network);
  const wallet = BdkWallet.create(
    network,
    descriptors.external,
    descriptors.internal,
  );

  function syncBalance(): ChainBalance {
    const b = wallet.balance;
    return {
      confirmedSat: Number(b.confirmed.to_sat()),
      trustedSpendableSat: Number(b.trusted_spendable.to_sat()),
      totalSat: Number(b.total.to_sat()),
    };
  }

  function buildPayout(
    to: { address: string; amountSat: number },
    feeSatPerVb: number,
  ): Payout {
    const address = Address.from_string(to.address, network);
    const psbt = wallet
      .build_tx()
      .add_recipient(
        Recipient.from_address(address, Amount.from_sat(BigInt(to.amountSat))),
      )
      .fee_rate(new FeeRate(BigInt(Math.round(feeSatPerVb))))
      .finish();
    const signOptions = new SignOptions();
    signOptions.try_finalize = true;
    if (!wallet.sign(psbt, signOptions))
      throw new Error("chain: the wallet could not sign this payout");
    const tx = psbt.extract_tx();
    return { txid: tx.compute_txid().toString(), raw: tx.to_bytes() };
  }

  return {
    network,
    descriptors: {
      external: descriptors.external,
      internal: descriptors.internal,
    },

    newDepositAddress(): DepositAddress {
      const info = wallet.reveal_next_address("external");
      return {
        address: info.address.toString(),
        index: info.index,
        keychain: "external",
      };
    },

    async sync(): Promise<ChainBalance> {
      const esplora = new EsploraClient(endpoint, 1);
      try {
        const update = await esplora.full_scan(wallet.start_full_scan(), 20, 5);
        wallet.apply_update(update);
        return syncBalance();
      } catch (error) {
        throw new Error(
          `chain: the sync could not reach ${endpoint}; no balance is being shown as current. ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
    },

    balance(): ChainBalance {
      return syncBalance();
    },

    preparePayout(to, feeSatPerVb = 1): Payout {
      return buildPayout(to, feeSatPerVb);
    },

    async sendPayout(to, feeSatPerVb = 1) {
      if (!options.wire)
        throw new Error(
          "chain: a payout leaves through a Wire, and none was injected",
        );
      const payout = buildPayout(to, feeSatPerVb);
      const envelope = chainRequestBytes({
        method: "POST",
        path: "/tx",
        body: hex(payout.raw),
      });
      const replied = await options.wire.request(
        { kind: "chain", network: "signet" },
        envelope,
      );
      if (replied.status !== "ok")
        throw new Error(
          `chain: the broadcast did not get an answer from the Wire: ${
            replied.status === "failed"
              ? `failed / ${replied.reason}`
              : replied.status
          }`,
        );
      const echoed = new TextDecoder().decode(replied.bytes).trim();
      if (echoed !== payout.txid)
        throw new Error(
          `chain: the endpoint echoed ${echoed}, but the signed transaction is ${payout.txid}`,
        );
      return { payout, replied };
    },

    hasTransaction(txid: string): boolean {
      return wallet.transactions().some((tx) => tx.txid.toString() === txid);
    },
  };
}
