/**
 * The live signal probe against the real signet endpoint.
 *
 * Explicit test:live, not the default suite: a public explorer is allowed to
 * be slow or to refuse, and that is the world, not the code.
 */

import { describe, expect, it } from "vitest";
import { httpProbe, DEFAULT_PROBE_URL } from "../src/signal.ts";

/**
 * What the endpoint answers right now, asked directly. A number is an HTTP
 * status; an Error means the preflight could not answer at all. The probe is
 * then held to that observation instead of to an assumption about the world.
 */
async function preflight(
  url: string,
  timeoutMs = 8_000,
): Promise<number | Error> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.status;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

describe("the probe, against the real network", () => {
  it("the default probe never reports signal for a refusing endpoint", async (ctx) => {
    // The dangerous direction is optimism: a probe that says true while the
    // endpoint refuses. That direction fails hard. The safe direction, a slow
    // endpoint that answers one plain fetch but not the probe inside the same
    // cap, is the world and is named as a skip.
    const status = await preflight(DEFAULT_PROBE_URL, 5_000);
    if (status instanceof Error) {
      ctx.skip(
        `preflight could not reach ${DEFAULT_PROBE_URL}: ${status.message}`,
      );
      return;
    }
    const probe = httpProbe(DEFAULT_PROBE_URL, 5_000);
    const answered = await probe();
    const endpointAccepted = status >= 200 && status < 400;
    console.log(
      `[signal] preflight ${status} from ${DEFAULT_PROBE_URL}; probe answered ${answered}`,
    );
    if (answered && !endpointAccepted) {
      throw new Error(
        `the probe reported signal for ${DEFAULT_PROBE_URL} while it answered ${status}`,
      );
    }
    if (!answered && endpointAccepted) {
      ctx.skip(
        `preflight ${status} from ${DEFAULT_PROBE_URL} but the probe found no answer inside the same 5s cap; the endpoint is slow, not lying`,
      );
      return;
    }
    expect(answered).toBe(endpointAccepted);
  }, 30_000);
});
