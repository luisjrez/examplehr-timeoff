"use client";

import { useCallback, type ReactElement } from "react";

import type { RequestPhase, TimeOffRequest } from "@/domain/types";

interface RequestTimelineProps {
  readonly request: TimeOffRequest;
  readonly locationName: string;
  readonly onRetry: (clientId: string) => void;
  readonly onDiscard: (clientId: string) => void;
}

interface PhasePresentation {
  readonly label: string;
  readonly detail?: string;
  readonly tone: "progress" | "ok" | "bad" | "warn" | "muted";
}

/**
 * Wording is the contract here: a request is never called "approved" before
 * the manager approves it, and a 2xx is shown as "verifying", not success —
 * the employee persona's guarantee lives in these labels (TRD §5).
 */
function present(phase: RequestPhase): PhasePresentation {
  switch (phase.status) {
    case "draft":
      return { label: "Draft", tone: "muted" };
    case "submitting":
      return { label: "Submitting…", tone: "progress" };
    case "accepted_unverified":
    case "verifying":
      return { label: "Verifying with HCM…", tone: "progress" };
    case "pending_approval":
      return { label: "Awaiting manager approval", tone: "warn" };
    case "approved":
      return { label: "Time off granted", tone: "ok" };
    case "denied":
      return {
        label: "Denied",
        detail:
          phase.reason === "insufficient_balance"
            ? "HCM reports not enough days available."
            : phase.reason === "invalid_dimensions"
              ? "Invalid employee/location combination."
              : "Denied by your manager.",
        tone: "bad",
      };
    case "contradicted":
      return {
        label: "HCM did not apply this request",
        detail:
          phase.reason === "version_conflict"
            ? "The balance changed while filing."
            : phase.reason === "hcm_silent"
              ? "HCM did not answer clearly."
              : "HCM accepted it but its records disagree.",
        tone: "bad",
      };
    case "discarded":
      return { label: "Discarded", tone: "muted" };
  }
}

const TONE_STYLES: Readonly<Record<PhasePresentation["tone"], string>> = {
  progress: "text-blue-700 bg-blue-50",
  ok: "text-emerald-700 bg-emerald-50",
  bad: "text-red-700 bg-red-50",
  warn: "text-amber-700 bg-amber-50",
  muted: "text-gray-500 bg-gray-50",
};

export function RequestTimeline({
  request,
  locationName,
  onRetry,
  onDiscard,
}: RequestTimelineProps): ReactElement {
  const presentation = present(request.phase);

  const handleRetry = useCallback(() => {
    onRetry(request.id);
  }, [onRetry, request.id]);

  const handleDiscard = useCallback(() => {
    onDiscard(request.id);
  }, [onDiscard, request.id]);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">
          {request.days} day(s) · {locationName}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_STYLES[presentation.tone]}`}
        >
          {presentation.label}
        </span>
      </div>
      {presentation.detail ? (
        <p className="text-xs text-gray-600">{presentation.detail}</p>
      ) : null}
      {request.phase.status === "contradicted" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            Retry with fresh balance
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
          >
            Discard
          </button>
        </div>
      ) : null}
    </li>
  );
}
