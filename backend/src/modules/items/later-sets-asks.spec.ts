import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { noticeCopy, shopAskCopy, wantedItems } from "../notifications/services/notifications.service";
import { SET_ITEM_LIMIT } from "./entities/item-set.entity";
import { ItemsService } from "./services/items.service";
import { cleanItems, SetsService } from "./services/sets.service";
import { ShopAsksService } from "./services/shop-asks.service";

type Row = Record<string, unknown> & { id: string };

const members = [
  { id: "u1", name: "Ahmad Work", role: "owner" },
  { id: "u2", name: "Sara", role: "partner" },
  { id: "u3", name: "Qusai", role: "partner" },
];

describe("Later shelf", () => {
  const itemsRepo = {
    findNeededByIds: jest.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, homeId: "h1", status: "needed" })),
    ),
    setLater: jest.fn(async (..._args: unknown[]) => 1),
    releaseDueLater: jest.fn(async () => [
      { id: "i1", homeId: "h1", listId: "l1", name: "Air fryer" },
      { id: "i2", homeId: "h1", listId: "l1", name: "Blanket" },
    ]),
  };
  const itemRows = {
    find: jest.fn(async ({ where }: { where: { id: { value: string[] } } }) =>
      where.id.value.map((id) => ({ id, homeId: "h1" })),
    ),
  };
  const homes = { requireMembership: jest.fn(async () => ({ homeId: "h1" })) };
  const notifications = { notifyLaterBack: jest.fn() };
  const trips = { attachNewPurchases: jest.fn(async () => undefined), refreshTimes: jest.fn(async () => undefined) };
  const products = {
    recordPurchases: jest.fn(async () => undefined),
    purchaseUndone: jest.fn(async () => undefined),
    priceChanged: jest.fn(async () => undefined),
  };
  const service = new ItemsService(
    itemsRepo as never,
    {} as never,
    homes as never,
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
    itemRows as never,
    trips as never,
    products as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parks items until a day, or with no day at all", async () => {
    const until = new Date(Date.now() + 3 * 24 * 60 * 60_000);
    await service.setManyLater("u1", ["i1", "i2"], until);
    expect(itemsRepo.setLater).toHaveBeenCalledWith(["i1", "i2"], "h1", expect.any(Date), until);
    await service.setManyLater("u1", ["i1"], null);
    expect(itemsRepo.setLater).toHaveBeenLastCalledWith(["i1"], "h1", expect.any(Date), null);
  });

  it("refuses a day in the past or more than a year away", async () => {
    await expect(
      service.setManyLater("u1", ["i1"], new Date(Date.now() - 1000)),
    ).rejects.toMatchObject({ response: { code: "INVALID_LATER_DATE" } });
    await expect(
      service.setManyLater("u1", ["i1"], new Date(Date.now() + 400 * 24 * 60 * 60_000)),
    ).rejects.toMatchObject({ response: { code: "INVALID_LATER_DATE" } });
    expect(itemsRepo.setLater).not.toHaveBeenCalled();
  });

  it("brings items back by hand", async () => {
    await service.clearManyLater("u1", ["i1"]);
    expect(itemsRepo.setLater).toHaveBeenCalledWith(["i1"], "h1", null, null);
  });

  it("tells the home about each item that returned by itself", async () => {
    await expect(service.releaseDueLater()).resolves.toBe(2);
    expect(notifications.notifyLaterBack).toHaveBeenCalledTimes(2);
    expect(notifications.notifyLaterBack).toHaveBeenCalledWith({
      homeId: "h1",
      itemName: "Air fryer",
      listId: "l1",
    });
  });
});

