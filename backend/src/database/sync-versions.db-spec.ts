import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { MIGRATIONS } from "./migrations";
import { createTestDatabase, seedHome, type TestDatabase } from "./testing/test-database";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

async function homeVersion(homeId: string) {
  const [row] = await t.sql<{ version: string }>(`select version from homes where id = $1`, [homeId]);
  return Number(row.version);
}

async function addItem(home: Awaited<ReturnType<typeof seedHome>>, name: string, status = "needed") {
  const [row] = await t.sql<{ id: string; version: string }>(
    `insert into items (home_id, list_id, name, quantity, category, status, added_by, bought_at)
     values ($1, $2, $3, 1, 'other', $4, $5, case when $4 = 'bought' then now() end)
     returning id, version`,
    [home.homeId, home.listId, name, status, home.userId],
  );
  return { id: row.id, version: Number(row.version) };
}

describe("change counter triggers", () => {
  it("stamps an inserted row with the home's next number", async () => {
    const home = await seedHome(t, "insert");
    const before = await homeVersion(home.homeId);
    const item = await addItem(home, "Milk");
    expect(item.version).toBe(before + 1);
    expect(await homeVersion(home.homeId)).toBe(item.version);
  });

  it("gives every row of one update its own number, in order", async () => {
    const home = await seedHome(t, "bulk");
    for (const name of ["A", "B", "C", "D", "E"]) await addItem(home, name);
    const before = await homeVersion(home.homeId);
    await t.sql(`update items set urgent = true where home_id = $1`, [home.homeId]);
    const rows = await t.sql<{ version: string }>(
      `select version from items where home_id = $1 order by version`,
      [home.homeId],
    );
    expect(rows.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5].map((n) => before + n));
  });

  it("does not count an update that changes nothing", async () => {
    const home = await seedHome(t, "noop");
    const item = await addItem(home, "Salt");
    const before = await homeVersion(home.homeId);
    await t.sql(`update items set quantity = quantity where id = $1`, [item.id]);
    expect(await homeVersion(home.homeId)).toBe(before);
  });

  it("leaves a deletion marker with the next number", async () => {
    const home = await seedHome(t, "delete");
    const item = await addItem(home, "Bread");
    await t.sql(`delete from items where id = $1`, [item.id]);
    const markers = await t.sql<{ entity: string; entity_id: string; version: string }>(
      `select entity, entity_id, version from home_deletions where home_id = $1`,
      [home.homeId],
    );
    expect(markers).toEqual([{ entity: "item", entity_id: item.id, version: String(item.version + 1) }]);
  });

  it("deletes a whole home without failing and without markers", async () => {
    const home = await seedHome(t, "home-delete");
    await addItem(home, "Eggs");
    await addItem(home, "Rice", "bought");
    await t.sql(`delete from homes where id = $1`, [home.homeId]);
    const [{ count }] = await t.sql<{ count: string }>(
      `select count(*) from home_deletions where home_id = $1`,
      [home.homeId],
    );
    expect(count).toBe("0");
  });

  it("stamps nothing while omt.skip_sync is on", async () => {
    const home = await seedHome(t, "skip");
    const item = await addItem(home, "Tea");
    const before = await homeVersion(home.homeId);
    const runner = t.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`set local omt.skip_sync = 'on'`);
    await runner.query(`update items set quantity = 3 where id = $1`, [item.id]);
    await runner.query(`delete from items where id = $1`, [item.id]);
    await runner.commitTransaction();
    await runner.release();
    expect(await homeVersion(home.homeId)).toBe(before);
    const markers = await t.sql(`select 1 from home_deletions where home_id = $1`, [home.homeId]);
    expect(markers).toHaveLength(0);
  });

  it("moves the counter when the home's own settings change", async () => {
    const home = await seedHome(t, "settings");
    const before = await homeVersion(home.homeId);
    await t.sql(`update homes set name = 'Renamed' where id = $1`, [home.homeId]);
    expect(await homeVersion(home.homeId)).toBe(before + 1);
  });

  it("moves the counter for small sets: hidden categories, members, shop locks, asks", async () => {
    const home = await seedHome(t, "sets");
    let version = await homeVersion(home.homeId);
    const expectBump = async () => {
      const next = await homeVersion(home.homeId);
      expect(next).toBeGreaterThan(version);
      version = next;
    };

    await t.sql(`insert into hidden_home_categories (home_id, category_id) values ($1, 'coffee')`, [home.homeId]);
    await expectBump();
    await t.sql(
      `insert into list_shop_locks (list_id, home_id, user_id, started_at, heartbeat_at) values ($1, $2, $3, now(), now())`,
      [home.listId, home.homeId, home.userId],
    );
    await expectBump();
    await t.sql(`update home_members set role = 'owner' where home_id = $1`, [home.homeId]);
    await expectBump();
  });

  it("does not move the counter for a shop-lock heartbeat", async () => {
    const home = await seedHome(t, "heartbeat");
    await t.sql(
      `insert into list_shop_locks (list_id, home_id, user_id, started_at, heartbeat_at) values ($1, $2, $3, now(), now())`,
      [home.listId, home.homeId, home.userId],
    );
    const before = await homeVersion(home.homeId);
    await t.sql(`update list_shop_locks set heartbeat_at = now() where list_id = $1`, [home.listId]);
    expect(await homeVersion(home.homeId)).toBe(before);
  });

  it("stamps lists, trips and products too", async () => {
    const home = await seedHome(t, "others");
    const [trip] = await t.sql<{ version: string }>(
      `insert into trip_receipts (home_id, list_id) values ($1, $2) returning version`,
      [home.homeId, home.listId],
    );
    const [product] = await t.sql<{ version: string }>(
      `insert into home_products (home_id, name_key, name, category, last_bought_at)
       values ($1, 'milk', 'Milk', 'supermarket', now()) returning version`,
      [home.homeId],
    );
    expect(Number(product.version)).toBe(Number(trip.version) + 1);
    expect(await homeVersion(home.homeId)).toBe(Number(product.version));
  });

  it("lets code that predates the change create a trip without its times", async () => {
    const home = await seedHome(t, "old-code");
    const [trip] = await t.sql<{ started_at: Date | null; last_bought_at: Date | null }>(
      `insert into trip_receipts (home_id, list_id, total) values ($1, $2, 12.5) returning started_at, last_bought_at`,
      [home.homeId, home.listId],
    );
    expect(trip.started_at).toBeInstanceOf(Date);
    expect(trip.last_bought_at).toBeInstanceOf(Date);
  });
});

