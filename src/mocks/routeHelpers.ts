import type { ChaosMode, HcmErrorCode } from "./hcmStore";
import { getHcmStore } from "./singleton";
import { CHAOS_HEADER, parseChaosHeader, type ChaosDirective } from "./wire";

/**
 * Shared plumbing for the mock HCM route handlers, so each route file stays a
 * thin translation layer over hcmStore (the logic the unit tests guard).
 */

const DEMO_SILENT_FAILURE_RATE = 0.08;
const DEMO_CONFLICT_RATE = 0.05;
const DEMO_ANNIVERSARY_INTERVAL_MS = 120_000;

function isDemoChaosEnabled(): boolean {
  return process.env.HCM_DEMO_CHAOS === "1";
}

/**
 * Tests inject chaos explicitly via the x-chaos header; the deployed demo
 * rolls dice instead so evaluators see the failure modes without curl-fu.
 * Explicit headers always win — determinism beats ambience.
 */
function resolveChaos(request: Request, mutating: boolean): ChaosDirective {
  const explicit = parseChaosHeader(request.headers.get(CHAOS_HEADER));
  if (
    explicit.mode !== undefined ||
    explicit.latencyMs !== undefined ||
    explicit.hardError === true
  ) {
    return explicit;
  }
  if (isDemoChaosEnabled() && mutating) {
    const roll = Math.random();
    if (roll < DEMO_SILENT_FAILURE_RATE) {
      return { mode: "silent-failure" };
    }
    if (roll < DEMO_SILENT_FAILURE_RATE + DEMO_CONFLICT_RATE) {
      return { mode: "conflict" };
    }
  }
  return {};
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Applies transport-level chaos (latency, hard 500) and hands store-level
 * chaos to the handler. Every mock endpoint goes through here.
 */
export async function withChaos(
  request: Request,
  options: { readonly mutating: boolean },
  handler: (chaosMode: ChaosMode | undefined) => Response | Promise<Response>,
): Promise<Response> {
  const chaos = resolveChaos(request, options.mutating);
  if (chaos.latencyMs !== undefined) {
    await sleep(chaos.latencyMs);
  }
  if (chaos.hardError === true) {
    return errorResponse(500, "hcm_unavailable");
  }
  return handler(chaos.mode);
}

export function errorResponse(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
}

export function hcmErrorResponse(error: HcmErrorCode, status: number): Response {
  return errorResponse(status, error);
}

let lastDemoAnniversaryAt = 0;

/**
 * Demo-mode "timer": serverless cannot run real timers, so the bonus fires
 * lazily when the corpus is read and enough wall-clock time has passed
 * (TRD §9). Tests never rely on this — they use the explicit trigger.
 */
export function maybeFireDemoAnniversary(): void {
  if (!isDemoChaosEnabled()) {
    return;
  }
  const nowMs = Date.now();
  if (nowMs - lastDemoAnniversaryAt >= DEMO_ANNIVERSARY_INTERVAL_MS) {
    lastDemoAnniversaryAt = nowMs;
    getHcmStore().triggerAnniversary("emp-alice");
  }
}
