import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { createTestDatabase, seedHome, type TestDatabase } from "./testing/test-database";

/**
 * The two frequent trip lookups by last purchase time must be answered from
 * trip_receipts_home_last_idx (migration 032), not by reading every trip of the
 * home. Found by the step 12 lab (docs/perf-lab/s12-writes.sql, s12-changes.sql).
 */
let t: TestDatabase;
let homeId: string;
let listId: string;

beforeAll(async () => {
  t = await createTestDatabase();
  // Many homes, each with a year of trips, so the planner sees a realistic shape.
  const homes = [];
  for (let n = 0; n < 20; n += 1) homes.push(await seedHome(t, `trips-${n}`));
  ({ homeId, listId } = homes[0]);
  for (const home of homes) {
    await t.sql(
      `insert into trip_receipts (home_id, list_id, started_at, last_bought_at)
       select $1, $2, now() - g * interval '12 hours', now() - g * interval '12 hours' + interval '20 minutes'
         from generate_series(1, 700) g`,
      [home.homeId, home.listId],
    );
  }
  await t.sql(`analyze trip_receipts`);
});

afterAll(async () => {
  await t.drop();
});

async function plan(query: string, params: unknown[]) {
  const rows = await t.sql<{ "QUERY PLAN": string }>(`explain ${query}`, params);
  return rows.map((row) => row["QUERY PLAN"]).join("\n");
}

describe("trip lookups by last purchase", () => {
  it("finds the open trip of a list from the index (on every purchase)", async () => {
    // The query in TripsService.attachNewPurchases.
    const text = await plan(
      `select id from trip_receipts
        where home_id = $1 and list_id = $2
          and last_bought_at >= $3 and started_at <= $4
        order by last_bought_at desc
        limit 1`,
      [homeId, listId, new Date(Date.now() - 90 * 60_000), new Date(Date.now() + 90 * 60_000)],
    );
    expect(text).toContain("trip_receipts_home_last_idx");
    expect(text).not.toContain("Sort");
  });

  it("reads the trips of the phone's window from the index (changes answer)", async () => {
    // The query in SyncRepository.trips.
    const text = await plan(
      `select id, list_id, name, total, started_at, last_bought_at
         from trip_receipts
        where home_id = $1 and last_bought_at >= $3 and ($2::bigint is null or version > $2)`,
      [homeId, 5, new Date(Date.now() - 45 * 86_400_000)],
    );
    expect(text).toContain("trip_receipts_home_last_idx");
  });
});
