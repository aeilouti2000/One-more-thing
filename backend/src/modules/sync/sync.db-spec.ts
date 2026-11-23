import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { startTestApi, type TestApi } from "../../database/testing/test-api";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api?.close();
});

async function newHome(name = "Owner") {
  const person = await api.signUp(name);
  const home = await api.call("POST", "/homes", { token: person.token, body: { name: `${name}'s home` } });
  expect(home.status).toBe(201);
  return { ...person, homeId: home.body.id as string };
}

async function addItem(token: string, homeId: string, name: string) {
  const response = await api.call("POST", `/homes/${homeId}/items`, {
    token,
    body: { name, quantity: 1, category: "supermarket" },
  });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

const changes = (token: string, homeId: string, since?: number, headers?: Record<string, string>) =>
  api.call("GET", `/homes/${homeId}/changes${since === undefined ? "" : `?since=${since}`}`, { token, headers });

describe("GET /homes/:homeId/changes", () => {
  it("sends a full copy first, then only what changed, then nothing", async () => {
    const { token, homeId } = await newHome();
    const milk = await addItem(token, homeId, "Milk");

    const first = await changes(token, homeId);
    expect(first.status).toBe(200);
    expect(first.body.full).toBe(true);
    expect(first.body.items.map((item: { name: string }) => item.name)).toEqual(["Milk"]);
    expect(first.body.lists).toHaveLength(1);
    expect(first.body.home.id).toBe(homeId);
    expect(first.body.home.plan).toEqual({
      id: "early",
      until: null,
      limits: { historyMonths: 12, photosPerHome: null, iconImages: 100, sets: 20, pinsPerList: 15 },
    });
    expect(first.body.categories.length).toBeGreaterThan(0);

    const quiet = await changes(token, homeId, first.body.version);
    expect(quiet.body).toEqual({ version: first.body.version, full: false });

    const bread = await addItem(token, homeId, "Bread");
    const next = await changes(token, homeId, first.body.version);
    expect(next.body.full).toBe(false);
    // Bread, plus any item whose place in the list moved to make room for it.
    expect(next.body.items.map((item: { id: string }) => item.id)).toContain(bread.id);
    expect(next.body.version).toBeGreaterThan(first.body.version);

    await api.call("POST", "/items/delete", { token, body: { ids: [milk.id] } });
    const afterDelete = await changes(token, homeId, next.body.version);
    expect(afterDelete.body.items).toEqual([]);
    expect(afterDelete.body.deleted).toEqual([{ type: "item", id: milk.id }]);
  });

  it("sends a full copy to a phone that is behind the oldest kept deletion", async () => {
    const { token, homeId } = await newHome();
    await addItem(token, homeId, "Eggs");
    const first = await changes(token, homeId);
    await addItem(token, homeId, "Flour");
    // The clean-up job removed markers up to the current version.
    await api.t.sql(`update homes set sync_floor = version where id = $1`, [homeId]);
    const behind = await changes(token, homeId, first.body.version);
    expect(behind.body.full).toBe(true);
  });

  it("sends a full copy when the phone claims a version the home never reached", async () => {
    const { token, homeId } = await newHome();
    const response = await changes(token, homeId, 999_999);
    expect(response.body.full).toBe(true);
  });

  it("leaves purchases older than last month off the phone", async () => {
    const { token, homeId } = await newHome();
    const recent = await addItem(token, homeId, "Recent");
    const old = await addItem(token, homeId, "Old");
    await api.call("POST", `/items/${recent.id}/bought`, { token, body: {} });
    await api.call("POST", `/items/${old.id}/bought`, { token, body: {} });
    await api.t.sql(`update items set bought_at = now() - interval '4 months' where id = $1`, [old.id]);

    const response = await changes(token, homeId);
    const names = response.body.items.map((item: { name: string }) => item.name);
    expect(names).toContain("Recent");
    expect(names).not.toContain("Old");
  });

  it("resends a trip's items when the trip is renamed", async () => {
    const { token, homeId } = await newHome();
    const item = await addItem(token, homeId, "Cheese");
    await api.call("POST", `/items/${item.id}/bought`, { token, body: {} });
    const receipt = await api.call("POST", `/homes/${homeId}/receipts`, {
      token,
      body: { itemIds: [item.id], total: 5, name: "Corner shop" },
    });
    expect(receipt.status).toBe(201);
    const before = await changes(token, homeId);

    await api.call("PATCH", `/receipts/${receipt.body.receipt.id}`, { token, body: { name: "Big market" } });
    const after = await changes(token, homeId, before.body.version);
    expect(after.body.trips.map((trip: { name: string }) => trip.name)).toEqual(["Big market"]);
    expect(after.body.items).toEqual([expect.objectContaining({ id: item.id, receiptName: "Big market" })]);
  });

  it("ends an expired shop lock, which phones see as a change", async () => {
    const { token, homeId, userId } = await newHome();
    const first = await changes(token, homeId);
    const listId = first.body.lists[0].id;
    await api.t.sql(
      `insert into list_shop_locks (list_id, home_id, user_id, started_at, heartbeat_at)
       values ($1, $2, $3, now() - interval '10 minutes', now() - interval '10 minutes')`,
      [listId, homeId, userId],
    );
    const withLock = await changes(token, homeId, first.body.version);
    expect(withLock.body.full).toBe(false);
    expect(withLock.body.locks).toEqual([]);
    const [{ count }] = await api.t.sql<{ count: string }>(
      `select count(*) from list_shop_locks where home_id = $1`,
      [homeId],
    );
    expect(count).toBe("0");
  });

  it("stores the home's time zone from the first phone that sends one", async () => {
    const { token, homeId } = await newHome();
    await changes(token, homeId, undefined, { "x-timezone": "Asia/Riyadh" });
    await changes(token, homeId, undefined, { "x-timezone": "Europe/Berlin" });
    await changes(token, homeId, undefined, { "x-timezone": "Not/AZone" });
    const [row] = await api.t.sql<{ timezone: string }>(`select timezone from homes where id = $1`, [homeId]);
    expect(row.timezone).toBe("Asia/Riyadh");
  });

  it("refuses someone who is not in the home", async () => {
    const { homeId } = await newHome();
    const stranger = await api.signUp("Stranger");
    const response = await changes(stranger.token, homeId);
    expect(response.status).toBe(403);
  });

  it("rejects a version that is not a whole number", async () => {
    const { token, homeId } = await newHome();
    const response = await api.call("GET", `/homes/${homeId}/changes?since=abc`, { token });
    expect(response.status).toBe(400);
  });
});
