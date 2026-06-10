import type { ChaosMode, HcmErrorCode } from "./hcmStore";

/**
 * Wire-level contract shared by the Next.js route handlers and the MSW
 * handlers: chaos header grammar, error → HTTP status mapping, and body
 * validation. Bodies arrive as `unknown` and only leave as typed values —
 * never trust the network shape (this repo bans unsafe casts).
 */

export const CHAOS_HEADER = "x-chaos";

export interface ChaosDirective {
  /** Store-level chaos, forwarded into hcmStore calls. */
  readonly mode?: ChaosMode;
  /** Transport-level chaos applied by the HTTP layer. */
  readonly latencyMs?: number;
  readonly hardError?: boolean;
}

export function parseChaosHeader(value: string | null): ChaosDirective {
  switch (value) {
    case "silent-failure":
    case "wrong-success":
    case "conflict":
      return { mode: value };
    case "error":
      return { hardError: true };
    default:
      break;
  }
  if (value?.startsWith("latency:")) {
    const ms = Number(value.slice("latency:".length));
    if (Number.isFinite(ms) && ms >= 0) {
      return { latencyMs: ms };
    }
  }
  // Malformed chaos must never break a request — the header is a test tool.
  return {};
}

export function httpStatusOf(error: HcmErrorCode): number {
  switch (error) {
    case "version_conflict":
    case "not_pending":
      return 409;
    case "insufficient_balance":
    case "invalid_dimensions":
      return 422;
    case "not_found":
      return 404;
  }
}

export interface FileRequestBody {
  readonly employeeId: string;
  readonly locationId: string;
  readonly days: number;
  readonly expectedVersion: number;
}

export interface DecisionBody {
  readonly decision: "approve" | "deny";
  readonly expectedCellVersion: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseFileRequestBody(
  body: unknown,
): FileRequestBody | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const { employeeId, locationId, days, expectedVersion } = body;
  if (
    typeof employeeId !== "string" ||
    typeof locationId !== "string" ||
    typeof days !== "number" ||
    !Number.isInteger(days) ||
    typeof expectedVersion !== "number" ||
    !Number.isInteger(expectedVersion)
  ) {
    return undefined;
  }
  return { employeeId, locationId, days, expectedVersion };
}

export function parseDecisionBody(body: unknown): DecisionBody | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const { decision, expectedCellVersion } = body;
  if (
    (decision !== "approve" && decision !== "deny") ||
    typeof expectedCellVersion !== "number" ||
    !Number.isInteger(expectedCellVersion)
  ) {
    return undefined;
  }
  return { decision, expectedCellVersion };
}
