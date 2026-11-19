import { describe, expect, it } from "vitest";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  createIdentity,
  identityFromSeed,
  type SignedEvent,
} from "@dokwa/keys";
import {
  BADGE_KIND,
  RECEIPT_KIND,
  SLIP_KIND,
  open,
  openGate,
  openWithSeed,
  readBadge,
  readReceipt,
  readSlip,
  seal,
  signBadge,
  signReceipt,
  signSlip,
} from "../src/index.ts";

const ISSUER = identityFromSeed(utf8ToBytes("dokwa: the venue's identity"));
const TEACHER = identityFromSeed(utf8ToBytes("dokwa: the teacher's identity"));

/** A subject as a raw key pair, because a seal is opened with the secret. */
function subject() {
  const secret = secp256k1.utils.randomSecretKey();
  return {
    secret,
    pubkey: Buffer.from(schnorr.getPublicKey(secret)).toString("hex"),
  };
}

describe("receipts", () => {
  const receipt = {
    mint: "dokwa:till",
    amount: 21,
    unit: "sat" as const,
    tokenId: "ab".repeat(32),
    purpose: "the door on a cold night",
    payer: ISSUER.pubkey,
  };

  it("is a signed event with the typed shape inside", () => {
    const event = signReceipt(ISSUER, receipt);
    expect(event.kind).toBe(RECEIPT_KIND);
    expect(event.pubkey).toBe(ISSUER.pubkey);
    const read = readReceipt(event);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toEqual(receipt);
    expect(event.tags).toContainEqual(["amount", "21"]);
    expect(event.tags).toContainEqual(["p", ISSUER.pubkey]);
  });

  it("verifies by a second path: the id rule written out here and noble directly", () => {
    const event = signReceipt(ISSUER, receipt);
    // the nostr id rule, re-derived in this test rather than imported
    const serialised = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content,
    ]);
    const digest = Buffer.from(sha256(utf8ToBytes(serialised))).toString("hex");
    expect(digest).toBe(event.id);
    // the signature, checked against the digest with the curve directly
    expect(
      schnorr.verify(
        hexToBytes(event.sig),
        hexToBytes(event.id),
        hexToBytes(event.pubkey),
      ),
    ).toBe(true);
  });

  it("refuses a receipt whose content changed", () => {
    const event = signReceipt(ISSUER, receipt);
    const tampered: SignedEvent = {
      ...event,
      content: event.content.replace("21", "22"),
    };
    const read = readReceipt(tampered);
    expect(read).toMatchObject({ ok: false, reason: "signature" });
  });

  it("refuses a receipt whose signature changed", () => {
    const event = signReceipt(ISSUER, receipt);
    const flipped = event.sig.startsWith("0")
      ? "1" + event.sig.slice(1)
      : "0" + event.sig.slice(1);
    expect(readReceipt({ ...event, sig: flipped })).toMatchObject({
      ok: false,
      reason: "signature",
    });
  });

  it("refuses the wrong kind outright", () => {
    const event = signReceipt(ISSUER, receipt);
    expect(readReceipt({ ...event, kind: SLIP_KIND })).toMatchObject({
      ok: false,
      reason: "kind",
    });
  });
});

describe("permission slips", () => {
  const alice = subject();
  const expires = Math.floor(Date.now() / 1000) + 3600;

  it("the public part is readable without any key", () => {
    const event = signSlip(ISSUER, {
      capability: "till.open",
      subject: alice.pubkey,
      expires,
    });
    expect(event.kind).toBe(SLIP_KIND);
    const read = readSlip(event);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.capability).toBe("till.open");
      expect(read.value.subject).toBe(alice.pubkey);
      expect(read.value.issuer).toBe(ISSUER.pubkey);
    }
  });

  it("the sealed part opens for the subject and for nobody else", () => {
    const sealed = seal(alice.pubkey, "the private half: where to be and when");
    const event = signSlip(ISSUER, {
      capability: "till.open",
      subject: alice.pubkey,
      expires,
      sealed,
    });
    // what the public carries: the sealed string, never the plaintext
    expect(event.content).not.toContain("the private half");
    expect(open(sealed, alice.secret)).toBe(
      "the private half: where to be and when",
    );
    // a stranger's key gets nothing, not garbage
    const stranger = subject();
    expect(open(sealed, stranger.secret)).toBeNull();
  });

  it("a changed envelope is refused by the tag", () => {
    const sealed = seal(alice.pubkey, "the private half");
    const bytes = Uint8Array.from(Buffer.from(sealed, "base64"));
    const middle = Math.floor(bytes.length / 2);
    bytes[middle]! ^= 0x01;
    expect(
      open(Buffer.from(bytes).toString("base64"), alice.secret),
    ).toBeNull();
  });

  it("a slip sealed to a subject opens from that subject's seed, and not another's", () => {
    // the subject's device holds a seed, as the room's does; the identity
    // derives from it, and the seed alone must open the envelope
    const subjectSeed = utf8ToBytes(
      "dokwa: the subject's device seed, sixteen+",
    );
    const subject = identityFromSeed(subjectSeed);
    const otherSeed = utf8ToBytes("dokwa: somebody else's seed, sixteen bytes");
    const sealed = seal(subject.pubkey, "the private half of the permission");
    const event = signSlip(ISSUER, {
      capability: "till.open",
      subject: subject.pubkey,
      expires: Math.floor(Date.now() / 1000) + 3600,
      sealed,
    });
    expect(readSlip(event).ok).toBe(true);
    expect(openWithSeed(subjectSeed, sealed)).toBe(
      "the private half of the permission",
    );
    // a different seed gets nothing, not garbage
    expect(openWithSeed(otherSeed, sealed)).toBeNull();
    expect(identityFromSeed(otherSeed).pubkey).not.toBe(subject.pubkey);
  });

  it("round trips for every subject, whatever the parity of their key", () => {
    // The even-y trap: a recipient whose dG has odd y negates the shared
    // point the sender computes from the x-only key. One trial catches it
    // half the time, so this seals and opens forty.
    for (let i = 0; i < 40; i += 1) {
      const someone = subject();
      const sealed = seal(someone.pubkey, `round trip ${i}`);
      expect(open(sealed, someone.secret)).toBe(`round trip ${i}`);
    }
  });

  it("an expired slip says so", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const event = signSlip(ISSUER, {
      capability: "room.teach",
      subject: alice.pubkey,
      expires: past,
    });
    expect(readSlip(event)).toMatchObject({ ok: false, reason: "expired" });
    // and the same slip is fine while it lives
    const living = signSlip(ISSUER, {
      capability: "room.teach",
      subject: alice.pubkey,
      expires,
    });
    expect(readSlip(living).ok).toBe(true);
  });
});

