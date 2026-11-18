/**
 * Codes. A camera reads what a screen writes, so the format is one thing on
 * both sides: `dokwa:` + base64url of the JSON form of a `Code`.
 *
 * The matrix comes from a real encoder; the app draws it. Scanning is browser
 * work and belongs where the camera is, not here.
 */

import { encode } from "uqr";
import type { Code } from "./shapes.ts";

export const CODE_PREFIX = "dokwa:";

export type Ecc = "L" | "M" | "Q" | "H";

export interface QrOptions {
  /** error correction; M on screens, Q on printed cards */
  ecc?: Ecc;
  /** quiet zone in modules */
  border?: number;
}

/** Rows of modules, true where a module is dark. */
export function qrModules(text: string, options: QrOptions = {}): boolean[][] {
  const { data } = encode(text, {
    ecc: options.ecc ?? "M",
    border: options.border ?? 4,
  });
  return data;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(text.length + ((4 - (text.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const kinds = new Set(["token", "slip", "peer"]);

function isCode(value: unknown): value is Code {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate["kind"] !== "string" || !kinds.has(candidate["kind"]))
    return false;
  switch (candidate["kind"]) {
    case "token":
      return typeof candidate["token"] === "string";
    case "slip":
      return typeof candidate["event"] === "string";
    case "peer":
      return (
        typeof candidate["id"] === "string" &&
        typeof candidate["signal"] === "string"
      );
    default:
      return false;
  }
}

export function encodeCode(code: Code): string {
  return (
    CODE_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(code)))
  );
}

/** Returns null for anything that is not a code of ours. */
export function parseCode(text: string): Code | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) return null;
  try {
    const bytes = fromBase64Url(trimmed.slice(CODE_PREFIX.length));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isCode(value) ? value : null;
  } catch {
    return null;
  }
}
