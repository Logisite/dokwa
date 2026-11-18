import { describe, expect, it } from "vitest";
import { CODE_PREFIX, encodeCode, parseCode, qrModules } from "../src/qr.ts";
import type { Code } from "../src/shapes.ts";

const codes: Code[] = [
  { kind: "token", token: "cashuBexample" },
  { kind: "slip", event: "a".repeat(64) },
  { kind: "peer", id: "peer-1", signal: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n" },
];

describe("codes", () => {
  it("round-trips every kind", () => {
    for (const code of codes) {
      expect(parseCode(encodeCode(code))).toEqual(code);
    }
  });

  it("is prefixed so it cannot be mistaken for something else", () => {
    expect(encodeCode(codes[0]!)).toMatch(new RegExp(`^${CODE_PREFIX}`));
  });

  it("refuses anything that is not ours", () => {
    expect(parseCode("https://example.invalid")).toBeNull();
    expect(parseCode("dokwa:not base64!")).toBeNull();
    expect(parseCode("dokwa:" + btoa(JSON.stringify({ hello: 1 })))).toBeNull();
  });

  it("produces a matrix with a quiet zone", () => {
    const modules = qrModules("dokwa:test", { ecc: "M", border: 4 });
    expect(modules.length).toBeGreaterThan(8);
    expect(modules[0]!.every((dark) => dark === false)).toBe(true);
    expect(modules.length).toBe(modules[0]!.length);
  });
});
