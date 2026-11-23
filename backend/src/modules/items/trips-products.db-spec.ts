import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { startTestApi, type TestApi } from "../../database/testing/test-api";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api?.close();
});

async function newHome() {
  const person = await api.signUp("Buyer");
  const home = await api.call("POST", "/homes", { token: person.token, body: { name: "Home" } });
  return { ...person, homeId: home.body.id as string };
}

async function add(token: string, homeId: string, name: string) {
  const response = await api.call("POST", `/homes/${homeId}/items`, {
    token,
    body: { name, quantity: 1, category: "vegetables" },
  });
  return response.body.id as string;
}

async function buy(token: string, id: string, cost?: number) {
  const response = await api.call("POST", `/items/${id}/bought`, {
    token,
    body: cost === undefined ? {} : { cost },
  });
  expect(response.status).toBe(201);
  return response.body as { receiptId: string | null };
}

/** Moves a purchase (and its trip) back in time, as if bought `minutes` ago. */
async function ago(itemId: string, minutes: number) {
  await api.t.sql(
    `update items set bought_at = now() - make_interval(mins => $2) where id = $1`,
    [itemId, minutes],
  );
  await api.t.sql(
    `update trip_receipts r set started_at = x.a, last_bought_at = x.b
       from (select receipt_id, min(bought_at) a, max(bought_at) b from items
              where receipt_id = (select receipt_id from items where id = $1) group by receipt_id) x
      where r.id = x.receipt_id`,
    [itemId],
  );
}

const product = async (homeId: string, key: string) =>
  (
    await api.t.sql<Record<string, unknown>>(
      `select name, category, last_cost, times_bought from home_products where home_id = $1 and name_key = $2`,
      [homeId, key],
    )
  )[0];

describe("buying puts every purchase on a trip", () => {
  it("joins the trip whose last purchase was within 90 minutes", async () => {
    const { token, homeId } = await newHome();
    const first = await add(token, homeId, "Tomatoes");
    const second = await add(token, homeId, "Onions");
    const a = await buy(token, first);
    expect(a.receiptId).toEqual(expect.any(String));
    await ago(first, 60);
    const b = await buy(token, second);
    expect(b.receiptId).toBe(a.receiptId);
  });

  it("starts a new trip after more than 90 minutes", async () => {
    const { token, homeId } = await newHome();
    const first = await add(token, homeId, "Tomatoes");
    const second = await add(token, homeId, "Onions");
    const a = await buy(token, first);
    await ago(first, 95);
    const b = await buy(token, second);
    expect(b.receiptId).not.toBe(a.receiptId);
    const [trip] = await api.t.sql<{ started_at: Date; last_bought_at: Date }>(
      `select started_at, last_bought_at from trip_receipts where id = $1`,
      [b.receiptId],
    );
    expect(trip.started_at.getTime()).toBe(trip.last_bought_at.getTime());
  });

  it("uses the trip the phone names, adding the price to its total", async () => {
    const { token, homeId } = await newHome();
    const first = await add(token, homeId, "Bread");
    await buy(token, first);
    const receipt = await api.call("POST", `/homes/${homeId}/receipts`, {
      token,
      body: { itemIds: [first], total: 10, name: "Bakery" },
    });
    const second = await add(token, homeId, "Butter");
    const response = await api.call("POST", `/items/${second}/bought`, {
      token,
      body: { cost: 2.5, receiptId: receipt.body.receipt.id },
    });
    expect(response.body.receiptId).toBe(receipt.body.receipt.id);
    const [trip] = await api.t.sql<{ total: string }>(`select total from trip_receipts where id = $1`, [
      receipt.body.receipt.id,
    ]);
    expect(trip.total).toBe("12.500");
  });

  it("puts one tap's purchases from one list on a single trip", async () => {
    const { token, homeId } = await newHome();
    const ids = [await add(token, homeId, "A"), await add(token, homeId, "B"), await add(token, homeId, "C")];
    await api.call("POST", "/items/bought", { token, body: { items: ids.map((id) => ({ id })) } });
    const trips = await api.t.sql<{ receipt_id: string }>(
      `select distinct receipt_id from items where id = any($1::uuid[])`,
      [ids],
    );
    expect(trips).toHaveLength(1);
    expect(trips[0].receipt_id).toEqual(expect.any(String));
  });

  it("lands two people buying from one list at the same moment on one trip", async () => {
    const owner = await newHome();
    const ids = await Promise.all(["X", "Y", "Z", "W"].map((name) => add(owner.token, owner.homeId, name)));
    await Promise.all(ids.map((id) => buy(owner.token, id)));
    const trips = await api.t.sql(`select distinct receipt_id from items where id = any($1::uuid[])`, [ids]);
    expect(trips).toHaveLength(1);
  });

  it("removes a trip left empty when its only purchase is undone", async () => {
    const { token, homeId } = await newHome();
    const id = await add(token, homeId, "Lemons");
    const bought = await buy(token, id);
    const undo = await api.call("POST", `/items/${id}/needed`, { token });
    expect(undo.status).toBe(201);
    const rows = await api.t.sql(`select 1 from trip_receipts where id = $1`, [bought.receiptId]);
    expect(rows).toHaveLength(0);
  });
});

