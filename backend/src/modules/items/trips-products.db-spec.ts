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
