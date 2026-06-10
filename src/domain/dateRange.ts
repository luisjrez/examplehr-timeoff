/**
 * Business-day math for time-off ranges. Pure and UTC-anchored: a date string
 * (yyyy-mm-dd) means the same day for every user and every test runner,
 * regardless of local timezone.
 */

export interface DateRange {
  /** ISO date (yyyy-mm-dd), inclusive. */
  readonly startDate: string;
  /** ISO date (yyyy-mm-dd), inclusive. */
  readonly endDate: string;
}

export type DateRangeIssue =
  | "end_before_start"
  | "starts_in_past"
  | "no_business_days";

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isWeekend(date: string): boolean {
  const day = new Date(toUtc(date)).getUTCDay();
  return day === 0 || day === 6;
}

/** Inclusive count of Mon–Fri days in the range; 0 for inverted ranges. */
export function businessDaysBetween(
  startDate: string,
  endDate: string,
): number {
  const start = toUtc(startDate);
  const end = toUtc(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0;
  }
  let count = 0;
  for (let ms = start; ms <= end; ms += DAY_MS) {
    if (!isWeekend(toIsoDate(ms))) {
      count += 1;
    }
  }
  return count;
}

/** First issue with the range, in the order a user can fix them. */
export function validateRange(
  range: DateRange,
  today: string,
): DateRangeIssue | undefined {
  if (toUtc(range.endDate) < toUtc(range.startDate)) {
    return "end_before_start";
  }
  if (toUtc(range.startDate) < toUtc(today)) {
    return "starts_in_past";
  }
  if (businessDaysBetween(range.startDate, range.endDate) === 0) {
    return "no_business_days";
  }
  return undefined;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatDay(date: string, withYear: boolean): string {
  const d = new Date(toUtc(date));
  const base = `${MONTHS[d.getUTCMonth()] ?? "?"} ${d.getUTCDate()}`;
  return withYear ? `${base}, ${d.getUTCFullYear()}` : base;
}

/** Deterministic human range: "Jun 10 – Jun 12, 2026" / "Jun 10, 2026". */
export function formatRange(range: DateRange): string {
  if (range.startDate === range.endDate) {
    return formatDay(range.startDate, true);
  }
  const sameYear = range.startDate.slice(0, 4) === range.endDate.slice(0, 4);
  return `${formatDay(range.startDate, !sameYear)} – ${formatDay(range.endDate, true)}`;
}

/** Today if it is a business day, otherwise the next one. */
export function nextBusinessDay(fromDate: string): string {
  let ms = toUtc(fromDate);
  while (isWeekend(toIsoDate(ms))) {
    ms += DAY_MS;
  }
  return toIsoDate(ms);
}

/** The date `count` business days after `fromDate` (count 0 = same/next BD). */
export function addBusinessDays(fromDate: string, count: number): string {
  let current = nextBusinessDay(fromDate);
  for (let i = 0; i < count; i += 1) {
    current = nextBusinessDay(toIsoDate(toUtc(current) + DAY_MS));
  }
  return current;
}
