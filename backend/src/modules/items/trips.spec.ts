import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { FindOperator } from "typeorm";
import { ItemsService } from "./services/items.service";
import { ShopLocksService } from "./services/shop-locks.service";

type ItemRow = {
  id: string;
  homeId: string;
  listId: string;
  name: string;
  quantity: number;
  status: "needed" | "bought";
  urgent: boolean;
  addedBy: string;
  boughtBy: string | null;
  boughtAt: Date | null;
  cost: number | null;
  receiptId: string | null;
  notFoundAt: Date | null;
  notFoundBy: string | null;
};

const NAMES: Record<string, string> = { u1: "Ahmad", u2: "Sara" };

describe("Shopping trips: buying safely", () => {
  let rows: ItemRow[];
  const itemsRepo = {
    // A copy, like a real read: both phones can see "needed" at the same time.
    findInHome: jest.fn(async (id: string) => {
      const row = rows.find((entry) => entry.id === id);
      return row ? { ...row } : null;
    }),
    markNeededBought: jest.fn(
      async (id: string, _home: string, userId: string, boughtAt: Date, cost: number | null) => {
        const row = rows.find((entry) => entry.id === id);
        if (!row || row.status !== "needed") return 0;
        Object.assign(row, { status: "bought", boughtBy: userId, boughtAt, cost, notFoundAt: null, notFoundBy: null });
        return 1;
      },
    ),
    setNotFound: jest.fn(async (id: string, _home: string, userId: string | null, at: Date | null) => {
      const row = rows.find((entry) => entry.id === id);
      if (!row || row.status !== "needed") return 0;
      Object.assign(row, { notFoundAt: at, notFoundBy: userId });
      return 1;
    }),
    findUserNames: jest.fn(async (ids: string[]) => ids.map((id) => ({ id, name: NAMES[id] ?? "Member" }))),
  };
  const listsRepo = {
    findByIds: jest.fn(async () => [{ id: "list-a", name: "Weekly" }]),
    findActiveById: jest.fn(async () => ({ id: "list-a" })),
  };
  const homes = { requireMembership: jest.fn(async () => ({ homeId: "h1" })) };
  const receipts = { find: jest.fn(async () => []) };
  // Transactions run their work straight away; the fake manager reads the same rows.
  const manager = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    update: jest.fn(async () => undefined),
    query: jest.fn(async () => []),
  };
  const itemRows = {
    manager: { transaction: jest.fn(async (work: (m: typeof manager) => Promise<unknown>) => work(manager)) },
    // The items' own home: In(ids) arrives as a FindOperator.
    find: jest.fn(async ({ where }: { where: { id: { value: string[] } } }) =>
      rows.filter((entry) => where.id.value.includes(entry.id)).map((entry) => ({ id: entry.id, homeId: "h1" })),
    ),
    findOneOrFail: jest.fn(async ({ where }: { where: { id: string } }) => {
      const row = rows.find((entry) => entry.id === where.id);
      if (!row) throw new Error("missing");
      return { ...row };
    }),
  };
  const trips = { attachNewPurchases: jest.fn(async () => undefined), refreshTimes: jest.fn(async () => undefined) };
  const products = {
    recordPurchases: jest.fn(async () => undefined),
    purchaseUndone: jest.fn(async () => undefined),
    priceChanged: jest.fn(async () => undefined),
  };
  const service = new ItemsService(
    itemsRepo as never,
    listsRepo as never,
    homes as never,
    {} as never,
    {} as never,
    {} as never,
    receipts as never,
    itemRows as never,
    trips as never,
    products as never,
  );

  beforeEach(() => {
    rows = [
      {
        id: "milk",
        homeId: "h1",
        listId: "list-a",
        name: "Milk",
        quantity: 1,
        status: "needed",
        urgent: false,
        addedBy: "u1",
        boughtBy: null,
        boughtAt: null,
        cost: null,
        receiptId: null,
        notFoundAt: null,
        notFoundBy: null,
      },
    ];
    jest.clearAllMocks();
  });

  it("buys an item only once when two people tap it at the same moment", async () => {
    const [first, second] = await Promise.all([
      service.markBought("u1", "milk", 1.2),
      service.markBought("u2", "milk", 1.5),
    ]);
    expect(rows[0]).toMatchObject({ status: "bought", boughtBy: "u1", cost: 1.2 });
    // The late tap is told who really bought it, and its price is not saved.
    expect(first).toMatchObject({ boughtBy: "u1", boughtByName: "Ahmad" });
    expect(second).toMatchObject({ boughtBy: "u1", boughtByName: "Ahmad", cost: 1.2 });
  });

  it("does not let a trip undo an item someone else bought", async () => {
    await service.markBought("u2", "milk");
    await expect(service.undoBought("u1", "milk", { onlyMine: true })).rejects.toMatchObject({
      response: { code: "UNDO_NOT_YOURS" },
    });
    expect(rows[0].status).toBe("bought");
  });

  it("marks an item not found for everyone, and buying it clears the mark", async () => {
    const marked = await service.markNotFound("u2", "milk");
    expect(marked).toMatchObject({ status: "needed", notFoundBy: "u2", notFoundByName: "Sara" });
    expect(marked.notFoundAt).toBeInstanceOf(Date);

    const bought = await service.markBought("u1", "milk");
    expect(bought).toMatchObject({ notFoundAt: null, notFoundBy: null, notFoundByName: null });
  });

  it("refuses to mark a bought item as not found", async () => {
    await service.markBought("u1", "milk");
    await expect(service.markNotFound("u2", "milk")).rejects.toMatchObject({
      response: { code: "ITEM_ALREADY_BOUGHT" },
    });
  });
});

