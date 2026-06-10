"use client";

import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";

import {
  businessDaysBetween,
  formatRange,
  nextBusinessDay,
  validateRange,
  type DateRangeIssue,
} from "@/domain/dateRange";

import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FormField } from "../ui/FormField";

export interface RequestFormLocation {
  readonly id: string;
  readonly name: string;
}

export interface RequestFormValues {
  readonly locationId: string;
  readonly startDate: string;
  readonly endDate: string;
  /** Derived business-day count — what the hold will be. */
  readonly days: number;
}

interface RequestFormProps {
  readonly locations: readonly RequestFormLocation[];
  readonly isSubmitting: boolean;
  readonly onSubmit: (values: RequestFormValues) => void;
}

const ISSUE_MESSAGES: Readonly<Record<DateRangeIssue, string>> = {
  end_before_start: "The end date is before the start date.",
  starts_in_past: "The start date is in the past.",
  no_business_days: "Only weekend days selected — nothing to request.",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Date-range request form. Validates shape only (a coherent future range) —
 * whether the balance allows it is HCM's call. The summary line narrates the
 * derived hold ("3 business days") BEFORE submitting, so the user is never
 * surprised by how many days a range costs.
 */
export function RequestForm({
  locations,
  isSubmitting,
  onSubmit,
}: RequestFormProps): ReactElement {
  // Locations hydrate asynchronously (they come from the corpus), so the
  // default is DERIVED on render; state only stores an explicit user choice.
  const [chosenLocationId, setChosenLocationId] = useState<string | undefined>(
    undefined,
  );
  const locationId = chosenLocationId ?? locations[0]?.id ?? "";

  const defaultStart = useMemo(() => nextBusinessDay(todayIso()), []);
  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(defaultStart);

  const issue = validateRange({ startDate, endDate }, todayIso());
  const days = businessDaysBetween(startDate, endDate);

  const handleLocationChange = useCallback(
    (event: FormEvent<HTMLSelectElement>) => {
      setChosenLocationId(event.currentTarget.value);
    },
    [],
  );

  const handleStartChange = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      setStartDate(event.currentTarget.value);
    },
    [],
  );

  const handleEndChange = useCallback((event: FormEvent<HTMLInputElement>) => {
    setEndDate(event.currentTarget.value);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLElement>) => {
      event.preventDefault();
      if (
        locationId === "" ||
        validateRange({ startDate, endDate }, todayIso()) !== undefined
      ) {
        return;
      }
      onSubmit({
        locationId,
        startDate,
        endDate,
        days: businessDaysBetween(startDate, endDate),
      });
    },
    [locationId, startDate, endDate, onSubmit],
  );

  return (
    <Card as="form" onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label="Location" htmlFor="rf-location">
          <select
            id="rf-location"
            value={locationId}
            onChange={handleLocationChange}
            className="rounded-md border border-gray-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Start date" htmlFor="rf-start">
          <input
            id="rf-start"
            type="date"
            min={defaultStart}
            value={startDate}
            onChange={handleStartChange}
            className="rounded-md border border-gray-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
          />
        </FormField>

        <FormField label="End date" htmlFor="rf-end">
          <input
            id="rf-end"
            type="date"
            min={startDate}
            value={endDate}
            onChange={handleEndChange}
            className="rounded-md border border-gray-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
          />
        </FormField>

        <Button
          variant="primary"
          type="submit"
          disabled={isSubmitting || issue !== undefined}
        >
          {isSubmitting ? "Submitting…" : "Request time off"}
        </Button>
      </div>

      {issue !== undefined ? (
        <p
          role="alert"
          className="text-xs font-medium text-amber-700 dark:text-amber-400"
        >
          {ISSUE_MESSAGES[issue]}
        </p>
      ) : (
        <p className="text-xs text-gray-600 dark:text-zinc-300">
          <span className="font-semibold">
            {days} business day{days === 1 ? "" : "s"}
          </span>{" "}
          off · {formatRange({ startDate, endDate })}
        </p>
      )}
    </Card>
  );
}