describe("buying keeps products right", () => {
  it("records a first purchase, counts repeats and keeps the newest price", async () => {
    const { token, homeId } = await newHome();
    await buy(token, await add(token, homeId, "Tomatoes"), 1.5);
    await buy(token, await add(token, homeId, "  tomatoes "));
    expect(await product(homeId, "tomatoes")).toEqual({
      name: "tomatoes",
      category: "vegetables",
      last_cost: "1.500",
      times_bought: 2,
    });
    await buy(token, await add(token, homeId, "TOMATOES"), 2);
    expect(await product(homeId, "tomatoes")).toMatchObject({ last_cost: "2.000", times_bought: 3 });
  });

  it("treats Arabic names with and without diacritics as one product", async () => {
    const { token, homeId } = await newHome();
    await buy(token, await add(token, homeId, "خُبْز"));
    await buy(token, await add(token, homeId, "خبز"));
    expect(await product(homeId, "خبز")).toMatchObject({ times_bought: 2 });
  });

  it("counts two of the same name in one tap without failing", async () => {
    const { token, homeId } = await newHome();
    const ids = [await add(token, homeId, "Milk"), await add(token, homeId, "milk")];
    const response = await api.call("POST", "/items/bought", {
      token,
      body: { items: ids.map((id, index) => ({ id, cost: index + 1 })) },
    });
    expect(response.status).toBe(201);
    expect(await product(homeId, "milk")).toMatchObject({ times_bought: 2 });
  });

  it("follows a price change", async () => {
    const { token, homeId } = await newHome();
    const id = await add(token, homeId, "Coffee");
    await buy(token, id, 5);
    await api.call("PATCH", `/items/${id}/cost`, { token, body: { cost: 7.25 } });
    expect(await product(homeId, "coffee")).toMatchObject({ last_cost: "7.250" });
  });

  it("forgets a product bought once and then undone, and steps back after a repeat is undone", async () => {
    const { token, homeId } = await newHome();
    const once = await add(token, homeId, "Saffron");
    await buy(token, once, 9);
    await api.call("POST", `/items/${once}/needed`, { token });
    expect(await product(homeId, "saffron")).toBeUndefined();

    const first = await add(token, homeId, "Rice");
    await buy(token, first, 3);
    const second = await add(token, homeId, "Rice");
    await buy(token, second, 4);
    await api.call("POST", `/items/${second}/needed`, { token });
    expect(await product(homeId, "rice")).toMatchObject({ times_bought: 1, last_cost: "3.000" });
  });
});

