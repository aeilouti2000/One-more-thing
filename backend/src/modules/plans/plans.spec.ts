import { describe, expect, it } from "@jest/globals";
import { PLANS, planOf } from "./plans";

describe("planOf", () => {
  it("gives every current home the early plan with 12 months of history", () => {
    expect(planOf({ plan: "early", planUntil: null })).toEqual({ id: "early", until: null, limits: PLANS.early });
    expect(planOf({}).limits.historyMonths).toBe(12);
  });

  it("falls back to the default plan when the plan is unknown or has ended", () => {
    expect(planOf({ plan: "gold" }).id).toBe("early");
    const ended = planOf({ plan: "early", planUntil: new Date("2026-01-01") }, new Date("2026-02-01"));
    expect(ended).toMatchObject({ id: "early", until: null });
  });
});
