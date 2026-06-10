import type { HcmRequestStatus } from "@/domain/types";

/**
 * Single source of query-key truth (TRD §6.2). Invalidation bugs are
 * spelling bugs — centralizing the keys removes the spelling.
 */
export const queryKeys = {
  corpus: ["corpus"] as const,
  cell: (employeeId: string, locationId: string) =>
    ["cell", employeeId, locationId] as const,
  requestsRoot: ["requests"] as const,
  requests: (status: HcmRequestStatus) => ["requests", status] as const,
} as const;