describe("badges", () => {
  it("names the lesson, the teacher and the subject", () => {
    const student = subject();
    const event = signBadge(TEACHER, {
      lesson: "the door",
      subject: student.pubkey,
    });
    expect(event.kind).toBe(BADGE_KIND);
    expect(event.pubkey).toBe(TEACHER.pubkey);
    const read = readBadge(event);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.lesson).toBe("the door");
      expect(read.value.teacher).toBe(TEACHER.pubkey);
      expect(read.value.subject).toBe(student.pubkey);
    }
  });

  it("refuses a badge signed by someone who is not the teacher", () => {
    const student = subject();
    const event = signBadge(TEACHER, {
      lesson: "the door",
      subject: student.pubkey,
    });
    const impostor = createIdentity();
    const read = readBadge({ ...event, pubkey: impostor.pubkey });
    expect(read).toMatchObject({ ok: false, reason: "signature" });
  });
});

describe("the covered lesson gate", () => {
  const rules = [{ lesson: "the door", capability: "till.open" as const }];
  const student = subject();

  const badgeFor = (studentPubkey: string): SignedEvent =>
    signBadge(TEACHER, { lesson: "the door", subject: studentPubkey });

  it("signs without warning when the badge is there", async () => {
    const gate = openGate(rules);
    const result = await gate.makeSlip(
      ISSUER,
      {
        capability: "till.open",
        subject: student.pubkey,
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
      [badgeFor(student.pubkey)],
    );
    expect(result.warning).toBeUndefined();
    expect(readSlip(result.event).ok).toBe(true);
  });

  it("a capability no rule covers needs no badge", async () => {
    const gate = openGate(rules);
    expect(gate.required("room.teach")).toBeNull();
    const result = await gate.makeSlip(
      ISSUER,
      {
        capability: "room.teach",
        subject: student.pubkey,
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
      [],
    );
    expect(result.warning).toBeUndefined();
  });

  it("warns, asks the owner, and signs anyway when the badge is missing", async () => {
    const asked: string[] = [];
    const gate = openGate(rules, {
      confirm: (warning) => {
        asked.push(warning.message);
        return true;
      },
    });
    const result = await gate.makeSlip(
      ISSUER,
      {
        capability: "till.open",
        subject: student.pubkey,
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
      [],
    );
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("the door");
    expect(result.warning).toBeDefined();
    expect(result.warning!.requires).toBe("the door");
    // the slip exists: a missing badge is never a reason for absence
    expect(readSlip(result.event).ok).toBe(true);
    // and the record carries the warning itself, so replication keeps it
    expect(result.event.tags).toContainEqual(["badge-missing", "the door"]);
    const read = readSlip(result.event);
    expect(read.ok && read.badgeMissing).toBe("the door");
  });

  it("a covered slip carries no badge-missing tag", async () => {
    const gate = openGate(rules);
    const result = await gate.makeSlip(
      ISSUER,
      {
        capability: "till.open",
        subject: student.pubkey,
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
      [badgeFor(student.pubkey)],
    );
    expect(result.warning).toBeUndefined();
    expect(result.event.tags).not.toContainEqual(["badge-missing", "the door"]);
    const read = readSlip(result.event);
    expect(read.ok && read.badgeMissing).toBeUndefined();
  });

  it("the owner's refusal is loud, not silent", async () => {
    const gate = openGate(rules, { confirm: () => false });
    await expect(
      gate.makeSlip(
        ISSUER,
        {
          capability: "till.open",
          subject: student.pubkey,
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
        [],
      ),
    ).rejects.toThrow(/owner refused/);
  });

  it("with no owner wired, the gate refuses out loud rather than silently", async () => {
    const gate = openGate(rules);
    await expect(
      gate.makeSlip(
        ISSUER,
        {
          capability: "till.open",
          subject: student.pubkey,
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
        [],
      ),
    ).rejects.toThrow(/no owner is wired/);
  });

  it("a badge for the wrong subject does not cover the slip", async () => {
    const other = subject();
    const gate = openGate(rules, { confirm: () => true });
    const result = await gate.makeSlip(
      ISSUER,
      {
        capability: "till.open",
        subject: student.pubkey,
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
      [badgeFor(other.pubkey)],
    );
    expect(result.warning).toBeDefined();
  });
});