describe("TripsAsRows migration", () => {
  it("groups purchases into trips the way the app does, and keeps existing invoices", async () => {
    const upTo = MIGRATIONS.findIndex((migration) => migration.name === "TripsAsRows1740000000027");
    const early = await createTestDatabase(MIGRATIONS.slice(0, upTo));
    try {
      const home = await seedHome(early, "trips");
      const at = (minutes: number) => new Date(Date.UTC(2026, 10, 1, 10, 0) + minutes * 60_000);
      const buy = async (name: string, minutes: number, receiptId: string | null = null) => {
        await early.sql(
          `insert into items (home_id, list_id, name, quantity, category, status, added_by, bought_by, bought_at, receipt_id)
           values ($1, $2, $3, 1, 'other', 'bought', $4, $4, $5, $6)`,
          [home.homeId, home.listId, name, home.userId, at(minutes), receiptId],
        );
      };
      // Trip 1: three purchases 40 minutes apart (each within 90 of the one before).
      await buy("a1", 0);
      await buy("a2", 40);
      await buy("a3", 80);
      // 91 minutes later: a new trip.
      await buy("b1", 171);
      await buy("b2", 200);
      // An existing named invoice stays as it is.
      const [invoice] = await early.sql<{ id: string }>(
        `insert into trip_receipts (home_id, list_id, name, total) values ($1, $2, 'Carrefour', 20) returning id`,
        [home.homeId, home.listId],
      );
      await buy("c1", 500, invoice.id);
      // A purchase on its own, days later.
      await buy("d1", 5000);
      const [{ version: before }] = await early.sql<{ version: string }>(
        `select version from homes where id = $1`,
        [home.homeId],
      );

      // Up to 032 only: 033 bumps every home's version on purpose (the History period notice).
      await early.migrate(MIGRATIONS.slice(0, MIGRATIONS.findIndex((migration) => migration.name === "HistoryPeriod1740000000033")));

      const trips = await early.sql<{ names: string; name: string | null; total: string | null; started_at: Date }>(
        `select string_agg(i.name, ',' order by i.name) as names, r.name, r.total, r.started_at
           from trip_receipts r join items i on i.receipt_id = r.id
          where r.home_id = $1
          group by r.id order by r.started_at`,
        [home.homeId],
      );
      expect(trips.map((trip) => trip.names)).toEqual(["a1,a2,a3", "b1,b2", "c1", "d1"]);
      expect(trips[0].started_at.toISOString()).toBe(at(0).toISOString());
      expect(trips[2]).toMatchObject({ name: "Carrefour", total: "20.000" });
      const [{ count }] = await early.sql<{ count: string }>(
        `select count(*) from items where status = 'bought' and receipt_id is null`,
      );
      expect(count).toBe("0");
      // A one-off regrouping: no versions stamped.
      const [{ version }] = await early.sql<{ version: string }>(`select version from homes where id = $1`, [home.homeId]);
      expect(version).toBe(before);
    } finally {
      await early.drop();
    }
  });
});

