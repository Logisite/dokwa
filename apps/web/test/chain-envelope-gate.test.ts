/**
 * The merge gate's object swap, as the human set it: the same chain call
 * crypto's payout rig proved against its own Wire, run once against wires'
 * real Chain destination from feat/wires.
 *
 * What this proves: crypto's envelope dialect and wires' parse agree on the
 * same real endpoint, and the Wire answers `ok` with the endpoint's bytes,
 * so the only thing the room changes at composition is which object is
 * injected.
 *
 * What it does not prove: a fresh broadcast. That needs faucet budget the
 * rig already spent, and the broadcast path is proven on both sides
 * separately. This is a read, and the restriction is stated rather than
 * papered over.
 */

import { describe, expect, it } from "vitest";
// createWire opens the Dexie outbox at construction; Node has no IndexedDB,
// so the same shim wires' own suites use runs the real store code here too.
import "fake-indexeddb/auto";
import { createWire, chainRequestBytes } from "@dokwa/wires";

const TXID = "ace64aec5b66f46668d4d0baf1b716303f8a3258699f067090b98e3e9fb3bf11";
const ENDPOINT = "https://mempool.space/signet/api";

describe("the chain envelope, against wires' real Chain", () => {
  it("asks for the payout txid and gets its hex back as ok", async () => {
    const wire = createWire({ signet: ENDPOINT, timeoutMs: 20_000 });
    try {
      const bytes = chainRequestBytes({
        method: "GET",
        path: `/tx/${TXID}/hex`,
      });
      const replied = await wire.request(
        { kind: "chain", network: "signet" },
        bytes,
      );
      expect(replied.status).toBe("ok");
      if (replied.status !== "ok") return;
      const text = new TextDecoder().decode(replied.bytes).trim();
      expect(text).toMatch(/^[0-9a-f]+$/);
      expect(text.length % 2).toBe(0);
      expect(text.length).toBeGreaterThan(100);
    } finally {
      wire.close();
    }
  }, 40_000);

  it("refuses a bare payload that did not name its own path", async () => {
    const wire = createWire({ signet: ENDPOINT, timeoutMs: 20_000 });
    try {
      const bare = new TextEncoder().encode(TXID);
      const replied = await wire.request(
        { kind: "chain", network: "signet" },
        bare,
      );
      expect(replied.status).toBe("failed");
      if (replied.status === "failed") {
        expect(replied.reason).toBe("rejected");
      }
    } finally {
      wire.close();
    }
  }, 40_000);
});
