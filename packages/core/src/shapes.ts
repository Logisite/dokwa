/**
 * The objects that carry meaning. Frozen in shape, free in content.
 *
 * `build-contract.md` §4 is the table these come from. Two implementations
 * that agree on a name agree on a thing; two that invent one do not.
 *
 * Minimal on purpose: a field that is not here yet can be added by agreement
 * on the board, and a field that is here and unused costs nothing.
 */

/** A cashu token as it travels: the standard token string. */
export type TokenString = string;

export type Unit = "sat" | "msat";

/** An identifier in the shape the record uses: a hex public key. */
export type PublicKey = string;

/** What a permission slip can permit. Open, because a venue names its own. */
export type Capability =
  | "till.open"
  | "till.close"
  | "till.issue"
  | "room.host"
  | "room.teach"
  | "record.write"
  | (string & {});

/** A payment that happened. Signed by the venue. */
export interface Receipt {
  /** the mint that issued the spend */
  mint: string;
  /** the amount, in `unit` */
  amount: number;
  unit: Unit;
  /** ties the receipt to a real spend */
  tokenId: string;
  /** what it was for, in the venue's words */
  purpose: string;
  /** who paid */
  payer: PublicKey;
}

/**
 * A permission, held by a person. The public part names what and until when;
 * the sealed part is readable only by the subject.
 */
export interface Slip {
  capability: Capability;
  /** who it is for */
  subject: PublicKey;
  /** who signed it */
  issuer: PublicKey;
  /** epoch seconds */
  expires: number;
  /** the sealed payload, if there is one */
  sealed?: string;
}

/** A lesson that was completed. Signed by whoever taught it. */
export interface Badge {
  lesson: string;
  teacher: PublicKey;
  subject: PublicKey;
  /** epoch seconds */
  at: number;
}

/** A point of exchange: an amount moving to a person, tied to a mint. */
export interface Grant {
  receipt: Receipt;
  /** the id of the signed event carrying the receipt */
  event: string;
}

/** What a code can carry. Small on purpose: codes are read by cameras. */
export type Code =
  | { kind: "token"; token: TokenString }
  | { kind: "slip"; event: string }
  | { kind: "peer"; id: string; signal: string };
