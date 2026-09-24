import { advanceDue, undoDeadline } from "./shopping";

describe("shopping helpers", () => {
  it("keeps a bought item undoable for two minutes", () => {
    const boughtAt = new Date("2026-09-24T12:00:00.000Z");
    expect(undoDeadline(boughtAt, boughtAt.getTime() + 60_000)).toBe(true);
    expect(undoDeadline(boughtAt, boughtAt.getTime() + 2 * 60 * 1000)).toBe(false);
  });

  it("moves the next due date forward by whole intervals", () => {
    const from = new Date("2026-09-01T08:00:00.000Z");
    const now = new Date("2026-09-20T08:00:00.000Z");
    expect(advanceDue(from, 7, now).toISOString()).toBe("2026-09-22T08:00:00.000Z");
  });
});