describe("review fixes", () => {
  const tripOf = async (itemId: string) =>
    (await api.t.sql<{ receipt_id: string }>(`select receipt_id from items where id = $1`, [itemId]))[0].receipt_id;

  it("does not add a purchase to an old trip nobody priced or named, even when the phone names it", async () => {
    const { token, homeId } = await newHome();
    const first = await add(token, homeId, "Milk");
    const a = await buy(token, first);
    await ago(first, 60 * 24 * 17);
    const second = await add(token, homeId, "Bread");
    const response = await api.call("POST", `/items/${second}/bought`, { token, body: { receiptId: a.receiptId } });
    expect(response.body.receiptId).not.toBe(a.receiptId);
  });

  it("still adds a purchase to a real invoice the phone names, however old", async () => {
    const { token, homeId } = await newHome();
    const first = await add(token, homeId, "Milk");
    await buy(token, first);
    const receipt = await api.call("POST", `/homes/${homeId}/receipts`, {
      token,
      body: { itemIds: [first], total: 10, name: "Monthly shop" },
    });
    await ago(first, 60 * 24 * 17);
    const second = await add(token, homeId, "Bread");
    const response = await api.call("POST", `/items/${second}/bought`, {
      token,
      body: { cost: 2, receiptId: receipt.body.receipt.id },
    });
    expect(response.body.receiptId).toBe(receipt.body.receipt.id);
    expect(response.body.receiptTotal).toBe(12);
  });

  it("creates the invoice under the phone's own id, so a rename queued offline finds it", async () => {
    const { token, homeId } = await newHome();
    const item = await add(token, homeId, "Cheese");
    await buy(token, item);
    const phoneId = "7b0f4c1e-3f6a-4a53-9d8e-1c2b3a4d5e6f";
    const created = await api.call("POST", `/homes/${homeId}/receipts`, {
      token,
      body: { id: phoneId, itemIds: [item], total: 4.5 },
    });
    expect(created.body.receipt.id).toBe(phoneId);
    const renamed = await api.call("PATCH", `/receipts/${phoneId}`, { token, body: { name: "Deli" } });
    expect(renamed.status).toBe(200);
    expect(await tripOf(item)).toBe(phoneId);
    const trips = await api.t.sql(`select 1 from trip_receipts where home_id = $1`, [homeId]);
    expect(trips).toHaveLength(1);
  });

  it("starts a new trip instead of joining an invoice that already has a total", async () => {
    const { token, homeId } = await newHome();
    const first = await add(token, homeId, "Rice");
    await buy(token, first, 3);
    const receipt = await api.call("POST", `/homes/${homeId}/receipts`, { token, body: { itemIds: [first], total: 50 } });
    const second = await add(token, homeId, "Salt");
    const b = await buy(token, second, 3);
    expect(b.receiptId).not.toBe(receipt.body.receipt.id);
    const [row] = await api.t.sql<{ total: string }>(`select total from trip_receipts where id = $1`, [
      receipt.body.receipt.id,
    ]);
    expect(row.total).toBe("50.000");
  });

  it("shows an item that joined an invoice weeks later in that invoice's month", async () => {
    const { token, homeId } = await newHome();
    await api.t.sql(`update homes set timezone = 'UTC' where id = $1`, [homeId]);
    const first = await add(token, homeId, "Early");
    const late = await add(token, homeId, "Late");
    await buy(token, first);
    const receipt = await api.call("POST", `/homes/${homeId}/receipts`, { token, body: { itemIds: [first], total: 9 } });
    await api.call("POST", `/items/${late}/bought`, { token, body: { receiptId: receipt.body.receipt.id } });
    await api.t.sql(`update items set bought_at = '2026-09-28T10:00:00Z' where id = $1`, [first]);
    await api.t.sql(`update items set bought_at = '2026-10-20T10:00:00Z' where id = $1`, [late]);
    await api.t.sql(
      `update trip_receipts set started_at = '2026-09-28T10:00:00Z', last_bought_at = '2026-10-20T10:00:00Z' where id = $1`,
      [receipt.body.receipt.id],
    );
    const september = await api.call("GET", `/homes/${homeId}/history/purchases?month=2026-09`, { token });
    expect(september.body.items.map((item: { name: string }) => item.name).sort()).toEqual(["Early", "Late"]);
    const october = await api.call("GET", `/homes/${homeId}/history/purchases?month=2026-10`, { token });
    expect(october.body.items).toEqual([]);
  });

  it("refuses a time zone Postgres does not know", async () => {
    const { token, homeId } = await newHome();
    await api.call("GET", `/homes/${homeId}/changes`, { token, headers: { "x-timezone": "Etc/Unknown" } });
    const [row] = await api.t.sql<{ timezone: string | null }>(`select timezone from homes where id = $1`, [homeId]);
    expect(row.timezone === null || row.timezone === "Etc/Unknown").toBe(true);
    const ok = await api.call("GET", `/homes/${homeId}/history/months`, { token });
    expect(ok.status).toBe(200);
  });

  it("gives purchases left without a trip their trips in the daily job", async () => {
    const { token, homeId, userId } = await newHome();
    const [list] = await api.t.sql<{ id: string }>(`select id from lists where home_id = $1`, [homeId]);
    await api.t.sql(
      `insert into items (home_id, list_id, name, quantity, category, status, added_by, bought_by, bought_at)
       select $1, $2, 'loose ' || g, 1, 'other', 'bought', $3, $3, now() - interval '3 hours' + g * interval '10 minutes'
         from generate_series(1, 3) g`,
      [homeId, list.id, userId],
    );
    await api.call("POST", "/internal/maintenance/run", { headers: { "x-cron-secret": "test-cron-secret" } });
    const rows = await api.t.sql<{ receipt_id: string | null }>(
      `select distinct receipt_id from items where home_id = $1 and name like 'loose %'`,
      [homeId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].receipt_id).toEqual(expect.any(String));
    const history = await api.call("GET", `/homes/${homeId}/history/trips?month=${new Date().toISOString().slice(0, 7)}`, { token });
    expect(history.body.trips.some((trip: { itemCount: number }) => trip.itemCount === 3)).toBe(true);
  });
});
