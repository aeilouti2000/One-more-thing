import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { startTestApi, type TestApi } from "../../database/testing/test-api";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api?.close();
});

type Home = { token: string; userId: string; homeId: string; listId: string };

async function newHome(timezone = "Asia/Amman"): Promise<Home> {
  const person = await api.signUp("Historian");
  const home = await api.call("POST", "/homes", { token: person.token, body: { name: "Home" } });
  const homeId = home.body.id as string;
  await api.t.sql(`update homes set timezone = $2 where id = $1`, [homeId, timezone]);
  const [list] = await api.t.sql<{ id: string }>(`select id from lists where home_id = $1`, [homeId]);
  return { ...person, homeId, listId: list.id };
}

async function trip(home: Home, startedAt: string, total: number | null = null, name: string | null = null) {
  const [row] = await api.t.sql<{ id: string }>(
    `insert into trip_receipts (home_id, list_id, total, name, started_at, last_bought_at)
     values ($1, $2, $3, $4, $5, $5) returning id`,
    [home.homeId, home.listId, total, name, startedAt],
  );
  return row.id;
}

async function purchase(
  home: Home,
  tripId: string,
  name: string,
  boughtAt: string,
  options: { cost?: number | null; category?: string; id?: string } = {},
) {
  const [row] = await api.t.sql<{ id: string }>(
    `insert into items (${options.id ? "id, " : ""}home_id, list_id, name, quantity, category, status, added_by, bought_by, bought_at, cost, receipt_id)
     values (${options.id ? "$9, " : ""}$1, $2, $3, 1, $4, 'bought', $5, $5, $6, $7, $8) returning id`,
    [
      home.homeId,
      home.listId,
      name,
      options.category ?? "supermarket",
      home.userId,
      boughtAt,
      options.cost ?? null,
      tripId,
      ...(options.id ? [options.id] : []),
    ],
  );
  return row.id;
}

const get = (home: Home, path: string) => api.call("GET", `/homes/${home.homeId}/history${path}`, { token: home.token });