type LockRow = { listId: string; homeId: string; userId: string; startedAt: Date; heartbeatAt: Date };

describe("Shopping trips: shop lock", () => {
  let locks: LockRow[];
  let home: { members: { id: string }[]; tripShopTogether: boolean };
  let queries: string[];

  function matches(row: LockRow, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, value]) => {
      const current = row[key as keyof LockRow];
      if (value instanceof FindOperator) {
        return value.type === "lessThan" && current < (value.value as Date);
      }
      return current === value;
    });
  }

  const manager = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    }),
    delete: jest.fn(async (_entity: unknown, where: Record<string, unknown>) => {
      const before = locks.length;
      locks = locks.filter((row) => !matches(row, where));
      return { affected: before - locks.length };
    }),
    find: jest.fn(async (_entity: unknown, options: { where: Record<string, unknown> }) =>
      locks.filter((row) => matches(row, options.where)).map((row) => ({ ...row })),
    ),
    create: jest.fn((_entity: unknown, input: LockRow) => ({ ...input })),
    save: jest.fn(async (row: LockRow) => {
      const index = locks.findIndex((entry) => entry.listId === row.listId && entry.userId === row.userId);
      if (index >= 0) locks[index] = { ...row };
      else locks.push({ ...row });
      return row;
    }),
  };
  const locksRepo = {
    manager: { transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager)) },
    delete: jest.fn(async (where: Record<string, unknown>) => manager.delete(null, where)),
    find: jest.fn(async (options: { where: Record<string, unknown> }) => manager.find(null, options)),
    findOne: jest.fn(async (options: { where: Record<string, unknown> }) =>
      (await manager.find(null, options))[0] ?? null,
    ),
    save: jest.fn(async (row: LockRow) => manager.save(row)),
  };
  const users = {
    find: jest.fn(async () => Object.entries(NAMES).map(([id, name]) => ({ id, name }))),
  };
  const listsRepo = { findActiveById: jest.fn(async () => ({ id: "list-a" })) };
  const homes = {
    getOne: jest.fn(async () => home),
    requireMembership: jest.fn(async () => ({ homeId: "h1" })),
  };
  const service = new ShopLocksService(
    locksRepo as never,
    users as never,
    listsRepo as never,
    homes as never,
  );
  const clearedNotFound = () => queries.some((sql) => sql.includes("not_found_at = null"));

  beforeEach(() => {
    locks = [];
    queries = [];
    home = { members: [{ id: "u1" }, { id: "u2" }], tripShopTogether: false };
    jest.clearAllMocks();
  });

  it("keeps one shopper per list when shopping together is off", async () => {
    await service.claim("u1", "h1", "list-a", { newTrip: true });
    await expect(service.claim("u2", "h1", "list-a", { newTrip: true })).rejects.toMatchObject({
      response: { code: "LIST_SHOPPING_LOCKED" },
    });
    expect(locks.map((row) => row.userId)).toEqual(["u1"]);
  });

  it("lets two people shop one list when shopping together is on", async () => {
    home.tripShopTogether = true;
    await service.claim("u1", "h1", "list-a", { newTrip: true });
    const second = await service.claim("u2", "h1", "list-a", { newTrip: true });
    expect(second).toMatchObject({ active: true, isMine: true, together: true, shopperName: "Ahmad" });
    expect(second.shoppers.map((shopper) => shopper.id)).toEqual(["u1", "u2"]);

    // Sara sees Ahmad; Ahmad sees Sara.
    const forAhmad = await service.status("u1", "h1", "list-a");
    expect(forAhmad).toMatchObject({ isMine: true, shopperName: "Sara" });

    await service.release("u2", "h1", "list-a");
    expect(locks.map((row) => row.userId)).toEqual(["u1"]);
  });

  it("lets a new shopper take over a list whose shopper stopped answering", async () => {
    const old = new Date(Date.now() - 60_000);
    locks = [{ listId: "list-a", homeId: "h1", userId: "u1", startedAt: old, heartbeatAt: old }];
    const view = await service.claim("u2", "h1", "list-a", { newTrip: true });
    expect(view).toMatchObject({ isMine: true, shoppers: [{ id: "u2", name: "Sara" }] });
  });

  it("clears old not-found marks when a new trip starts", async () => {
    await service.claim("u1", "h1", "list-a", { newTrip: true });
    expect(clearedNotFound()).toBe(true);
  });

  it("keeps not-found marks when the trip is resumed or someone else is shopping", async () => {
    home.tripShopTogether = true;
    await service.claim("u1", "h1", "list-a", { newTrip: false });
    expect(clearedNotFound()).toBe(false);
    await service.claim("u2", "h1", "list-a", { newTrip: true });
    expect(clearedNotFound()).toBe(false);
  });

  it("clears not-found marks in a one-person home without taking a lock", async () => {
    home.members = [{ id: "u1" }];
    const view = await service.claim("u1", "h1", "list-a", { newTrip: true });
    expect(view.active).toBe(false);
    expect(locks).toEqual([]);
    expect(clearedNotFound()).toBe(true);
  });
});
