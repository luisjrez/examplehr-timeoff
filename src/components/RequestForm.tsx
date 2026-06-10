"use client";

import {
  useCallback,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";

export interface RequestFormLocation {
  readonly id: string;
  readonly name: string;
}

export interface RequestFormValues {
  readonly locationId: string;
  readonly days: number;
}

interface RequestFormProps {
  readonly locations: readonly RequestFormLocation[];
  readonly isSubmitting: boolean;
  readonly onSubmit: (values: RequestFormValues) => void;
}

/**
 * Pure form: validates shape only (positive whole days). Whether the balance
 * actually allows it is HCM's call — pre-validating against a possibly stale
 * projection would just fake authority the frontend does not have.
 */
export function RequestForm({
  locations,
  isSubmitting,
  onSubmit,
}: RequestFormProps): ReactElement {
  // Locations hydrate asynchronously (they come from the corpus), so the
  // default is DERIVED on render; state only stores an explicit user choice.
  // Initializing state from locations[0] would freeze the pre-hydration "".
  const [chosenLocationId, setChosenLocationId] = useState<string | undefined>(
    undefined,
  );
  const locationId = chosenLocationId ?? locations[0]?.id ?? "";
  const [daysText, setDaysText] = useState<string>("1");

  const handleLocationChange = useCallback(
    (event: FormEvent<HTMLSelectElement>) => {
      setChosenLocationId(event.currentTarget.value);
    },
    [],
  );

  const handleDaysChange = useCallback((event: FormEvent<HTMLInputElement>) => {
    setDaysText(event.currentTarget.value);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const days = Number(daysText);
      if (!Number.isInteger(days) || days <= 0 || locationId === "") {
        return;
      }
      onSubmit({ locationId, days });
    },
    [daysText, locationId, onSubmit],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 dark:border-zinc-700 p-4"
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="rf-location"
          className="text-xs text-gray-600 dark:text-zinc-300"
        >
          Location
        </label>
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
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="rf-days"
          className="text-xs text-gray-600 dark:text-zinc-300"
        >
          Days
        </label>
        <input
          id="rf-days"
          type="number"
          min={1}
          step={1}
          value={daysText}
          onChange={handleDaysChange}
          className="w-20 rounded-md border border-gray-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Submitting…" : "Request time off"}
      </button>
    </form>
  );
}
