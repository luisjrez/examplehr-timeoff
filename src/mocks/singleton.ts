import { createHcmStore, type HcmStore } from "./hcmStore";

/**
 * Process-wide HCM store for the Next.js route handlers.
 *
 * Stored on `globalThis` because Next.js may evaluate a module once per
 * compiled chunk in dev — a plain module variable would give each route its
 * own universe. On serverless (Vercel) the store lives per warm instance and
 * resets on cold start; acceptable for a demo and documented in TRD §11.
 */
const GLOBAL_KEY = Symbol.for("examplehr.hcmStore");

interface GlobalWithStore {
  [GLOBAL_KEY]?: HcmStore;
}

export function getHcmStore(): HcmStore {
  const holder = globalThis as GlobalWithStore;
  holder[GLOBAL_KEY] ??= createHcmStore();
  return holder[GLOBAL_KEY];
}
