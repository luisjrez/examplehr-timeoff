import type {
  BalanceCell,
  HcmRequestRecord,
  HcmRequestStatus,
} from "@/domain/types";

/**
 * Wire parsing for the data layer: every HCM payload arrives as `unknown`
 * and only becomes a domain type after structural validation. A mistyped
 * payload must fail loudly here, not become a silent wrong balance on screen.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHcmStatus(value: unknown): value is HcmRequestStatus {
  return value === "pending" || value === "approved" || value === "denied";
}

export function parseBalanceCell(value: unknown): BalanceCell | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { employeeId, locationId, days, version, updatedAt } = value;
  if (
    typeof employeeId !== "string" ||
    typeof locationId !== "string" ||
    typeof days !== "number" ||
    typeof version !== "number" ||
    typeof updatedAt !== "string"
  ) {
    return undefined;
  }
  return { employeeId, locationId, days, version, updatedAt };
}

export function parseCorpus(
  value: unknown,
): readonly BalanceCell[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.cells)) {
    return undefined;
  }
  const cells = value.cells.map(parseBalanceCell);
  return cells.every((c): c is BalanceCell => c !== undefined)
    ? cells
    : undefined;
}

export function parseRequestRecord(
  value: unknown,
): HcmRequestRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { id, employeeId, locationId, days, status, filedAt, decidedAt } =
    value;
  if (
    typeof id !== "string" ||
    typeof employeeId !== "string" ||
    typeof locationId !== "string" ||
    typeof days !== "number" ||
    !isHcmStatus(status) ||
    typeof filedAt !== "string"
  ) {
    return undefined;
  }
  const base = { id, employeeId, locationId, days, status, filedAt };
  return typeof decidedAt === "string" ? { ...base, decidedAt } : base;
}

export function parseRequestList(
  value: unknown,
): readonly HcmRequestRecord[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.requests)) {
    return undefined;
  }
  const requests = value.requests.map(parseRequestRecord);
  return requests.every((r): r is HcmRequestRecord => r !== undefined)
    ? requests
    : undefined;
}
