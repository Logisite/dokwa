import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// fake-indexeddb, straight from the lockfile's store copy, the same
// test-only path wires used: real IndexedDB semantics in the rig, no
// lockfile edge, no new dependency declared. It must load before dexie's
// module does, so it is a static import and it sits first.
import "../../../node_modules/.pnpm/fake-indexeddb@6.2.8/node_modules/fake-indexeddb/auto/index.mjs";
import { initializeWasmFromBinary } from "lightningdevkit";
import * as ldk from "lightningdevkit";
import { pubkeyFromSecretKey } from "@dokwa/keys";
import { openLightning } from "../src/node.ts";
import { openLightningStore, type LightningStore } from "../src/store.ts";

const wasm = new Uint8Array(
  readFileSync(
    new URL(
      "../node_modules/lightningdevkit/liblightningjs.wasm",
      import.meta.url,
    ),
  ),
);
await initializeWasmFromBinary(wasm);

const SEED = new Uint8Array(32).fill(21);
const OTHER_SEED = new Uint8Array(32).fill(22);

function memoryStore(): LightningStore {
  const state = new Map<string, Uint8Array>();
  return {
    async readState(key) {
      return state.get(key) ?? null;
    },
    async writeStates(entries) {
      for (const [key, bytes] of entries) state.set(key, bytes);
    },
    async listKeys(prefix) {
      return [...state.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

describe("the node's keys", () => {
  it("one seed, one node; another seed, another node", async () => {
    const a = await openLightning({ seed: SEED, wasm, store: memoryStore() });
    const b = await openLightning({ seed: SEED, wasm, store: memoryStore() });
    const other = await openLightning({
      seed: OTHER_SEED,
      wasm,
      store: memoryStore(),
    });
    expect(a.nodeId).toBe(b.nodeId);
    expect(other.nodeId).not.toBe(a.nodeId);
    expect(a.nodeId).toMatch(/^[0-9a-f]{66}$/);
  });

  it("the id is the compressed public key of the secret LDK derived from the seed", async () => {
    const node = await openLightning({
      seed: SEED,
      wasm,
      store: memoryStore(),
    });
    // the same derivation the node did, checked through the curve helper
    const keys = ldk.KeysManager.constructor_new(SEED, 1764500000n, 0, true);
    expect(node.nodeId).toBe(pubkeyFromSecretKey(keys.get_node_secret_key()));
  });
});

describe("persistence and the reload", () => {
  it("a fresh node persists its state, and the reloaded node reproduces it byte for byte", async () => {
    const store = memoryStore();
    const node = await openLightning({ seed: SEED, wasm, store });
    expect(node.channels()).toBe(0);
    await node.persist();
    const written = await store.readState("channel_manager");
    expect(written).not.toBeNull();
    expect(written!.length).toBeGreaterThan(0);

    // the reload: a new node over the same store reads what was written
    const reloaded = await openLightning({ seed: SEED, wasm, store });
    expect(reloaded.nodeId).toBe(node.nodeId);
    expect(reloaded.channels()).toBe(0);
    await reloaded.persist();
    const rewritten = await store.readState("channel_manager");
    expect(Buffer.compare(Buffer.from(written!), Buffer.from(rewritten!))).toBe(
      0,
    );
  });

  it("the store that survives is the real one: two databases over one name", async () => {
    const db = "dokwa:lightning:rig";
    const first = openLightningStore(db);
    const node = await openLightning({ seed: SEED, wasm, store: first });
    await node.persist();
    const onDisk = await first.readState("channel_manager");
    first.close();

    // a second page over the same database, as a reload is
    const second = openLightningStore(db);
    const backAgain = await second.readState("channel_manager");
    expect(Buffer.compare(Buffer.from(onDisk!), Buffer.from(backAgain!))).toBe(
      0,
    );
    const reloaded = await openLightning({ seed: SEED, wasm, store: second });
    expect(reloaded.nodeId).toBe(node.nodeId);
    await reloaded.persist();
    const rewritten = await second.readState("channel_manager");
    expect(Buffer.compare(Buffer.from(onDisk!), Buffer.from(rewritten!))).toBe(
      0,
    );
    second.close();
  });

  it("corrupt state is refused out loud, never silently rebuilt", async () => {
    const store = memoryStore();
    const node = await openLightning({ seed: SEED, wasm, store });
    await node.persist();
    // a truncated manager state, which cannot decode
    const written = (await store.readState("channel_manager"))!;
    const corrupted = written.slice(0, Math.floor(written.length / 2));
    const broken: LightningStore = {
      ...store,
      readState: async (key) =>
        key === "channel_manager" ? corrupted : store.readState(key),
    };
    await expect(
      openLightning({ seed: SEED, wasm, store: broken }),
    ).rejects.toThrow(/does not decode/);
  });

  it("a network graph that does not decode falls back to genesis, out loud", async () => {
    const store = memoryStore();
    const node = await openLightning({ seed: SEED, wasm, store });
    await node.persist();
    await store.writeStates([["netgraph", new Uint8Array([9, 9, 9])]]);
    const reloaded = await openLightning({ seed: SEED, wasm, store });
    // the node still opens: the graph is gossip, the manager is the money
    expect(reloaded.channels()).toBe(0);
  });
});
