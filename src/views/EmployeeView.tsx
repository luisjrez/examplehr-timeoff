"use client";

import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { BalanceCell } from "@/domain/types";
import {
  useBalanceCell,
  useCorpusReconciliation,
  useDecisionSync,
  useLedgerRehydration,
  useLedgerRequests,
  useRealtimeHcm,
  useRequestRecovery,
  useSubmitRequest,
  useTriggerAnniversary,
} from "@/data/hooks";
import type { ChaosInjection } from "@/data/hcmApi";
import { queryKeys } from "@/data/queryKeys";
import { EMPLOYEE_DIRECTORY, LOCATION_DIRECTORY } from "@/mocks/hcmStore";
import {
  BalanceCellCard,
  BalanceCellSkeleton,
} from "@/components/BalanceCellCard";
import {
  RequestForm,
  RequestFormSkeleton,
  type RequestFormValues,
} from "@/components/RequestForm";
import { RequestTimeline } from "@/components/RequestTimeline";
import { ReconciliationToaster } from "@/components/ReconciliationToaster";
import { SyncModeBadge } from "@/components/SyncModeBadge";
import { Button } from "@/components/ui/Button";
import { MutedText } from "@/components/ui/MutedText";
import { ViewSection } from "@/components/ui/ViewSection";

const CURRENT_EMPLOYEE = "emp-alice";

/** Demo chaos options surfaced in the UI so failure modes are demonstrable. */
const CHAOS_OPTIONS: ReadonlyArray<{
  readonly value: ChaosInjection | "";
  readonly label: string;
}> = [
  { value: "", label: "HCM behaves" },
  { value: "silent-failure", label: "Silent failure (200, nothing stored)" },
  { value: "wrong-success", label: "Wrong success (200, hold not applied)" },
  { value: "conflict", label: "Version conflict (409)" },
  { value: "error", label: "Hard error (500)" },
  { value: "latency:2000", label: "Slow HCM (2s latency)" },
];

interface BalanceSectionProps {
  readonly employeeId: string;
  readonly locationId: string;
}

function BalanceSection({
  employeeId,
  locationId,
}: BalanceSectionProps): ReactElement {
  const { isLoading, ...view } = useBalanceCell(employeeId, locationId);
  return (
    <BalanceCellCard
      locationName={LOCATION_DIRECTORY[locationId] ?? locationId}
      view={view}
      isLoading={isLoading}
    />
  );
}

/**
 * Employee container (TRD §8): wires data hooks to presentational components.
 * Owns no balance math — that lives in the projection.
 */
export function EmployeeView(): ReactElement {
  const { hydrated } = useCorpusReconciliation();
  const { live } = useRealtimeHcm();
  useDecisionSync();
  useLedgerRehydration();
  const queryClient = useQueryClient();
  const { submit, isSubmitting } = useSubmitRequest();
  const { retry, discard } = useRequestRecovery();
  const { trigger, isTriggering } = useTriggerAnniversary();
  const requests = useLedgerRequests(CURRENT_EMPLOYEE);
  const [chaos, setChaos] = useState<ChaosInjection | "">("");

  // The employee's locations come from the hydrated corpus (cells are the
  // source of which rows exist — per-employee, per-location).
  const corpus = queryClient.getQueryData<readonly BalanceCell[]>(
    queryKeys.corpus,
  );
  const locationIds = useMemo(
    () =>
      (corpus ?? [])
        .filter((cell) => cell.employeeId === CURRENT_EMPLOYEE)
        .map((cell) => cell.locationId),
    [corpus],
  );

  const formLocations = useMemo(
    () =>
      locationIds.map((id) => ({
        id,
        name: LOCATION_DIRECTORY[id] ?? id,
      })),
    [locationIds],
  );

  const handleSubmit = useCallback(
    (values: RequestFormValues) => {
      submit({
        employeeId: CURRENT_EMPLOYEE,
        locationId: values.locationId,
        startDate: values.startDate,
        endDate: values.endDate,
        ...(chaos === "" ? {} : { chaos }),
      });
    },
    [submit, chaos],
  );

  const handleChaosChange = useCallback(
    (event: FormEvent<HTMLSelectElement>) => {
      setChaos(event.currentTarget.value as ChaosInjection | "");
    },
    [],
  );

  const handleAnniversary = useCallback(() => {
    trigger(CURRENT_EMPLOYEE);
  }, [trigger]);

  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [requests],
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My time off</h1>
          <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-300">
            {EMPLOYEE_DIRECTORY[CURRENT_EMPLOYEE]}
            {/* Disclose the freshness mode: SSE push vs periodic-sync fallback. */}
            <SyncModeBadge live={live} />
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-zinc-600 p-2 text-xs">
          <span className="text-gray-500 dark:text-zinc-400">Simulate:</span>
          <label htmlFor="ev-chaos" className="sr-only">
            HCM chaos mode
          </label>
          <select
            id="ev-chaos"
            value={chaos}
            onChange={handleChaosChange}
            className="rounded border border-gray-300 dark:border-zinc-600 px-1 py-0.5"
          >
            {CHAOS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="2xs"
            onClick={handleAnniversary}
            disabled={isTriggering}
          >
            🎉 Anniversary bonus
          </Button>
        </div>
      </header>

      <ViewSection ariaLabel="Balances">
        {!hydrated && locationIds.length === 0 ? (
          <div
            role="status"
            aria-label="Loading balances"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <span className="sr-only">Loading balances from HCM…</span>
            <BalanceCellSkeleton />
            <BalanceCellSkeleton />
          </div>
        ) : locationIds.length === 0 ? (
          <MutedText>No balances found for this employee.</MutedText>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {locationIds.map((locationId) => (
              <BalanceSection
                key={locationId}
                employeeId={CURRENT_EMPLOYEE}
                locationId={locationId}
              />
            ))}
          </div>
        )}
      </ViewSection>

      <ViewSection
        ariaLabel="New request"
        title="Request time off"
        className="flex flex-col gap-2"
      >
        {!hydrated && formLocations.length === 0 ? (
          // A form without location options is not actionable — skeleton
          // until the corpus hydrates (an empty corpus shows the message).
          <RequestFormSkeleton />
        ) : formLocations.length === 0 ? (
          <MutedText>No locations available to request against.</MutedText>
        ) : (
          <RequestForm
            locations={formLocations}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
          />
        )}
      </ViewSection>

      <ViewSection
        ariaLabel="My requests"
        title="My requests"
        className="flex flex-col gap-2"
      >
        {sortedRequests.length === 0 ? (
          <MutedText>Nothing requested this session.</MutedText>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedRequests.map((request) => (
              <RequestTimeline
                key={request.id}
                request={request}
                locationName={
                  LOCATION_DIRECTORY[request.locationId] ?? request.locationId
                }
                onRetry={retry}
                onDiscard={discard}
              />
            ))}
          </ul>
        )}
      </ViewSection>

      <ReconciliationToaster />
    </main>
  );
}
