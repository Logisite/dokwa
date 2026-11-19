/**
 * The three signed objects that are not money: a receipt for a payment, a
 * permission slip, a badge. Each is a nostr-shaped event from @dokwa/keys, so
 * the id rule and the signature are the standard ones and a record can be
 * checked by anything that reads nostr.
 *
 * Kinds 7101 to 7103 are dokwa's. Content is the typed shape from
 * @dokwa/core, serialised as JSON. Verification checks the event's id and
 * signature first, then the shape, then the caller's business (expiry,
 * subject, what the receipt is for).
 */

import { signEvent, verifyEvent, type SignedEvent } from "@dokwa/keys";
import type { Identity } from "@dokwa/keys";
import type { Badge, Capability, Receipt, Slip, Unit } from "@dokwa/core";

export const RECEIPT_KIND = 7101;
export const SLIP_KIND = 7102;
export const BADGE_KIND = 7103;

export interface ReceiptInput {
  /** the mint that issued the spend, as the token names it */
  mint: string;
  amount: number;
  unit: Unit;
  /** ties the receipt to the coins that were spent */
  tokenId: string;
  purpose: string;
  /** who paid, as a public key */
  payer: string;
}

export interface SlipInput {
  capability: Capability;
  /** who the slip is for */
  subject: string;
  /** epoch seconds */
  expires: number;
  /** a payload only the subject can read */
  sealed?: string;
  /**
   * The lesson whose badge was missing when the gate signed anyway. Written
   * into the event, so the record itself says it was uncovered even after
   * the wrapper is gone.
   */
  badgeMissing?: string;
}

export interface BadgeInput {
  lesson: string;
  /** who was taught */
  subject: string;
  /** epoch seconds; defaults to the signing time */
  at?: number;
}

export interface ReadOk<T> {
  ok: true;
  value: T;
  /**
   * Set by the slip reader when the event carries the gate's
   * ["badge-missing", lesson] tag: the record itself says it was uncovered.
   */
  badgeMissing?: string;
}
export interface ReadFail {
  ok: false;
  reason: "signature" | "kind" | "shape" | "expired";
}
export type ReadResult<T> = ReadOk<T> | ReadFail;

function content(event: SignedEvent): unknown {
  try {
    return JSON.parse(event.content) as unknown;
  } catch {
    return null;
  }
}

function receiptOf(value: unknown): Receipt | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.mint !== "string" ||
    typeof r.amount !== "number" ||
    typeof r.unit !== "string" ||
    typeof r.tokenId !== "string" ||
    typeof r.purpose !== "string" ||
    typeof r.payer !== "string"
  )
    return null;
  return value as Receipt;
}

function slipOf(value: unknown): Slip | null {
  if (typeof value !== "object" || value === null) return null;
  const s = value as Record<string, unknown>;
  if (
    typeof s.capability !== "string" ||
    typeof s.subject !== "string" ||
    typeof s.issuer !== "string" ||
    typeof s.expires !== "number"
  )
    return null;
  if (s.sealed !== undefined && typeof s.sealed !== "string") return null;
  return value as Slip;
}

function badgeOf(value: unknown): Badge | null {
  if (typeof value !== "object" || value === null) return null;
  const b = value as Record<string, unknown>;
  if (
    typeof b.lesson !== "string" ||
    typeof b.teacher !== "string" ||
    typeof b.subject !== "string" ||
    typeof b.at !== "number"
  )
    return null;
  return value as Badge;
}

function read<T>(
  event: SignedEvent,
  kind: number,
  of: (v: unknown) => T | null,
): ReadResult<T> {
  if (event.kind !== kind) return { ok: false, reason: "kind" };
  if (!verifyEvent(event)) return { ok: false, reason: "signature" };
  const value = of(content(event));
  if (!value) return { ok: false, reason: "shape" };
  return { ok: true, value };
}

// ---------------------------------------------------------------- receipts ---

/** A receipt: the venue signs what was paid, for what, by whom. */
export function signReceipt(
  identity: Identity,
  input: ReceiptInput,
  at: number = Math.floor(Date.now() / 1000),
): SignedEvent {
  const receipt: Receipt = {
    mint: input.mint,
    amount: input.amount,
    unit: input.unit,
    tokenId: input.tokenId,
    purpose: input.purpose,
    payer: input.payer,
  };
  return signEvent(identity, {
    kind: RECEIPT_KIND,
    created_at: at,
    tags: [
      ["u", input.unit],
      ["amount", String(input.amount)],
      ["mint", input.mint],
      ["p", input.payer],
      ["token", input.tokenId],
    ],
    content: JSON.stringify(receipt),
  });
}

export function readReceipt(event: SignedEvent): ReadResult<Receipt> {
  return read(event, RECEIPT_KIND, receiptOf);
}

// -------------------------------------------------------------------- slips ---

/**
 * A permission slip. The public part names the capability and the expiry;
 * the sealed part, if there is one, is readable only by the subject.
 */
export function signSlip(
  identity: Identity,
  input: SlipInput,
  at: number = Math.floor(Date.now() / 1000),
): SignedEvent {
  const slip: Slip = {
    capability: input.capability,
    subject: input.subject,
    issuer: identity.pubkey,
    expires: input.expires,
    ...(input.sealed ? { sealed: input.sealed } : {}),
  };
  return signEvent(identity, {
    kind: SLIP_KIND,
    created_at: at,
    tags: [
      ["capability", input.capability],
      ["p", input.subject],
      ["expiration", String(input.expires)],
      ...(input.badgeMissing
        ? [["badge-missing", input.badgeMissing] as [string, string]]
        : []),
    ],
    content: JSON.stringify(slip),
  });
}

export function readSlip(
  event: SignedEvent,
  now: number = Math.floor(Date.now() / 1000),
): ReadResult<Slip> {
  const result = read(event, SLIP_KIND, slipOf);
  if (!result.ok) return result;
  if (result.value.expires <= now) return { ok: false, reason: "expired" };
  // the record carries its own warning when the gate signed over a missing
  // badge, so a replicated event still says so
  const tag = event.tags.find((entry) => entry[0] === "badge-missing")?.[1];
  return tag ? { ...result, badgeMissing: tag } : result;
}

// ------------------------------------------------------------------- badges ---

/** A badge: someone taught, someone learned. Signed by the teacher. */
export function signBadge(
  identity: Identity,
  input: BadgeInput,
  at: number = Math.floor(Date.now() / 1000),
): SignedEvent {
  const badge: Badge = {
    lesson: input.lesson,
    teacher: identity.pubkey,
    subject: input.subject,
    at: input.at ?? at,
  };
  return signEvent(identity, {
    kind: BADGE_KIND,
    created_at: at,
    tags: [
      ["lesson", input.lesson],
      ["p", input.subject],
    ],
    content: JSON.stringify(badge),
  });
}

export function readBadge(event: SignedEvent): ReadResult<Badge> {
  return read(event, BADGE_KIND, badgeOf);
}
