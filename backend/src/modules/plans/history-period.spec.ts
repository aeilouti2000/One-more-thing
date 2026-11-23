import { describe, expect, it } from "@jest/globals";
import { DEFAULT_HISTORY_MONTHS, historyChange, historyPeriodOf } from "./history-period";

const DAY = 86_400_000;
const now = new Date("2026-11-24T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
const home = (historyMonths: number, before: number | null = null, changedAt: Date | null = null) => ({
  historyMonths,
  historyMonthsBefore: before,
  historyMonthsChangedAt: changedAt,
});

describe("historyPeriodOf", () => {
  it("keeps the default 3 months with nothing waiting", () => {
    expect(historyPeriodOf(home(DEFAULT_HISTORY_MONTHS), 12, now)).toEqual({
      chosen: 3,
      months: 3,
      pending: null,
      options: [3, 6, 12],
    });
  });

  it("keeps the longer period in force for 30 days after shortening, then applies the choice", () => {
    const shortened = home(3, 12, daysAgo(10));
    expect(historyPeriodOf(shortened, 12, now)).toEqual({
      chosen: 3,
      months: 12,
      pending: { months: 3, from: new Date(daysAgo(10).getTime() + 30 * DAY) },
      options: [3, 6, 12],
    });
    const due = home(3, 12, daysAgo(30));
    expect(historyPeriodOf(due, 12, now)).toMatchObject({ chosen: 3, months: 3, pending: null });
  });

  it("applies a longer period at once (no waiting when before is shorter)", () => {
    expect(historyPeriodOf(home(12, 3, daysAgo(1)), 12, now)).toMatchObject({ months: 12, pending: null });
    expect(historyPeriodOf(home(6), 12, now)).toMatchObject({ chosen: 6, months: 6, pending: null });
  });

  it("caps the choice at the plan's limit", () => {
    expect(historyPeriodOf(home(12), 6, now)).toEqual({ chosen: 6, months: 6, pending: null, options: [3, 6] });
  });

  it("caps the waiting period at the plan's limit too", () => {
    expect(historyPeriodOf(home(3, 12, daysAgo(5)), 6, now)).toMatchObject({
      chosen: 3,
      months: 6,
      pending: { months: 3 },
    });
    // Before capped down to the choice: nothing is waiting any more.
    expect(historyPeriodOf(home(3, 12, daysAgo(5)), 3, now)).toMatchObject({ months: 3, pending: null });
  });

  it("offers only the periods the plan allows, or the plan's own length below them", () => {
    expect(historyPeriodOf(home(3), 12, now).options).toEqual([3, 6, 12]);
    expect(historyPeriodOf(home(3), 8, now).options).toEqual([3, 6]);
    expect(historyPeriodOf(home(3), 2, now)).toMatchObject({ chosen: 2, months: 2, options: [2] });
  });
});

describe("historyChange", () => {
  it("changes nothing for the value already chosen", () => {
    expect(historyChange(home(3), 12, 3, now)).toBeNull();
    expect(historyChange(home(3, 12, daysAgo(2)), 12, 3, now)).toBeNull();
  });

  it("shortening keeps the period in force as before, from now", () => {
    expect(historyChange(home(12), 12, 3, now)).toEqual({
      historyMonths: 3,
      historyMonthsBefore: 12,
      historyMonthsChangedAt: now,
    });
  });

  it("going back during the notice clears it", () => {
    expect(historyChange(home(3, 12, daysAgo(2)), 12, 12, now)).toEqual({
      historyMonths: 12,
      historyMonthsBefore: null,
      historyMonthsChangedAt: null,
    });
  });

  it("lengthening applies at once", () => {
    expect(historyChange(home(3), 12, 6, now)).toEqual({
      historyMonths: 6,
      historyMonthsBefore: null,
      historyMonthsChangedAt: null,
    });
  });
});
