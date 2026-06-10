import { addBusinessDays, nextBusinessDay } from "../src/domain/dateRange";

/**
 * Range fixtures anchored to the real clock: the form forbids past dates,
 * so specs generate future business-day ranges with the domain's own math.
 */
export const START = nextBusinessDay(new Date().toISOString().slice(0, 10));

export function endFor(businessDays: number): string {
  return addBusinessDays(START, businessDays - 1);
}