describe("Sets", () => {
  let needed: Row[];
  let inserted: Row[];
  const set = {
    id: "s1",
    homeId: "h1",
    name: "BBQ",
    items: [
      { name: "Chicken", quantity: 2, unit: "kg", category: "meat" },
      { name: "Charcoal", quantity: 1, unit: null, category: "gone-category" },
      { name: "Pita", quantity: 2, unit: "pack", category: "supermarket" },
      { name: "Onions", quantity: 1, unit: "kg", category: "vegetables" },
    ],
  };
  const setsRepo = {
    findOne: jest.fn(async () => set),
    count: jest.fn(async () => 0),
    create: jest.fn((input: Row) => input),
    save: jest.fn(async (input: Row) => ({ ...input, id: "s9", createdAt: new Date() })),
    // The per-list lock: runs the block with a manager that only takes the lock.
    manager: {
      transaction: jest.fn(async (run: (manager: unknown) => Promise<unknown>) =>
        run({ query: lockQuery }),
      ),
    },
  };
  const lockQuery = jest.fn(async (..._args: unknown[]) => undefined);
  const itemsRepo = {
    findNeeded: jest.fn(async () => needed),
    setLater: jest.fn(async (..._args: unknown[]) => 1),
    insertMany: jest.fn(async (rows: Record<string, unknown>[]) => {
      inserted = rows.map((row, index) => ({ id: `n${index}`, ...row }));
      return inserted;
    }),
    placeNeededMany: jest.fn(async (..._args: unknown[]) => undefined),
  };
  const lists = {
    findActiveById: jest.fn(async (id: string) => ({ id })),
    findFirstActive: jest.fn(async () => ({ id: "l1" })),
  };
  const homes = { requireMembership: jest.fn(async () => ({ homeId: "h1" })) };
  const items = {
    withNames: jest.fn(async (rows: Row[]) => rows.map((row) => ({ ...row, addedByName: "Ahmad" }))),
  };
  const categories = {
    usableResolver: jest.fn(async () => (wanted: string) =>
      wanted === "gone-category" ? "other" : wanted,
    ),
  };
  const notifications = { notifyItemAdded: jest.fn() };
  const service = new SetsService(
    setsRepo as never,
    itemsRepo as never,
    lists as never,
    homes as never,
    items as never,
    categories as never,
    notifications as never,
  );

  beforeEach(() => {
    needed = [];
    inserted = [];
    jest.clearAllMocks();
  });

  it("adds what is missing, skips what is needed, and restores what is parked", async () => {
    needed = [
      { id: "i1", name: "chicken ", listId: "l1", laterAt: null },
      { id: "i2", name: "PITA", listId: "l1", laterAt: new Date() },
      // The same name on another list doesn't count.
      { id: "i3", name: "Onions", listId: "l2", laterAt: null },
    ];
    const result = await service.addToList("u1", "s1", "l1");
    expect(result.skipped).toBe(1);
    expect(result.restored).toEqual(["i2"]);
    expect(itemsRepo.setLater).toHaveBeenCalledWith(["i2"], "h1", null, null);
    expect(inserted.map((row) => [row.name, row.category])).toEqual([
      ["Charcoal", "other"],
      ["Onions", "vegetables"],
    ]);
    // One look at the categories, under the list's lock.
    expect(categories.usableResolver).toHaveBeenCalledTimes(1);
    expect(lockQuery).toHaveBeenCalledWith(expect.any(String), ["set-add:l1"]);
    // One ordering pass for the whole set, and one queued notice per item.
    expect(itemsRepo.placeNeededMany).toHaveBeenCalledTimes(1);
    expect(itemsRepo.placeNeededMany).toHaveBeenCalledWith("h1", ["n0", "n1"], "l1");
    expect(notifications.notifyItemAdded).toHaveBeenCalledTimes(2);
  });

  it("treats null in an update as not sent", async () => {
    await expect(service.update("u1", "s1", { name: null, items: null })).resolves.toMatchObject({
      name: "BBQ",
    });
  });

  it("keeps a home to 20 sets", async () => {
    setsRepo.count.mockResolvedValueOnce(20);
    await expect(
      service.create("u1", "h1", { name: "One more", items: set.items }),
    ).rejects.toMatchObject({ response: { code: "SET_LIMIT" } });
  });

  it("cleans a set's items: trims, drops repeats, enforces the size", () => {
    expect(
      cleanItems([
        { name: " Milk ", quantity: 1, unit: " ", category: "supermarket" },
        { name: "milk", quantity: 3, unit: "L", category: "supermarket" },
      ]),
    ).toEqual([{ name: "Milk", quantity: 1, unit: null, category: "supermarket" }]);
    const many = Array.from({ length: SET_ITEM_LIMIT + 1 }, (_, index) => ({
      name: `Item ${index}`,
      quantity: 1,
      category: "other",
    }));
    expect(() => cleanItems(many)).toThrow();
    expect(() => cleanItems([{ name: "  ", quantity: 1, category: "other" }])).toThrow();
  });
});

