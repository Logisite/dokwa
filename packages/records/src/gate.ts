/**
 * The covered lesson: the gate that decides whether a badge is required for a
 * slip, and then signs anyway, because a missing badge is never a reason for
 * a slip to be absent.
 *
 * The rule the brief states, and this file obeys: the gate warns and it signs
 * anyway, with the owner's confirmation. It never silently blocks. If the
 * owner has not wired a confirmation, a missing badge is a thrown error that
 * says exactly what is missing, which is loud, not silent.
 */

import type { Capability } from "@dokwa/core";
import { readBadge, signSlip, type SlipInput } from "./records.ts";
import type { SignedEvent } from "@dokwa/keys";

export interface GateRule {
  /** which lesson's badge opens this capability */
  lesson: string;
  /** the capability that is covered */
  capability: Capability;
}

export interface GateWarning {
  requires: string;
  subject: string;
  capability: Capability;
  message: string;
}

export interface GateResult {
  event: SignedEvent;
  /** present when the slip went out over a missing badge */
  warning?: GateWarning;
}

export interface GateOptions {
  now?: () => number;
  /**
   * The owner's say. Called with the warning when a required badge is
   * missing; returning false refuses the slip, out loud, not silently.
   */
  confirm?: (warning: GateWarning) => Promise<boolean> | boolean;
}

export interface LessonGate {
  /** what this capability needs, if anything */
  required(capability: Capability): string | null;
  /** whether the subject holds a live badge for it */
  satisfied(
    capability: Capability,
    subject: string,
    badges: SignedEvent[],
  ): boolean;
  /** the slip, with a warning when it went out uncovered */
  makeSlip(
    identity: import("@dokwa/keys").Identity,
    input: Omit<SlipInput, "sealed"> & { sealed?: string },
    badges: SignedEvent[],
  ): Promise<GateResult>;
}

export function openGate(
  rules: GateRule[],
  options: GateOptions = {},
): LessonGate {
  const now = options.now ?? (() => Date.now());

  function required(capability: Capability): string | null {
    return rules.find((rule) => rule.capability === capability)?.lesson ?? null;
  }

  function satisfied(
    capability: Capability,
    subject: string,
    badges: SignedEvent[],
  ): boolean {
    const lesson = required(capability);
    if (!lesson) return true;
    return badges.some((badge) => {
      const read = readBadge(badge);
      if (!read.ok) return false;
      return (
        read.value.lesson === lesson &&
        read.value.subject === subject &&
        read.value.at <= Math.floor(now() / 1000)
      );
    });
  }

  return {
    required,
    satisfied,

    async makeSlip(identity, input, badges): Promise<GateResult> {
      const lesson = required(input.capability);
      if (lesson && !satisfied(input.capability, input.subject, badges)) {
        const warning: GateWarning = {
          requires: lesson,
          subject: input.subject,
          capability: input.capability,
          message: `a ${input.capability} slip is covered by the ${lesson} lesson and ${input.subject.slice(0, 12)} has no badge for it; it can still be signed, if the owner says so`,
        };
        if (!options.confirm) {
          throw new Error(
            `dokwa: ${warning.message}; no owner is wired to confirm, so the gate refuses out loud`,
          );
        }
        const allowed = await options.confirm(warning);
        if (!allowed) {
          throw new Error(
            `dokwa: the owner refused the uncovered ${input.capability} slip`,
          );
        }
        return {
          event: signSlip(identity, input, Math.floor(now() / 1000)),
          warning,
        };
      }
      return { event: signSlip(identity, input, Math.floor(now() / 1000)) };
    },
  };
}
