/**
 * One honest answer about signal.
 *
 * The probe is real here too: the default probe is a real request to the
 * real signet endpoint, and the cut is the real 127.0.0.1:1 where nothing
 * listens. The one place a controllable probe appears is testing the change
 * notification itself, which is the Signal's job, not the network's.
 */

import { describe, expect, it } from "vitest";
import { createSignal, httpProbe, DEFAULT_PROBE_URL } from "../src/signal.ts";

const DEAD_ENDPOINT = "http://127.0.0.1:1";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("the probe, against the real network", () => {
  it("the real signet endpoint answers true while it is reachable", async () => {
    const probe = httpProbe(DEFAULT_PROBE_URL, 5_000);
    expect(await probe()).toBe(true);
  }, 30_000);

  it("an endpoint where nothing listens answers false, every time", async () => {
    const probe = httpProbe(DEAD_ENDPOINT, 3_000);
    expect(await probe()).toBe(false);
    expect(await probe()).toBe(false);
  }, 30_000);

  it("a probe that throws still answers false, never a crash", async () => {
    const probe = httpProbe(DEAD_ENDPOINT, 1_000);
    // A probe implementation that throws is a bug in the probe, and the
    // Signal wraps it: the caller gets false, which is the honest answer.
    const signal = createSignal({
      probe: async () => {
        throw new Error("probe is broken");
      },
    });
    signal.start();
    try {
      expect(await signal.check()).toBe(false);
    } finally {
      signal.stop();
    }
    expect(await probe()).toBe(false);
  }, 30_000);
});

describe("the signal's answer and its change", () => {
  it("says false while the endpoint is dead and says so on subscribe", async () => {
    const signal = createSignal({
      probe: httpProbe(DEAD_ENDPOINT, 2_000),
      intervalMs: 5_000,
    });
    signal.start();
    try {
      const answers: boolean[] = [];
      signal.on((online) => answers.push(online));
      // The first answer arrives on subscribe, without waiting a change.
      expect(answers[0]).toBe(false);
      await sleep(500);
      expect(signal.online()).toBe(false);
      expect(answers.every((a) => a === false)).toBe(true);
    } finally {
      signal.stop();
    }
  }, 30_000);

  it("announces the change exactly once when the endpoint comes back", async () => {
    // The probe here is controllable because the thing under test is the
    // change notification, not the network. The probes above prove the
    // real network answers; this one proves the answer is told exactly once.
    let reachable = false;
    const signal = createSignal({
      probe: async () => reachable,
      intervalMs: 200,
    });
    signal.start();
    try {
      // Subscribe captures the current answer first: that first call is the
      // answer, not a change. Only calls after it are changes.
      let initial = false;
      let haveInitial = false;
      const changes: boolean[] = [];
      signal.on((online) => {
        if (!haveInitial) {
          haveInitial = true;
          initial = online;
          return;
        }
        changes.push(online);
      });
      await sleep(700);
      expect(initial).toBe(false);
      expect(signal.online()).toBe(false);

      reachable = true;
      const flipped = await new Promise<boolean>((resolve, reject) => {
        const started = Date.now();
        const tick = setInterval(() => {
          if (signal.online()) {
            clearInterval(tick);
            resolve(true);
          } else if (Date.now() - started > 5_000) {
            clearInterval(tick);
            reject(new Error("signal never came back"));
          }
        }, 100);
      });
      expect(flipped).toBe(true);
      await sleep(700);
      // One change, not a stream of repeats while the answer stays true.
      expect(changes).toEqual([true]);
      expect(signal.online()).toBe(true);
    } finally {
      signal.stop();
    }
  }, 30_000);

  it("a stopped signal stops probing and keeps its last answer", async () => {
    const reachable = false;
    let probes = 0;
    const signal = createSignal({
      probe: async () => {
        probes += 1;
        return reachable;
      },
      intervalMs: 100,
    });
    signal.start();
    await sleep(450);
    const before = probes;
    expect(before).toBeGreaterThan(1);
    signal.stop();
    await sleep(450);
    expect(probes).toBe(before);
    expect(signal.online()).toBe(false);
  }, 30_000);
});
