/**
 * The live-leg preflight. A public explorer that answers 429 or 5xx is not
 * an unknown, it is an observation: the code's loud refusal is the correct
 * behaviour under it, so the test asserts that instead of failing on a third
 * party's window. Only a preflight that cannot answer at all is a skip, and
 * the reason carries the URL and the error.
 */
export async function endpointStatus(url: string): Promise<number> {
  try {
    const response = await fetch(`${url}/blocks/tip/height`, {
      signal: AbortSignal.timeout(15_000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

/** True only for a named network failure, never for a code failure. */
export function isEndpointFailure(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /could not reach|429|fetch failed|timeout|unreachable|too many requests/i.test(
    text,
  );
}

/** True when the endpoint is refusing work right now. */
export function refusing(status: number): boolean {
  return status === 429 || status >= 500;
}
