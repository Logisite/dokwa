/**
 * The test till: the same packages and the same mechanisms, with a separate
 * identity, separate stores and no value at risk. The ecash it signs is real
 * ecash; nothing behind it is spendable for sats.
 */

import type { Wire } from "@dokwa/core";
import {
  createIdentity,
  deriveMintKeyset,
  signEvent,
  verifyEvent,
  type Identity,
} from "@dokwa/keys";
import { openMint, openMintStore, type Mint } from "@dokwa/mint";
import { openWallet, openWalletStore, type Wallet } from "@dokwa/wallet";
import {
  openGate,
  openWithSeed,
  seal,
  signBadge,
  signSlip,
} from "@dokwa/records";
import { openWalletStore as openRaceStore } from "@dokwa/wallet";
import { chainRequestBytes } from "@dokwa/wires";
import { loadSeed } from "./seed.ts";
import { storeRecord } from "./records.ts";

export interface Practice {
  identity: Identity;
  mint: Mint;
  wallet: Wallet;
  walletSeed: Uint8Array;
  subject: string;
  mintStore: ReturnType<typeof openMintStore>;
  walletStore: ReturnType<typeof openWalletStore>;
}

export function openPractice(): Practice {
  const tillSeed = loadSeed("practice:till").seed;
  const walletSeed = loadSeed("practice:wallet").seed;
  const identity = createIdentity(tillSeed);
  const mintStore = openMintStore("dokwa:practice:till");
  const mint = openMint({
    keyset: deriveMintKeyset(tillSeed),
    identity,
    url: "dokwa:practice",
    store: mintStore,
  });
  const walletStore = openWalletStore("dokwa:practice:wallet");
  const wallet = openWallet({ store: walletStore, mint });
  return {
    identity,
    mint,
    wallet,
    walletSeed,
    subject: createIdentity(walletSeed).pubkey,
    mintStore,
    walletStore,
  };
}

export interface ShiftResult {
  receipt: string;
  badge?: string;
}

function award(identity: Identity, lesson: string, subject: string): string {
  const event = signBadge(identity, { lesson, subject });
  storeRecord({ event });
  return event.id;
}

/** The three shifts with no mechanism stay named, never simulated. */
export const UNBUILT: Record<number, string> = {
  6: "No reserve proof exists in packages/mint, and the Wire has no relay subscription for the room to compare three relays. The finding is on the board.",
  7: "No package has a hashlock, a preimage or a timelock. The stall needs a swap service that is not built.",
  10: "Auditing without revealing which records exist needs an existence-proof shape. Nothing in keys, records or the contract carries one.",
};

export const SHIFTS: Array<{ n: number; title: string; prompt: string }> = [
  {
    n: 1,
    title: "The till",
    prompt: "Take a tip over a scoped capability; read what you were given.",
  },
  {
    n: 2,
    title: "The rotation",
    prompt:
      "Rotate a bearer secret; read the notarised note proving when the old key died.",
  },
  {
    n: 3,
    title: "The 2am key",
    prompt:
      "Redeem a read-only credential that turns out to be a bearer token.",
  },
  {
    n: 4,
    title: "The race",
    prompt: "Two claims for one slot; only one blind signature unblinds.",
  },
  {
    n: 5,
    title: "The split",
    prompt:
      "Hold half a duo's sub-wallet; prove you cannot read the other half.",
  },
  {
    n: 6,
    title: "The audit",
    prompt: "Spot a quiet edit to a mint's reserve across three relays.",
  },
  {
    n: 7,
    title: "The stall",
    prompt: "A preimage misses its timelock; read the thread, then the ruling.",
  },
  {
    n: 8,
    title: "The door",
    prompt: "Authorise entry against a block your own node confirmed.",
  },
  {
    n: 9,
    title: "Two secrets",
    prompt:
      "Revocation keys defend against counterparties; blinding factors against issuers.",
  },
  {
    n: 10,
    title: "The quiet query",
    prompt: "Audit without revealing which records exist.",
  },
  {
    n: 11,
    title: "The anonymous issuer",
    prompt: "A reward badge signed by a key nobody can link to the venue.",
  },
];

