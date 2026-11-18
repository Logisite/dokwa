/**
 * @dokwa/keys. One identity, one signer, the ecash signing maths, seal and open.
 *
 * The public surface is this file. Everything else in the package is internal.
 */

export {
  createIdentity,
  eventId,
  identityFromSeed,
  randomSeed,
  signEvent,
  verifyDigest,
  verifyEvent,
  verifyMessage,
  type EventTemplate,
  type Identity,
  type SignedEvent,
} from "./identity.ts";

export {
  deriveMintKeyset,
  hashToCurve,
  keysetId,
  publicKeyset,
  secretToY,
  serialisePublicKeyset,
  signBlinded,
  validateBlindedMessage,
  verifyDleq,
  verifyProof,
  type BlindedMessage,
  type BlindedSignature,
  type MintKeyset,
  type MintKeysetOptions,
  type Proof,
} from "./mint.ts";
