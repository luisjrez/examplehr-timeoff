import type {
  BalanceCell,
  HcmRequestRecord,
  HcmRequestStatus,
} from "@/domain/types";

import {
  parseBalanceCell,
  parseCorpus,
  parseRequestList,
  parseRequestRecord,
} from "./parsers";

/**
 * Typed HTTP client for the HCM endpoints. Pure request/response translation:
 * no caching, no retries, no state — those live in TanStack Query and the
 * flows. Every outcome is a value (`ApiResult`), never a thrown exception:
 * HCM failure modes are domain events, not control flow (TRD §6.5).
 */

export type ApiError =
  | "version_conflict"
  | "insufficient_balance"
  | "invalid_dimensions"
  | "not_found"
  | "not_pending"
  | "hcm_unavailable"
  | "malformed_response";

export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiError };

/**
 * Chaos accepted by the mock HCM via the x-chaos header. Exposed through the
 * data layer on purpose: tests and the demo ChaosPicker inject failure modes
 * through the same code path real requests take.
 */
export type ChaosInjection =
  | "silent-failure"
  | "wrong-success"
  | "conflict"
  | "error"
  | `latency:${number}`;

export interface FileRequestPayload {
  readonly employeeId: string;
  readonly locationId: string;
  readonly days: number;
  readonly expectedVersion: number;
}

const KNOWN_ERRORS: ReadonlySet<string> = new Set([
  "version_conflict",
  "insufficient_balance",
  "invalid_dimensions",
  "not_found",
  "not_pending",
]);

function baseUrl(): string {
  // jsdom and the browser both provide an origin; bare Node (if it ever
  // happens) falls back to localhost so URL construction cannot throw.
  return typeof window !== "undefined" ? window.location.origin : "http://localhost";
}

async function call<T>(
  path: string,
  init: RequestInit,
  parse: (body: unknown) => T | undefined,
  chaos?: ChaosInjection,
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (chaos !== undefined) {
    headers.set("x-chaos", chaos);
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, baseUrl()), { ...init, headers });
  } catch {
    return { ok: false, error: "hcm_unavailable" };
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const code =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : undefined;
    if (code !== undefined && KNOWN_ERRORS.has(code)) {
      return { ok: false, error: code as ApiError };
    }
    return { ok: false, error: "hcm_unavailable" };
  }

  const parsed = parse(body);
  if (parsed === undefined) {
    return { ok: false, error: "malformed_response" };
  }
  return { ok: true, value: parsed };
}

export const hcmApi = {
  getCell(
    employeeId: string,
    locationId: string,
  ): Promise<ApiResult<BalanceCell>> {
    return call(
      `/api/hcm/balance/${employeeId}/${locationId}`,
      { method: "GET" },
      parseBalanceCell,
    );
  },

  getCorpus(): Promise<ApiResult<readonly BalanceCell[]>> {
    return call("/api/hcm/corpus", { method: "GET" }, parseCorpus);
  },

  fileRequest(
    payload: FileRequestPayload,
    chaos?: ChaosInjection,
  ): Promise<ApiResult<HcmRequestRecord>> {
    return call(
      "/api/hcm/requests",
      { method: "POST", body: JSON.stringify(payload) },
      parseRequestRecord,
      chaos,
    );
  },

  getRequest(id: string): Promise<ApiResult<HcmRequestRecord>> {
    return call(`/api/hcm/requests/${id}`, { method: "GET" }, parseRequestRecord);
  },

  listRequests(
    status?: HcmRequestStatus,
  ): Promise<ApiResult<readonly HcmRequestRecord[]>> {
    const query = status === undefined ? "" : `?status=${status}`;
    return call(`/api/hcm/requests${query}`, { method: "GET" }, parseRequestList);
  },

  decideRequest(
    id: string,
    decision: "approve" | "deny",
    expectedCellVersion: number,
  ): Promise<ApiResult<HcmRequestRecord>> {
    return call(
      `/api/hcm/requests/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ decision, expectedCellVersion }),
      },
      parseRequestRecord,
    );
  },

  triggerAnniversary(
    employeeId: string,
  ): Promise<ApiResult<readonly BalanceCell[]>> {
    return call(
      "/api/hcm/triggers/anniversary",
      { method: "POST", body: JSON.stringify({ employeeId }) },
      (body) => {
        if (typeof body !== "object" || body === null || !("affected" in body)) {
          return undefined;
        }
        const affected = (body as { affected: unknown }).affected;
        if (!Array.isArray(affected)) {
          return undefined;
        }
        const cells = affected.map(parseBalanceCell);
        return cells.every((c): c is BalanceCell => c !== undefined)
          ? cells
          : undefined;
      },
    );
  },
} as const;
