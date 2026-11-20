/**
 * What this device is for. The choice is made once on first run and can be
 * changed later; it is a preference, not a second copy of the device's keys.
 * The seeds live in `seed.ts` and survive a mode change untouched.
 */

export type Mode = "till" | "wallet";

const MODE_KEY = "dokwa:mode";
const VENUE_KEY = "dokwa:venue:name";

export function loadMode(): Mode | null {
  const stored = globalThis.localStorage.getItem(MODE_KEY);
  return stored === "till" || stored === "wallet" ? stored : null;
}

export function saveMode(mode: Mode): void {
  globalThis.localStorage.setItem(MODE_KEY, mode);
}

export function loadVenueName(): string {
  return globalThis.localStorage.getItem(VENUE_KEY) ?? "";
}

export function saveVenueName(name: string): void {
  globalThis.localStorage.setItem(VENUE_KEY, name);
}