describe("Anything missing?", () => {
  let rows: Row[];
  let home: { tripAskHome: boolean; members: typeof members };
  const asksRepo = {
    delete: jest.fn(async () => undefined),
    // By id, or the newest one (rows are kept newest first).
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      where.id ? (rows.find((row) => row.id === where.id) ?? null) : (rows[0] ?? null),
    ),
    manager: {
      transaction: jest.fn(async (run: (manager: unknown) => Promise<unknown>) =>
        run({ query: jest.fn(async () => undefined) }),
      ),
    },
    create: jest.fn((input: Row) => input),
    save: jest.fn(async (input: Row) => {
      const row = { createdAt: new Date(), ...input, id: `a${rows.length + 1}` } as Row;
      rows.unshift(row);
      return row;
    }),
    query: jest.fn(async (..._args: unknown[]) => undefined),
  };
  const itemsRepo = {
    countAddedSince: jest.fn(async () => [{ userId: "u3", count: 2 }]),
    findLatestByName: jest.fn(async () => ({ name: "Lemons", category: "vegetables", unit: "kg" })),
    findNeeded: jest.fn(async () => needed),
    setLater: jest.fn(async (..._args: unknown[]) => 1),
  };
  let needed: Row[] = [];
  const lists = { findActiveById: jest.fn(async (id: string) => ({ id })) };
  const homes = {
    getOne: jest.fn(async () => home),
    requireMembership: jest.fn(async () => ({ homeId: "h1" })),
  };
  const items = {
    add: jest.fn(async (_user: string, _home: string, input: Record<string, unknown>) => input),
    view: jest.fn(async (_user: string, id: string) => ({ id })),
  };
  const categories = { usableOr: jest.fn(async (_home: string, wanted: string) => wanted) };
  const notifications = { notifyShopAsk: jest.fn(), notifyItemAdded: jest.fn() };
  const service = new ShopAsksService(
    asksRepo as never,
    itemsRepo as never,
    lists as never,
    homes as never,
    items as never,
    categories as never,
    notifications as never,
  );

  beforeEach(() => {
    rows = [];
    needed = [];
    home = { tripAskHome: true, members };
    jest.clearAllMocks();
  });

  it("asks everyone else once, and a second tap reuses the open question", async () => {
    const first = await service.ask("u1", "h1", "l1");
    expect(first.mine).toBe(true);
    expect(first.replies.map((reply) => [reply.name, reply.reply, reply.added])).toEqual([
      ["Sara", null, 0],
      ["Qusai", null, 2],
    ]);
    expect(notifications.notifyShopAsk).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "u1", actorName: "Ahmad", askId: first.id }),
    );
    const again = await service.ask("u1", "h1", "l1");
    expect(again.id).toBe(first.id);
    expect(notifications.notifyShopAsk).toHaveBeenCalledTimes(1);
  });

  it("asked again soon after ending: opens a new question without a second push", async () => {
    // Ended two minutes ago, so still inside the ten-minute cooldown.
    rows = [
      {
        id: "a0",
        homeId: "h1",
        listId: "l1",
        askedBy: "u1",
        replies: {},
        createdAt: new Date(Date.now() - 2 * 60_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    ];
    const next = await service.ask("u1", "h1", "l1");
    expect(next.id).not.toBe("a0");
    expect(notifications.notifyShopAsk).not.toHaveBeenCalled();
  });

  it("asked again long after the last one: notifies the home", async () => {
    rows = [
      {
        id: "a0",
        homeId: "h1",
        listId: "l1",
        askedBy: "u1",
        replies: {},
        createdAt: new Date(Date.now() - 40 * 60_000),
        expiresAt: new Date(Date.now() - 10 * 60_000),
      },
    ];
    await service.ask("u1", "h1", "l1");
    expect(notifications.notifyShopAsk).toHaveBeenCalledTimes(1);
  });

  it("is refused when the home turned it off or has one member", async () => {
    home = { tripAskHome: false, members };
    await expect(service.ask("u1", "h1", "l1")).rejects.toMatchObject({
      response: { code: "SHOP_ASK_OFF" },
    });
    home = { tripAskHome: true, members: members.slice(0, 1) };
    await expect(service.ask("u1", "h1", "l1")).rejects.toMatchObject({
      response: { code: "SHOP_ASK_ALONE" },
    });
  });

  it("records an answer for the person who gave it, never for the asker", async () => {
    rows = [
      {
        id: "a1",
        homeId: "h1",
        listId: "l1",
        askedBy: "u1",
        replies: {},
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ];
    const view = await service.reply("u2", "a1", "nothing");
    expect(view.myReply).toBe("nothing");
    expect(asksRepo.query).toHaveBeenCalledWith(expect.any(String), ["a1", "u2", "nothing"]);
    await expect(service.reply("u1", "a1", "nothing")).rejects.toMatchObject({
      response: { code: "SHOP_ASK_OWN" },
    });
  });

  it("refuses answers once the question has ended", async () => {
    rows = [
      {
        id: "a1",
        homeId: "h1",
        listId: "l1",
        askedBy: "u1",
        replies: {},
        createdAt: new Date(Date.now() - 3_600_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    ];
    await expect(service.reply("u2", "a1", "nothing")).rejects.toMatchObject({
      response: { code: "SHOP_ASK_ENDED" },
    });
  });

  it("adds a typed item to the asked list with its remembered category and unit", async () => {
    rows = [
      {
        id: "a1",
        homeId: "h1",
        listId: "l1",
        askedBy: "u1",
        replies: {},
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ];
    await service.addItem("u2", "a1", " lemons ");
    expect(items.add).toHaveBeenCalledWith("u2", "h1", {
      name: "Lemons",
      quantity: 1,
      unit: "kg",
      category: "vegetables",
      listId: "l1",
    });
  });

  it("doesn't double an item that is already on the list, and un-parks a Later one", async () => {
    rows = [
      {
        id: "a1",
        homeId: "h1",
        listId: "l1",
        askedBy: "u1",
        replies: {},
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ];
    needed = [
      { id: "i1", name: "Milk", listId: "l1", laterAt: null },
      { id: "i2", name: "Rice", listId: "l1", laterAt: new Date() },
    ];
    await service.addItem("u2", "a1", "milk");
    await service.addItem("u2", "a1", "RICE");
    expect(items.add).not.toHaveBeenCalled();
    expect(itemsRepo.setLater).toHaveBeenCalledTimes(1);
    expect(itemsRepo.setLater).toHaveBeenCalledWith(["i2"], "h1", null, null);
    // The shopper hears about the one that came back, not the one already there.
    expect(notifications.notifyItemAdded).toHaveBeenCalledTimes(1);
    expect(notifications.notifyItemAdded).toHaveBeenCalledWith(
      expect.objectContaining({ itemName: "Rice", actorName: "Sara" }),
    );
  });
});

describe("notification wording and choices", () => {
  it("words a returning Later item in both languages", () => {
    expect(noticeCopy("en", "later", "", [{ name: "Air fryer", urgent: false }])).toEqual({
      title: "Back on the list",
      body: "Air fryer is back from Later",
    });
    expect(noticeCopy("ar", "later", "", [{ name: "قلاية", urgent: false }]).body).toContain("قلاية");
  });

  it("words the shop question, with or without a name", () => {
    expect(shopAskCopy("en", "Ahmad").title).toBe("Ahmad is at the shop");
    expect(shopAskCopy("en", " ").title).toBe("Someone is at the shop");
    expect(shopAskCopy("ar", "أحمد").title).toContain("أحمد");
  });

  it("respects the Later switch", () => {
    const items = [{ urgent: false }];
    expect(wantedItems({ later: false }, "later", items)).toEqual([]);
    expect(wantedItems({}, "later", items)).toEqual(items);
    // Turning Later off leaves pinned items alone.
    expect(wantedItems({ later: false }, "due", items)).toEqual(items);
  });
});
