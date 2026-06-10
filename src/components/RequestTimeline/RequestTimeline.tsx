"use client";

import { useCallback, type ReactElement } from "react";

import type { RequestPhase, TimeOffRequest } from "@/domain/types";

import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Chip } from "../ui/Chip";

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
  progress: "text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/40",
  ok: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/40",
  bad: "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/40",
  warn: "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/40",
  muted: "text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800/70",
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
    <Card as="li" rounded="lg" padding="3" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">
          {request.days} day(s) · {locationName}
        </span>
        <Chip className={TONE_STYLES[presentation.tone]}>
          {presentation.label}
        </Chip>
      </div>
      {presentation.detail ? (
        <p className="text-xs text-gray-600 dark:text-zinc-300">
          {presentation.detail}
        </p>
      ) : null}
      {request.phase.status === "contradicted" ? (
        <div className="flex gap-2">
          <Button variant="primary" size="xs" onClick={handleRetry}>
            Retry with fresh balance
          </Button>
          <Button variant="ghost" size="xs" onClick={handleDiscard}>
            Discard
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
