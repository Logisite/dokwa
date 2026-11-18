/**
 * Role-scoped storage. The rule the whole test story rests on:
 *
 *   the till and a wallet must be able to live on one origin at once.
 *
 * Origin is per scheme + host + port, so two tabs of one profile share one
 * IndexedDB. Naming by role is what lets a till and a wallet coexist there,
 * and what lets a live test run two sessions without two machines.
 *
 *   dokwa:till             the venue
 *   dokwa:wallet:<id>      one person
 */

export type Role = "till" | { wallet: string };

export const TILL_DB = "dokwa:till";

export function dbName(role: Role): string {
  return role === "till" ? TILL_DB : `dokwa:wallet:${role.wallet}`;
}

export function lockName(role: Role): string {
  return `dokwa:lock:${dbName(role)}`;
}

/**
 * One writer, by role. Not a protocol built on BroadcastChannel: the platform
 * already ships exclusion, and it survives tabs that never talk to each other.
 *
 * Two till tabs cannot both hold this. A till and a wallet never contend.
 */
export function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return Promise.reject(
      new Error(
        "dokwa: Web Locks is unavailable; refusing to share a database",
      ),
    );
  }
  // the DOM lib's generic and ours collide; the runtime contract is exact
  return navigator.locks.request(name, { mode: "exclusive" }, () =>
    fn(),
  ) as Promise<T>;
}

export function withRoleLock<T>(role: Role, fn: () => Promise<T>): Promise<T> {
  return withLock(lockName(role), fn);
}

/**
 * Ask the browser not to evict this origin's storage. A refusal is not an
 * error — it is a warning the interface has to show, because losing the
 * till's ledger loses every token it ever signed.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist)
    return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}
