import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NotificationsService, noticeCopy } from "./services/notifications.service";

const one = (name: string, urgent = false) => [{ name, urgent }];

describe("noticeCopy", () => {
  it("describes a single change", () => {
    expect(noticeCopy("en", "added", "Alex", one("Milk"))).toEqual({
      title: "New item",
      body: "Alex added Milk",
    });
    expect(noticeCopy("en", "urgent", "Alex", one("Milk", true))).toEqual({
      title: "Urgent item",
      body: "Alex marked Milk urgent",
    });
    expect(noticeCopy("ar", "added", "أحمد", one("حليب", true)).title).toBe("عنصر عاجل");
    expect(noticeCopy("en", "due", "", one("Milk"))).toEqual({
      title: "Back on the list",
      body: "Milk is due",
    });
    expect(noticeCopy("ar", "due", "", one("حليب"))).toEqual({
      title: "عاد إلى القائمة",
      body: "حان موعد حليب",
    });
  });

  it("groups several changes into one message", () => {
    const items = ["Milk", "Eggs", "Bread", "Rice", "Tea"].map((name) => ({ name, urgent: false }));
    expect(noticeCopy("en", "added", "Alex", items)).toEqual({
      title: "New items",
      body: "Alex added 5 items: Milk, Eggs, Bread and 2 more",
    });
    expect(noticeCopy("en", "urgent", "Alex", items.slice(0, 2)).body).toBe(
      "Alex marked 2 items urgent: Milk, Eggs",
    );
    expect(noticeCopy("en", "due", "", items.slice(0, 3)).body).toBe("3 items are due: Milk, Eggs, Bread");
    expect(noticeCopy("ar", "added", "أحمد", items.slice(0, 2)).body).toBe("أحمد أضاف عنصرين: Milk، Eggs");
  });
});

describe("NotificationsService", () => {
  const repo = {
    findByToken: jest.fn<(token: string) => Promise<unknown>>(),
    save: jest.fn<(token: unknown) => Promise<unknown>>(),
    insert: jest.fn<(input: unknown) => Promise<void>>(),
    deleteForUser: jest.fn<(userId: string, token: string) => Promise<void>>(),
    findRecipients: jest.fn<(homeId: string, actorId?: string) => Promise<{ token: string; locale: string }[]>>(),
    deleteTokens: jest.fn<(tokens: string[]) => Promise<void>>(),
  };
  const fetchMock = jest.fn<typeof fetch>();
  let service: NotificationsService;

  const ok = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
  const sentMessages = (call = 0) =>
    JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body)) as {
      to: string;
      body: string;
      data: { listId: string | null; count: number };
    }[];

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
    service = new NotificationsService(repo as never);
    repo.findRecipients.mockResolvedValue([
      { token: "ExponentPushToken[a]", locale: "en" },
      { token: "ExponentPushToken[b]", locale: "ar" },
    ]);
    fetchMock.mockResolvedValue(ok({ data: [{ status: "ok", id: "t1" }, { status: "ok", id: "t2" }] }));
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it("does not block the caller and groups quick changes by the same person", async () => {
    const result = service.notifyItemAdded({
      homeId: "h1",
      actorId: "u1",
      actorName: "Alex",
      itemName: "Milk",
      urgent: false,
      listId: "l1",
    });
    expect(result).toBeUndefined();
    service.notifyItemAdded({ homeId: "h1", actorId: "u1", actorName: "Alex", itemName: "Eggs", urgent: false, listId: "l1" });
    expect(fetchMock).not.toHaveBeenCalled();

    await service.flushPending();

    expect(repo.findRecipients).toHaveBeenCalledWith("h1", "u1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const messages = sentMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].body).toBe("Alex added 2 items: Milk, Eggs");
    expect(messages[0].data).toMatchObject({ listId: "l1", count: 2 });
  });

  it("keeps different people and kinds apart", async () => {
    service.notifyItemAdded({ homeId: "h1", actorId: "u1", actorName: "Alex", itemName: "Milk", urgent: false });
    service.notifyItemAdded({ homeId: "h1", actorId: "u2", actorName: "Sam", itemName: "Eggs", urgent: false });
    service.notifyItemUrgent({ homeId: "h1", actorId: "u1", actorName: "Alex", itemName: "Tea" });

    await service.flushPending();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("drops tokens Expo reports as unregistered, in tickets and in receipts", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        data: [
          { status: "error", details: { error: "DeviceNotRegistered" } },
          { status: "ok", id: "t2" },
        ],
      }),
    );
    service.notifyPinDue({ homeId: "h1", itemName: "Milk" });
    await service.flushPending();
    expect(repo.findRecipients).toHaveBeenCalledWith("h1", undefined);
    expect(repo.deleteTokens).toHaveBeenCalledWith(["ExponentPushToken[a]"]);

    fetchMock.mockResolvedValueOnce(
      ok({ data: { t2: { status: "error", details: { error: "DeviceNotRegistered" } } } }),
    );
    await service.checkReceipts([{ id: "t2", token: "ExponentPushToken[b]" }]);
    expect(repo.deleteTokens).toHaveBeenLastCalledWith(["ExponentPushToken[b]"]);
  });

  it("survives a failing push service", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    service.notifyItemUrgent({ homeId: "h1", actorId: "u1", actorName: "Alex", itemName: "Tea" });
    await expect(service.flushPending()).resolves.toBeUndefined();
  });

  it("removes the old token when the phone's token rotates", async () => {
    repo.findByToken.mockResolvedValue(null);
    await service.register("u1", "ExponentPushToken[new]", "en", "ExponentPushToken[old]");
    expect(repo.deleteForUser).toHaveBeenCalledWith("u1", "ExponentPushToken[old]");
    expect(repo.insert).toHaveBeenCalledWith({ userId: "u1", token: "ExponentPushToken[new]", locale: "en" });
  });
});