/** Run one shift with real keys, real signing and real records. */
export async function runShift(
  n: number,
  practice: Practice,
  wire: Wire,
): Promise<ShiftResult> {
  const { identity, mint, wallet, subject } = practice;
  switch (n) {
    case 1: {
      const badgeEvent = signBadge(identity, { lesson: "till", subject });
      storeRecord({ event: badgeEvent });
      const gate = openGate([{ lesson: "till", capability: "till.issue" }]);
      const slip = await gate.makeSlip(
        identity,
        {
          capability: "till.issue",
          subject,
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
        [badgeEvent],
      );
      const quote = await wallet.requestQuote({
        amount: 4,
        description: "a tip on the test till",
      });
      await mint.settle(quote.id);
      const received = await wallet.receiveQuote(quote.id, { waitMs: 1000 });
      return {
        receipt: `tip quote ${quote.id.slice(0, 8)} settled, ${received} sat held (balance ${await wallet.balance()}); covered slip ${slip.event.id.slice(0, 8)}`,
        badge: award(identity, "the till", subject),
      };
    }
    case 2: {
      const old = createIdentity();
      const note = signEvent(old, {
        kind: 30001,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["dead", old.pubkey]],
        content: "the old bearer key died here",
      });
      if (!verifyEvent(note))
        throw new Error("the rotation note does not verify");
      const fresh = createIdentity();
      return {
        receipt: `old key ${old.pubkey.slice(0, 8)} notarised at ${note.created_at} and verified; fresh key ${fresh.pubkey.slice(0, 8)}`,
        badge: award(identity, "the rotation", subject),
      };
    }
    case 3: {
      const sealed = seal(subject, "this credential is a bearer token");
      const event = signSlip(identity, {
        capability: "till.open",
        subject,
        expires: Math.floor(Date.now() / 1000) + 3600,
        sealed,
      });
      const opened = openWithSeed(practice.walletSeed, sealed);
      return {
        receipt: `sealed slip ${event.id.slice(0, 8)} opened from the subject seed: ${opened}`,
        badge: award(identity, "the 2am key", subject),
      };
    }
    case 4: {
      const quote = await wallet.requestQuote({
        amount: 2,
        description: "one slot, two claims",
      });
      await mint.settle(quote.id);
      const other = openWallet({
        store: openRaceStore("dokwa:practice:race"),
        mint,
      });
      const [a, b] = await Promise.allSettled([
        wallet.receiveQuote(quote.id, { waitMs: 1000 }),
        other.receiveQuote(quote.id, { waitMs: 1000 }),
      ]);
      const wins = [a, b].filter((r) => r.status === "fulfilled").length;
      const losses = [a, b].filter((r) => r.status === "rejected").length;
      return {
        receipt: `one quote, two claims: ${wins} signed, ${losses} refused; winner balance ${await wallet.balance()}`,
        badge: award(identity, "the race", subject),
      };
    }
    case 5: {
      const half = seal(subject, "this half is yours");
      const other = openWithSeed(new Uint8Array(32).fill(7), half);
      const own = openWithSeed(practice.walletSeed, half);
      return {
        receipt: `own seed reads "${own}", a stranger's seed returns ${String(other)}`,
        badge: award(identity, "the split", subject),
      };
    }
    case 8: {
      const answer = await wire.request(
        { kind: "chain", network: "signet" },
        chainRequestBytes({ path: "/blocks/tip/height" }),
      );
      if (answer.status !== "ok") {
        const reason = answer.status === "failed" ? answer.reason : "later";
        return {
          receipt: `the chain lookup answered ${answer.status}: ${reason}`,
        };
      }
      const height = new TextDecoder().decode(answer.bytes).trim();
      const slip = signSlip(identity, {
        capability: "room.host",
        subject,
        expires: Math.floor(Date.now() / 1000) + 3600,
      });
      return {
        receipt: `signet tip ${height} from a real chain request; door slip ${slip.id.slice(0, 8)}`,
        badge: award(identity, "the door", subject),
      };
    }
    case 9: {
      const revoked = createIdentity();
      const note = signEvent(revoked, {
        kind: 30002,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["revokes", revoked.pubkey]],
        content: "revocation key",
      });
      const proofs = await wallet.proofs();
      return {
        receipt: `revocation note ${note.id.slice(0, 8)}; ${proofs.length} held proofs carry their own blinding factors, not the revocation key`,
        badge: award(identity, "two secrets", subject),
      };
    }
    case 11: {
      const anonymous = createIdentity();
      const badge = signBadge(anonymous, {
        lesson: "the anonymous issuer",
        subject,
      });
      storeRecord({ event: badge });
      return {
        receipt: `badge ${badge.id.slice(0, 8)} signed by ${anonymous.pubkey.slice(0, 8)}, unlinkable to the venue key ${identity.pubkey.slice(0, 8)}`,
        badge: badge.id,
      };
    }
    default:
      throw new Error(`shift ${n} has no implementation`);
  }
}
