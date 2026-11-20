/**
 * The room's own record shelf: signed events the owner issued and the events
 * a person was given. The packages sign and verify; the room only stores and
 * shows. Nothing here recomputes a signature or a verdict.
 */

import type { Badge, Capability, Receipt, Slip } from "@dokwa/core";
import { createIdentity, type Identity, type SignedEvent } from "@dokwa/keys";
import {
  BADGE_KIND,
  RECEIPT_KIND,
  SLIP_KIND,
  openGate,
  openWithSeed,
  readBadge,
  readReceipt,
  readSlip,
  seal,
  signBadge,
  signReceipt,
  type BadgeInput,
  type ReceiptInput,
  type SlipInput,
} from "@dokwa/records";
import { loadSeed } from "./seed.ts";

const STORE_KEY = "dokwa:records";

export interface StoredRecord {
  event: SignedEvent;
}

/** Seal a slip's private half to the subject. */
export function sealFor(subject: string, plaintext: string): string {
  return seal(subject, plaintext);
}

/** Open a sealed half with the subject's seed. Null means the wrong seed or a changed byte. */
export function openSealed(seed: Uint8Array, sealed: string): string | null {
  return openWithSeed(seed, sealed);
}

export function loadStored(): StoredRecord[] {
  try {
    const raw = globalThis.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as StoredRecord[]) : [];
  } catch {
    return [];
  }
}

export function storeRecord(record: StoredRecord): StoredRecord[] {
  const all = loadStored();
  if (!all.some((held) => held.event.id === record.event.id)) all.push(record);
  globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  return all;
}

/** The till's identity is the venue's record key. No store is opened here. */
export function ownerIdentity(): Identity {
  return createIdentity(loadSeed("till").seed);
}

/** The one gate rule the room ships with: opening the till is a taught shift. */
export const GATE_RULES = [{ lesson: "till", capability: "till.open" }];

export interface SlipRequest {
  capability: Capability;
  subject: string;
  minutes: number;
  sealed?: string;
}

export async function issueSlip(
  request: SlipRequest,
  confirm: (message: string) => Promise<boolean>,
): Promise<{ event: SignedEvent; warning?: string }> {
  const gate = openGate(GATE_RULES, {
    confirm: (warning) => confirm(warning.message),
  });
  const badges = loadStored()
    .filter((record) => record.event.kind === BADGE_KIND)
    .map((record) => record.event);
  const input: SlipInput = {
    capability: request.capability,
    subject: request.subject,
    expires: Math.floor(Date.now() / 1000) + request.minutes * 60,
    ...(request.sealed ? { sealed: request.sealed } : {}),
  };
  const result = await gate.makeSlip(ownerIdentity(), input, badges);
  storeRecord({ event: result.event });
  return {
    event: result.event,
    ...(result.warning ? { warning: result.warning.message } : {}),
  };
}

export function issueBadge(input: BadgeInput): SignedEvent {
  const event = signBadge(ownerIdentity(), input);
  storeRecord({ event });
  return event;
}

export function issueReceipt(input: ReceiptInput): SignedEvent {
  const event = signReceipt(ownerIdentity(), input);
  storeRecord({ event });
  return event;
}

export type ReadSummary =
  | { kind: "slip"; ok: true; value: Slip; badgeMissing?: string }
  | { kind: "badge"; ok: true; value: Badge }
  | { kind: "receipt"; ok: true; value: Receipt }
  | { kind: "slip" | "badge" | "receipt"; ok: false; reason: string }
  | { kind: "unknown"; ok: false; reason: string };

/** Read an event the way its kind says it should be read. */
export function readEvent(event: SignedEvent): ReadSummary {
  if (event.kind === SLIP_KIND) {
    const read = readSlip(event);
    return read.ok
      ? {
          kind: "slip",
          ok: true,
          value: read.value,
          ...(read.badgeMissing ? { badgeMissing: read.badgeMissing } : {}),
        }
      : { kind: "slip", ok: false, reason: read.reason };
  }
  if (event.kind === BADGE_KIND) {
    const read = readBadge(event);
    return read.ok
      ? { kind: "badge", ok: true, value: read.value }
      : { kind: "badge", ok: false, reason: read.reason };
  }
  if (event.kind === RECEIPT_KIND) {
    const read = readReceipt(event);
    return read.ok
      ? { kind: "receipt", ok: true, value: read.value }
      : { kind: "receipt", ok: false, reason: read.reason };
  }
  return { kind: "unknown", ok: false, reason: "this is not a dokwa record" };
}
