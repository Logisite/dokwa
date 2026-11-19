/**
 * @dokwa/records. Receipts, permission slips, badges, the lesson gate, and
 * the seal that keeps a slip's private half to its subject.
 *
 * The public surface is this file. Everything else in the package is internal.
 */

export {
  BADGE_KIND,
  RECEIPT_KIND,
  SLIP_KIND,
  readBadge,
  readReceipt,
  readSlip,
  signBadge,
  signReceipt,
  signSlip,
  type BadgeInput,
  type ReadFail,
  type ReadOk,
  type ReadResult,
  type ReceiptInput,
  type SlipInput,
} from "./records.ts";

export { open, seal } from "./seal.ts";

export {
  openGate,
  type GateOptions,
  type GateResult,
  type GateRule,
  type GateWarning,
  type LessonGate,
} from "./gate.ts";
