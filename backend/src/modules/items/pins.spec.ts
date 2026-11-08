import { nextMonthDay, nextPinDue } from "./utils/shopping";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { PinsService } from "./services/pins.service";

type Row = Record<string, unknown> & { id: string };

describe("PinsService lists", () => {
  let pins: Row[];
  let items: Row[];
  const lists = [
    { id: "list-a", homeId: "h1", deletedAt: null },
    { id: "list-b", homeId: "h1", deletedAt: null },
  ];
  const pinsRepo = {
    countOnList: jest.fn(async (_home: string, listId: string, except?: string) =>
      pins.filter((pin) => pin.listId === listId && pin.id !== except).length,
    ),
    insert: jest.fn(async (input: Record<string, unknown>) => {
      const row = { id: `p${pins.length + 1}`, ...input } as Row;
      pins.push(row);
      return row;
    }),
    findDue: jest.fn(async () => pins),
    claimDue: jest.fn(async () => true),
  };
  const itemsRepo = {
    findNeeded: jest.fn(async () => items),
    insert: jest.fn(async (input: Record<string, unknown>) => {
      const row = { id: `i${items.length + 1}`, ...input } as Row;
      items.push(row);
      return row;
    }),
    placeNeeded: jest.fn(async () => undefined),
  };
  const listsRepo = {
    findFirstActive: jest.fn(async () => lists[0]),
    findActiveById: jest.fn(async (id: string) => lists.find((list) => list.id === id) ?? null),
  };
  const homes = { requireMembership: jest.fn(async () => ({ homeId: "h1" })) };
  const categories = { assertUsable: jest.fn(async () => undefined) };
  const notifications = { notifyPinDue: jest.fn(async () => undefined) };
  const service = new PinsService(
    pinsRepo as never,
    itemsRepo as never,
    listsRepo as never,
    homes as never,
    categories as never,
    notifications as never,
  );
  const input = (name: string, listId?: string) => ({
    name,
    quantity: 1,
    category: "supermarket",
    intervalDays: 7 as const,
    listId,
  });

  beforeEach(() => {
    pins = [];
    items = [];
    jest.clearAllMocks();
  });

  it("allows 15 pins per list, counted separately for each list", async () => {
    for (let index = 0; index < 15; index += 1) {
      await service.add("u1", "h1", input(`a${index}`, "list-a"), async () => null);
    }
    await expect(
      service.add("u1", "h1", input("one more", "list-a"), async () => null),
    ).rejects.toMatchObject({ response: { code: "PIN_LIMIT" } });
    await expect(
      service.add("u1", "h1", input("other list", "list-b"), async () => null),
    ).resolves.toMatchObject({ listId: "list-b" });
  });

  it("adds a due pin to its own list, checking duplicates per list", async () => {
    pins = [
      { id: "p1", name: "Milk", listId: "list-b", intervalDays: 7, nextDueAt: new Date(), quantity: 1 },
      { id: "p2", name: "Bread", listId: null, intervalDays: 7, nextDueAt: new Date(), quantity: 1 },
    ];
    // Milk is already needed, but on the other list.
    items = [{ id: "i0", name: "milk", listId: "list-a" }];
    await service.materializeDue("h1");
    const added = items.slice(1).map((item) => [item.name, item.listId]);
    expect(added).toEqual([
      ["Milk", "list-b"],
      ["Bread", "list-a"],
    ]);
  });
});

describe("nextMonthDay", () => {
  const amman = 180; // UTC+3

  it("added on 7 Oct for day 1 returns on 1 Nov, local morning", () => {
    const due = nextMonthDay(1, amman, new Date("2026-10-07T10:00:00Z"));
    expect(due.toISOString()).toBe("2026-11-01T00:00:00.000Z"); // 03:00 Amman
  });

  it("skips today even when today is the chosen day", () => {
    const due = nextMonthDay(1, amman, new Date("2026-11-01T05:00:00Z"));
    expect(due.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("uses a later day this month when it hasn't passed", () => {
    const due = nextMonthDay(20, 0, new Date("2026-10-07T10:00:00Z"));
    expect(due.toISOString()).toBe("2026-10-20T03:00:00.000Z");
  });

  it("falls back to the last day in short months", () => {
    const due = nextMonthDay(31, 0, new Date("2027-02-10T10:00:00Z"));
    expect(due.toISOString()).toBe("2027-02-28T03:00:00.000Z");
    const after = nextMonthDay(31, 0, new Date("2027-02-28T10:00:00Z"));
    expect(after.toISOString()).toBe("2027-03-31T03:00:00.000Z");
  });

  it("reads the local date, not the UTC one", () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Amman, so day 1 means December.
    const due = nextMonthDay(1, amman, new Date("2026-10-31T23:30:00Z"));
    expect(due.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("nextPinDue keeps the 30-day cycle without a month day", () => {
    const from = new Date("2026-10-07T10:00:00Z");
    const due = nextPinDue({ intervalDays: 30, monthDay: null }, from, from);
    expect(due.toISOString()).toBe("2026-11-06T10:00:00.000Z");
  });
});