describe("GET history/purchases", () => {
  it("pages a month newest first by cursor, without repeats or gaps across equal times", async () => {
    const home = await newHome();
    const t = await trip(home, "2026-11-10T10:00:00Z");
    const ids: string[] = [];
    // Six purchases, three of them at the very same moment.
    for (const [index, at] of ["10:00", "10:05", "10:05", "10:05", "10:10", "10:20"].entries()) {
      ids.push(await purchase(home, t, `item ${index}`, `2026-11-10T${at}:00Z`));
    }
    const seen: string[] = [];
    let next: string | null = null;
    let pages = 0;
    do {
      const response = await get(home, `/purchases?month=2026-11&limit=2${next ? `&before=${encodeURIComponent(next)}` : ""}`);
      expect(response.status).toBe(200);
      seen.push(...response.body.items.map((item: { id: string }) => item.id));
      next = response.body.next;
      pages += 1;
    } while (next && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(6);
    expect(seen.slice(0, 2)).toEqual([ids[5], ids[4]]);
    expect(seen.at(-1)).toBe(ids[0]);
  });

  it("puts a purchase in its home's month, not the server's (00:30 in Amman on 1 Nov is 22:30 UTC on 31 Oct)", async () => {
    const home = await newHome("Asia/Amman");
    const t = await trip(home, "2026-10-31T22:30:00Z");
    await purchase(home, t, "midnight snack", "2026-10-31T22:30:00Z");
    const november = await get(home, "/purchases?month=2026-11");
    const october = await get(home, "/purchases?month=2026-10");
    expect(november.body.items.map((item: { name: string }) => item.name)).toEqual(["midnight snack"]);
    expect(october.body.items).toEqual([]);
  });

  it("keeps a trip that runs past midnight in the month it started", async () => {
    const home = await newHome("UTC");
    const t = await trip(home, "2026-10-31T23:40:00Z");
    await purchase(home, t, "before", "2026-10-31T23:40:00Z");
    await purchase(home, t, "after", "2026-11-01T00:20:00Z");
    const october = await get(home, "/purchases?month=2026-10");
    expect(october.body.items.map((item: { name: string }) => item.name)).toEqual(["after", "before"]);
  });

  it("filters by list and by category", async () => {
    const home = await newHome();
    const t = await trip(home, "2026-11-05T09:00:00Z");
    await purchase(home, t, "steak", "2026-11-05T09:00:00Z", { category: "meat" });
    await purchase(home, t, "carrots", "2026-11-05T09:01:00Z", { category: "vegetables" });
    const meat = await get(home, "/purchases?month=2026-11&category=meat");
    expect(meat.body.items.map((item: { name: string }) => item.name)).toEqual(["steak"]);
    const otherList = await get(home, `/purchases?month=2026-11&listId=00000000-0000-4000-8000-000000000000`);
    expect(otherList.body.items).toEqual([]);
  });

  it("searches every kept month, case-insensitively, treating % and _ as plain text", async () => {
    const home = await newHome();
    const october = await trip(home, "2026-10-05T09:00:00Z");
    const november = await trip(home, "2026-11-05T09:00:00Z");
    await purchase(home, october, "Tomato paste", "2026-10-05T09:00:00Z");
    await purchase(home, november, "tomatoes", "2026-11-05T09:00:00Z");
    await purchase(home, november, "100% juice", "2026-11-05T09:05:00Z");
    const found = await get(home, "/purchases?q=TOMATO");
    expect(found.body.items.map((item: { name: string }) => item.name)).toEqual(["tomatoes", "Tomato paste"]);
    const percent = await get(home, `/purchases?q=${encodeURIComponent("0%")}`);
    expect(percent.body.items.map((item: { name: string }) => item.name)).toEqual(["100% juice"]);
  });

  it("hides months older than the plan keeps", async () => {
    const home = await newHome();
    const old = await trip(home, new Date(Date.now() - 400 * 86_400_000).toISOString());
    await purchase(home, old, "ancient", new Date(Date.now() - 400 * 86_400_000).toISOString());
    const search = await get(home, "/purchases?q=ancient");
    expect(search.body.items).toEqual([]);
  });

  it("refuses pages larger than 100, a missing month, and a broken cursor", async () => {
    const home = await newHome();
    expect((await get(home, "/purchases?month=2026-11&limit=101")).status).toBe(400);
    expect((await get(home, "/purchases")).status).toBe(400);
    expect((await get(home, "/purchases?month=2026-11&before=yesterday")).status).toBe(400);
    expect((await get(home, "/purchases?month=2026-13")).status).toBe(400);
  });

  it("refuses someone who is not in the home", async () => {
    const home = await newHome();
    const stranger = await api.signUp("Stranger");
    const response = await api.call("GET", `/homes/${home.homeId}/history/purchases?month=2026-11`, {
      token: stranger.token,
    });
    expect(response.status).toBe(403);
  });
});

describe("GET history/trips", () => {
  it("lists a month's trips with counts, totals and their first three items", async () => {
    const home = await newHome();
    const priced = await trip(home, "2026-11-12T08:00:00Z", 20, "Carrefour");
    const loose = await trip(home, "2026-11-11T08:00:00Z");
    for (const [index, name] of ["a", "b", "c", "d"].entries()) {
      await purchase(home, priced, name, `2026-11-12T08:0${index}:00Z`, { cost: index === 0 ? 5 : null });
    }
    await purchase(home, loose, "e", "2026-11-11T08:00:00Z", { cost: 2.5 });
    await purchase(home, loose, "f", "2026-11-11T08:01:00Z");

    const response = await get(home, "/trips?month=2026-11");
    expect(response.status).toBe(200);
    expect(response.body.trips).toEqual([
      expect.objectContaining({
        id: priced,
        name: "Carrefour",
        total: 20,
        hasTotal: true,
        itemCount: 4,
        pricedCount: 4,
        preview: [
          expect.objectContaining({ name: "a" }),
          expect.objectContaining({ name: "b" }),
          expect.objectContaining({ name: "c" }),
        ],
      }),
      expect.objectContaining({ id: loose, total: 2.5, hasTotal: false, itemCount: 2, pricedCount: 1 }),
    ]);

    const detail = await get(home, `/trips/${priced}`);
    expect(detail.body.trip).toMatchObject({ id: priced, name: "Carrefour", total: 20 });
    expect(detail.body.items).toHaveLength(4);
  });
});

describe("GET history/months", () => {
  it("sums a month by the app's rule: a trip total once, other items by their own price", async () => {
    const home = await newHome();
    const priced = await trip(home, "2026-11-12T08:00:00Z", 20);
    const loose = await trip(home, "2026-11-11T08:00:00Z");
    await purchase(home, priced, "steak", "2026-11-12T08:00:00Z", { cost: 8, category: "meat" });
    await purchase(home, priced, "carrots", "2026-11-12T08:01:00Z", { category: "vegetables" });
    await purchase(home, loose, "coffee", "2026-11-11T08:00:00Z", { cost: 4.25, category: "coffee" });
    await purchase(home, loose, "salt", "2026-11-11T08:01:00Z", { category: "supermarket" });

    const response = await get(home, "/months/2026-11");
    expect(response.body).toMatchObject({
      month: "2026-11",
      state: "live",
      itemCount: 4,
      pricedCount: 3,
      tripCount: 2,
      spend: 24.25,
    });
    expect(response.body.categories).toEqual(
      expect.arrayContaining([
        { category: "", itemCount: 0, spend: 12 },
        { category: "meat", itemCount: 1, spend: 8 },
      ]),
    );

    const list = await get(home, "/months");
    expect(list.body.months).toEqual([{ month: "2026-11", state: "live", spend: 24.25, itemCount: 4 }]);
  });

  it("reads a cleaned month from its saved totals", async () => {
    const home = await newHome();
    await api.t.sql(
      `insert into home_months (home_id, month, item_count, priced_count, trip_count, spend)
       values ($1, '2024-05-01', 96, 90, 11, 274.1)`,
      [home.homeId],
    );
    await api.t.sql(
      `insert into home_month_categories (home_id, month, category, item_count, spend)
       values ($1, '2024-05-01', 'meat', 20, 98)`,
      [home.homeId],
    );
    const response = await get(home, "/months/2024-05");
    expect(response.body).toMatchObject({ state: "archived", itemCount: 96, tripCount: 11, spend: 274.1 });
    expect(response.body.categories).toEqual([{ category: "meat", itemCount: 20, spend: 98 }]);
    const empty = await get(home, "/months/2024-06");
    expect(empty.body.state).toBe("none");
  });
});
