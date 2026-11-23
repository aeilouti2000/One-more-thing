import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { startTestApi, type TestApi } from "../../database/testing/test-api";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api?.close();
});

const DAY = 86_400_000;

async function homeWithHistory(options: { planChangedDaysAgo: number }) {
  const person = await api.signUp("Keeper");
  const home = await api.call("POST", "/homes", { token: person.token, body: { name: "Home" } });
  const homeId = home.body.id as string;
  await api.t.sql(
    `update homes set timezone = 'UTC', plan_changed_at = now() - make_interval(days => $2) where id = $1`,
    [homeId, options.planChangedDaysAgo],
  );
  const [list] = await api.t.sql<{ id: string }>(`select id from lists where home_id = $1`, [homeId]);
  const buy = async (name: string, at: Date, tripTotal: number | null, cost: number | null) => {
    const [trip] = await api.t.sql<{ id: string }>(
      `insert into trip_receipts (home_id, list_id, total, started_at, last_bought_at) values ($1, $2, $3, $4, $4) returning id`,
      [homeId, list.id, tripTotal, at],
    );
    await api.t.sql(
      `insert into items (home_id, list_id, name, quantity, category, status, added_by, bought_by, bought_at, cost, receipt_id)
       values ($1, $2, $3, 1, 'meat', 'bought', $4, $4, $5, $6, $7)`,
      [homeId, list.id, name, person.userId, at, cost, trip.id],
    );
    await api.t.sql(
      `insert into home_products (home_id, name_key, name, category, last_bought_at) values ($1, lower($2), $2, 'meat', $3)
       on conflict do nothing`,
      [homeId, name, at],
    );
  };
  const old = new Date(Date.now() - 20 * 30 * DAY);
  await buy("Lamb", old, 30, 12);
  await buy("Beef", new Date(old.getTime() + 60_000), null, 7.5);
  await buy("Chicken", new Date(Date.now() - 5 * DAY), null, 4);
  return { ...person, homeId, old };
}

const run = (after?: string) =>
  api.call("POST", `/internal/maintenance/run${after ? `?after=${after}` : ""}`, {
    headers: { "x-cron-secret": "test-cron-secret" },
  });

describe("daily clean-up", () => {
  it("saves an old month's totals, then deletes its purchases and trips, keeping products and recent months", async () => {
    const home = await homeWithHistory({ planChangedDaysAgo: 400 });
    const response = await run();
    expect(response.status).toBe(200);
    expect(response.body.next).toBeNull();

    const items = await api.t.sql<{ name: string }>(`select name from items where home_id = $1`, [home.homeId]);
    expect(items.map((row) => row.name)).toEqual(["Chicken"]);
    const trips = await api.t.sql(`select 1 from trip_receipts where home_id = $1`, [home.homeId]);
    expect(trips).toHaveLength(1);

    const [month] = await api.t.sql<Record<string, unknown>>(
      `select item_count, priced_count, trip_count, spend from home_months where home_id = $1`,
      [home.homeId],
    );
    // Lamb is in a trip with a 30 total; Beef counts its own 7.50.
    expect(month).toEqual({ item_count: 2, priced_count: 2, trip_count: 2, spend: "37.500" });

    const products = await api.t.sql<{ name: string }>(
      `select name from home_products where home_id = $1 order by name`,
      [home.homeId],
    );
    expect(products.map((row) => row.name)).toEqual(["Beef", "Chicken", "Lamb"]);

    const summary = await api.call("GET", `/homes/${home.homeId}/history/months`, { token: home.token });
    expect(summary.body.months.map((row: { state: string }) => row.state)).toEqual(["live", "archived"]);
  });

  it("keeps everything for 30 days after a plan change", async () => {
    const home = await homeWithHistory({ planChangedDaysAgo: 3 });
    await run();
    const items = await api.t.sql(`select 1 from items where home_id = $1`, [home.homeId]);
    expect(items).toHaveLength(3);
  });

  it("is safe to run twice", async () => {
    const home = await homeWithHistory({ planChangedDaysAgo: 400 });
    await run();
    await run();
    const months = await api.t.sql(`select 1 from home_months where home_id = $1`, [home.homeId]);
    expect(months).toHaveLength(1);
  });

  it("removes old deletion markers and sends phones behind them a full copy", async () => {
    const person = await api.signUp("Marker");
    const home = await api.call("POST", "/homes", { token: person.token, body: { name: "Home" } });
    const homeId = home.body.id as string;
    const before = await api.call("GET", `/homes/${homeId}/changes`, { token: person.token });
    await api.t.sql(
      `insert into home_deletions (home_id, entity, entity_id, version, deleted_at)
       values ($1, 'item', gen_random_uuid(), $2, now() - interval '90 days')`,
      [homeId, Number(before.body.version) + 1],
    );
    await api.t.sql(`update homes set version = version + 1 where id = $1`, [homeId]);
    await run();
    const markers = await api.t.sql(`select 1 from home_deletions where home_id = $1`, [homeId]);
    expect(markers).toHaveLength(0);
    const after = await api.call("GET", `/homes/${homeId}/changes?since=${before.body.version}`, {
      token: person.token,
    });
    expect(after.body.full).toBe(true);
  });

  it("removes expired sign-in tokens and email codes", async () => {
    await api.signUp("Expired");
    await api.t.sql(`update refresh_tokens set expires_at = now() - interval '3 days'`);
    await run();
    const tokens = await api.t.sql(`select 1 from refresh_tokens where expires_at < now() - interval '1 day'`);
    expect(tokens).toHaveLength(0);
  });

  it("answers 404 without the secret", async () => {
    const response = await api.call("POST", "/internal/maintenance/run");
    expect(response.status).toBe(404);
  });
});
