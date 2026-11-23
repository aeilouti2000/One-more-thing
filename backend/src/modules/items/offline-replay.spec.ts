import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ItemsService } from "./services/items.service";

type Row = Record<string, unknown> & { id: string; homeId: string };

/**
 * A phone that was offline sends its saved changes later, and may send one
 * twice (the first answer never arrived). Nothing may be doubled or lost.
 */
describe("Changes sent again after being offline", () => {
  let rows: Row[];
  let lists: { id: string; homeId: string; name: string; deletedAt: Date | null }[];

  const idsOf = (where: { id: unknown }) => {
    const id = where.id as string | { value: string[] };
    return typeof id === "string" ? [id] : id.value;
  };
  const itemsRepo = {
    insert: jest.fn(async (input: Record<string, unknown>) => {
      const row = { id: `made-${rows.length + 1}`, ...input } as Row;
      rows.push(row);
      return row;
    }),
    placeNeeded: jest.fn(async () => undefined),
    findInHome: jest.fn(
      async (id: string, homeId: string) =>
        rows.find((row) => row.id === id && row.homeId === homeId) ?? null,
    ),
    patch: jest.fn(async (id: string, homeId: string, changes: Record<string, unknown>) => {
      const row = rows.find((entry) => entry.id === id && entry.homeId === homeId);
      if (row) Object.assign(row, changes);
      return row ? 1 : 0;
    }),
    deleteInHome: jest.fn(async (ids: string[], homeId: string) => {
      rows = rows.filter((row) => !(ids.includes(row.id) && row.homeId === homeId));
    }),
    findUserNames: jest.fn(async () => [{ id: "u1", name: "Ahmad" }]),
    findUserName: jest.fn(async () => "Ahmad"),
  };
  const listsRepo = {
    findActiveById: jest.fn(async (id: string) => lists.find((list) => list.id === id) ?? null),
    findFirstActive: jest.fn(async () => lists[0]),
    findByIds: jest.fn(async (ids: string[]) => lists.filter((list) => ids.includes(list.id))),
    insert: jest.fn(async (homeId: string, name: string, id?: string) => {
      const list = { id: id ?? `list-${lists.length + 1}`, homeId, name, deletedAt: null };
      lists.push(list);
      return list;
    }),
  };
  const homes = { requireMembership: jest.fn(async () => ({ homeId: "h1" })) };
  const notifications = { notifyItemAdded: jest.fn(), notifyItemUrgent: jest.fn() };
  const categories = { assertUsable: jest.fn(async () => undefined) };
  const receipts = { find: jest.fn(async () => []) };
  const itemRows = {
    findOne: jest.fn(
      async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null,
    ),
    find: jest.fn(async ({ where }: { where: { id: unknown; receiptId?: unknown } }) =>
      // No item in these tests is on an invoice.
      where.receiptId ? [] : rows.filter((row) => idsOf(where).includes(row.id)),
    ),
  };
  const service = new ItemsService(
    itemsRepo as never,
    listsRepo as never,
    homes as never,
    notifications as never,
    {} as never,
    categories as never,
    receipts as never,
    itemRows as never,
  );

  const milk = { id: "11111111-1111-4111-8111-111111111111", name: "Milk", quantity: 2, category: "dairy" };

  beforeEach(() => {
    rows = [];
    lists = [{ id: "list-a", homeId: "h1", name: "Groceries", deletedAt: null }];
    jest.clearAllMocks();
  });

  it("saves an item under the id the phone made", async () => {
    const view = await service.add("u1", "h1", milk);
    expect(view).toMatchObject({ id: milk.id, name: "Milk", quantity: 2 });
    expect(rows).toHaveLength(1);
  });

  it("gives back the first item when the same add is sent twice", async () => {
    await service.add("u1", "h1", milk);
    const again = await service.add("u1", "h1", milk);
    expect(again).toMatchObject({ id: milk.id, name: "Milk" });
    expect(rows).toHaveLength(1);
    // The home is told about a new item once, not once per send.
    expect(notifications.notifyItemAdded).toHaveBeenCalledTimes(1);
  });

  it("refuses an id that belongs to an item in another home", async () => {
    rows.push({ id: milk.id, homeId: "h2", listId: "x", name: "Theirs", status: "needed" });
    await expect(service.add("u1", "h1", milk)).rejects.toMatchObject({
      response: { code: "ID_TAKEN" },
    });
    expect(rows).toHaveLength(1);
  });

  it("still makes its own id when the phone sends none", async () => {
    const view = await service.add("u1", "h1", { name: "Eggs", quantity: 1, category: "dairy" });
    expect(view.id).toBe("made-1");
  });

  it("changes only the fields that were sent", async () => {
    rows.push({
      id: "eggs",
      homeId: "h1",
      listId: "list-a",
      name: "Eggs",
      quantity: 6,
      category: "dairy",
      notes: "free range",
      status: "needed",
      urgent: true,
      addedBy: "u1",
    });
    const view = await service.updateDetails("u1", "eggs", { quantity: 12 });
    expect(view).toMatchObject({ name: "Eggs", quantity: 12, notes: "free range", urgent: true });
    expect(itemsRepo.patch).toHaveBeenCalledWith("eggs", "h1", { quantity: 12 });
  });

  it("deletes what is still there when some items are already gone", async () => {
    rows.push({ id: "a", homeId: "h1", status: "needed" }, { id: "b", homeId: "h1", status: "needed" });
    await expect(service.removeMany("u1", ["a", "gone"])).resolves.toEqual({ deleted: 1 });
    expect(rows.map((row) => row.id)).toEqual(["b"]);
  });

  it("answers a delete sent twice without an error", async () => {
    await expect(service.removeMany("u1", ["gone"])).resolves.toEqual({ deleted: 0 });
    expect(itemsRepo.deleteInHome).not.toHaveBeenCalled();
  });

  it("gives back the first list when the same create is sent twice", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const first = await service.createList("u1", "h1", "Pharmacy", id);
    const again = await service.createList("u1", "h1", "Pharmacy", id);
    expect(first).toEqual({ id, homeId: "h1", name: "Pharmacy" });
    expect(again).toEqual(first);
    expect(lists.filter((list) => list.id === id)).toHaveLength(1);
  });
});
