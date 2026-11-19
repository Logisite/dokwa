import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  createIdentity,
  eventId,
  identityFromSeed,
  randomSeed,
  signEvent,
  verifyDigest,
  verifyEvent,
  verifyMessage,
  type SignedEvent,
} from "../src/identity.ts";

const seed = utf8ToBytes("dokwa: test seed for one identity");

describe("identity", () => {
  it("is deterministic: one seed, one key", () => {
    const a = identityFromSeed(seed);
    const b = identityFromSeed(seed);
    expect(a.pubkey).toBe(b.pubkey);
  });

  it("the pubkey is x-only hex, 64 characters", () => {
    const identity = createIdentity();
    expect(identity.pubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signs a digest and verifies it", () => {
    const identity = createIdentity();
    const digest = sha256(utf8ToBytes("a receipt"));
    const sig = identity.signDigest(digest);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyDigest(digest, sig, identity.pubkey)).toBe(true);
  });

  it("refuses a digest that changed", () => {
    const identity = createIdentity();
    const sig = identity.signDigest(sha256(utf8ToBytes("a receipt")));
    expect(
      verifyDigest(sha256(utf8ToBytes("a refund")), sig, identity.pubkey),
    ).toBe(false);
  });

  it("refuses a signature from another key", () => {
    const signer = createIdentity();
    const other = createIdentity();
    const sig = signer.signDigest(sha256(utf8ToBytes("a receipt")));
    expect(
      verifyDigest(sha256(utf8ToBytes("a receipt")), sig, other.pubkey),
    ).toBe(false);
  });

  it("signs a message and verifyMessage accepts the message form", () => {
    const identity = createIdentity();
    const message = utf8ToBytes("dokwa");
    // BIP340 signs with a random auxiliary nonce, so two signatures over the
    // same digest are different and both are valid; the digest form is the
    // same digest either way.
    const digestSig = identity.signDigest(sha256(message));
    const messageSig = identity.signMessage(message);
    expect(messageSig).not.toBe(digestSig);
    expect(verifyDigest(sha256(message), messageSig, identity.pubkey)).toBe(
      true,
    );
    expect(verifyMessage(message, messageSig, identity.pubkey)).toBe(true);
  });

  it("verifies a message with verifyMessage", () => {
    const identity = createIdentity();
    expect(
      verifyMessage(
        utf8ToBytes("dokwa"),
        identity.signMessage(utf8ToBytes("dokwa")),
        identity.pubkey,
      ),
    ).toBe(true);
    expect(
      verifyMessage(
        utf8ToBytes("dokwo"),
        identity.signMessage(utf8ToBytes("dokwa")),
        identity.pubkey,
      ),
    ).toBe(false);
  });

  it("gives a different key for a different seed", () => {
    expect(identityFromSeed(seed).pubkey).not.toBe(
      identityFromSeed(randomSeed()).pubkey,
    );
  });
});

describe("events", () => {
  it("computes the nostr id rule independently of the source", () => {
    const identity = createIdentity();
    const template = {
      kind: 7001,
      created_at: 1764499200,
      tags: [
        ["u", "sat"],
        ["amount", "21"],
      ],
      content: "21 sats for the door",
    };
    // the standard serialisation, written out here rather than imported
    const serialised = JSON.stringify([
      0,
      identity.pubkey,
      template.created_at,
      template.kind,
      template.tags,
      template.content,
    ]);
    const expected = bytesToHex(sha256(utf8ToBytes(serialised)));
    expect(eventId({ ...template, pubkey: identity.pubkey })).toBe(expected);
  });

  it("signs and verifies a full event", () => {
    const identity = createIdentity();
    const event = signEvent(identity, {
      kind: 7001,
      created_at: 1764499200,
      tags: [["u", "sat"]],
      content: "21 sats for the door",
    });
    expect(event.id).toMatch(/^[0-9a-f]{64}$/);
    expect(event.sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyEvent(event)).toBe(true);
  });

  it("refuses an event whose content changed", () => {
    const identity = createIdentity();
    const event = signEvent(identity, {
      kind: 7001,
      created_at: 1764499200,
      tags: [],
      content: "21 sats",
    });
    const tampered: SignedEvent = { ...event, content: "22 sats" };
    expect(verifyEvent(tampered)).toBe(false);
  });

  it("refuses an event whose signature changed", () => {
    const identity = createIdentity();
    const event = signEvent(identity, {
      kind: 7001,
      created_at: 1764499200,
      tags: [],
      content: "21 sats",
    });
    const flipped = event.sig.startsWith("0")
      ? "1" + event.sig.slice(1)
      : "0" + event.sig.slice(1);
    expect(verifyEvent({ ...event, sig: flipped })).toBe(false);
  });

  it("refuses an event signed by a key that is not its author", () => {
    const signer = createIdentity();
    const other = createIdentity();
    const event = signEvent(signer, {
      kind: 7001,
      created_at: 1764499200,
      tags: [],
      content: "21 sats",
    });
    expect(verifyEvent({ ...event, pubkey: other.pubkey })).toBe(false);
  });
});