describe("HomeProducts migration", () => {
  it("makes one product per name, newest name and category, newest price, purchase count", async () => {
    const upTo = MIGRATIONS.findIndex((migration) => migration.name === "HomeProducts1740000000028");
    const early = await createTestDatabase(MIGRATIONS.slice(0, upTo));
    try {
      const home = await seedHome(early, "products");
      const buy = async (name: string, day: number, cost: number | null, category = "vegetables") => {
        await early.sql(
          `insert into items (home_id, list_id, name, quantity, unit, category, status, added_by, bought_at, cost)
           values ($1, $2, $3, 2, 'kg', $4, 'bought', $5, $6, $7)`,
          [home.homeId, home.listId, name, category, home.userId, new Date(Date.UTC(2026, 9, day)), cost],
        );
      };
      await buy("tomatoes", 1, 1.5);
      await buy("Tomatoes ", 5, null, "supermarket");
      await buy("TOMATOES", 3, 2.25);
      await buy("خُبْز", 2, 0.5, "supermarket");
      await buy("خبز", 4, null, "supermarket");

      await early.migrate();

      const products = await early.sql<Record<string, unknown>>(
        `select name_key, name, category, last_cost, last_cost_qty, last_cost_unit, times_bought
           from home_products where home_id = $1 order by name_key`,
        [home.homeId],
      );
      expect(products).toEqual([
        {
          name_key: "tomatoes",
          name: "Tomatoes",
          category: "supermarket",
          last_cost: "2.250",
          last_cost_qty: "2.00",
          last_cost_unit: "kg",
          times_bought: 3,
        },
        {
          name_key: "خبز",
          name: "خبز",
          category: "supermarket",
          last_cost: "0.500",
          last_cost_qty: "2.00",
          last_cost_unit: "kg",
          times_bought: 2,
        },
      ]);
    } finally {
      await early.drop();
    }
  });
});

describe("HistoryPeriod migration", () => {
  it("moves existing homes to 3 months after a notice from 12, and starts new homes on 3", async () => {
    const upTo = MIGRATIONS.findIndex((migration) => migration.name === "HistoryPeriod1740000000033");
    const early = await createTestDatabase(MIGRATIONS.slice(0, upTo));
    try {
      const existing = await seedHome(early, "existing");
      await early.migrate();
      const [old] = await early.sql<Record<string, unknown>>(
        `select history_months, history_months_before, history_months_changed_at > now() - interval '1 minute' as recent
           from homes where id = $1`,
        [existing.homeId],
      );
      expect(old).toEqual({ history_months: 3, history_months_before: 12, recent: true });
      const created = await seedHome(early, "new");
      const [fresh] = await early.sql<Record<string, unknown>>(
        `select history_months, history_months_before, history_months_changed_at from homes where id = $1`,
        [created.homeId],
      );
      expect(fresh).toEqual({ history_months: 3, history_months_before: null, history_months_changed_at: null });
      await expect(early.sql(`update homes set history_months = 4 where id = $1`, [created.homeId])).rejects.toThrow();
    } finally {
      await early.drop();
    }
  });
});
