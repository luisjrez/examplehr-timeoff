import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  addBusinessDays,
  businessDaysBetween,
  formatRange,
  isWeekend,
  nextBusinessDay,
  validateRange,
} from "./dateRange";

// 2026-06-10 is a Wednesday; 2026-06-13/14 are Sat/Sun.
const WED = "2026-06-10";
const FRI = "2026-06-12";
const SAT = "2026-06-13";
const SUN = "2026-06-14";
const MON = "2026-06-15";

describe("dateRange", () => {
  it("should count inclusive business days, skipping weekends", () => {
    expect(businessDaysBetween(WED, WED)).toBe(1);
    expect(businessDaysBetween(WED, FRI)).toBe(3);
    // Wed → next Mon spans a weekend: Wed, Thu, Fri, Mon = 4.
    expect(businessDaysBetween(WED, MON)).toBe(4);
    expect(businessDaysBetween(SAT, SUN)).toBe(0);
  });

  it("should return 0 for inverted ranges", () => {
    expect(businessDaysBetween(FRI, WED)).toBe(0);
  });

  it("should detect weekends in UTC regardless of local timezone", () => {
    expect(isWeekend(SAT)).toBe(true);
    expect(isWeekend(SUN)).toBe(true);
    expect(isWeekend(MON)).toBe(false);
  });

  it("should validate ranges with the user's actual mistakes in mind", () => {
    expect(validateRange({ startDate: FRI, endDate: WED }, WED)).toBe(
      "end_before_start",
    );
    expect(validateRange({ startDate: "2026-06-09", endDate: FRI }, WED)).toBe(
      "starts_in_past",
    );
    expect(validateRange({ startDate: SAT, endDate: SUN }, WED)).toBe(
      "no_business_days",
    );
    expect(
      validateRange({ startDate: WED, endDate: FRI }, WED),
    ).toBeUndefined();
  });

  it("should format ranges deterministically (en-US, UTC)", () => {
    expect(formatRange({ startDate: WED, endDate: FRI })).toBe(
      "Jun 10 – Jun 12, 2026",
    );
    expect(formatRange({ startDate: WED, endDate: WED })).toBe("Jun 10, 2026");
    expect(
      formatRange({ startDate: "2026-12-30", endDate: "2027-01-02" }),
    ).toBe("Dec 30, 2026 – Jan 2, 2027");
  });

  it("should find the next business day (today counts when it is one)", () => {
    expect(nextBusinessDay(WED)).toBe(WED);
    expect(nextBusinessDay(SAT)).toBe(MON);
    expect(nextBusinessDay(SUN)).toBe(MON);
  });

  it("should add business days skipping weekends", () => {
    expect(addBusinessDays(WED, 0)).toBe(WED);
    expect(addBusinessDays(WED, 2)).toBe(FRI);
    expect(addBusinessDays(WED, 3)).toBe(MON); // skips the weekend
    expect(businessDaysBetween(WED, addBusinessDays(WED, 4))).toBe(5);
  });

  it("property: count is never negative and weekends never contribute", () => {
    const day = fc
      .integer({ min: 0, max: 364 })
      .map((offset) =>
        new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10),
      );
    fc.assert(
      fc.property(day, day, (a, b) => {
        const count = businessDaysBetween(a, b);
        expect(count).toBeGreaterThanOrEqual(0);
        if (a <= b && isWeekend(a) && isWeekend(b) && a === b) {
          expect(count).toBe(0);
        }
        // Inclusive upper bound: never more than calendar days.
        if (a <= b) {
          const calendar =
            (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
              86_400_000 +
            1;
          expect(count).toBeLessThanOrEqual(calendar);
        }
      }),
    );
  });
});
