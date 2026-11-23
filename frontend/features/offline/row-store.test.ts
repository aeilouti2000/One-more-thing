import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { RowStore, SCHEMA_VERSION, type RowDatabase } from "@/features/offline/row-store";

/** The store's tiny database interface over Node's built-in SQLite. */
function memoryDb(): RowDatabase & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  return {
    raw,
    execSync: (sql) => raw.exec(sql),
    runSync: (sql, params) => raw.prepare(sql).run(...params),
    getAllSync: <T,>(sql: string, params: (string | number | null)[] = []) => raw.prepare(sql).all(...params) as T[],
    withTransactionSync: (work) => {
      raw.exec("begin");
      try {
        work();
        raw.exec("commit");
      } catch (error) {
        raw.exec("rollback");
        throw error;
      }
    },
  };
}

const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, ...extra });
const KEY = ["items", "home-1"];

test("a list is saved row by row and comes back in its order", () => {
  const db = memoryDb();
  const store = new RowStore(db);
  const rows = [item("b"), item("a"), item("c")];
  store.save("user-1", [{ key: KEY, value: rows }, { key: ["lists", "home-1"], value: [{ id: "L", name: "Weekly" }] }]);

  const loaded = new RowStore(db).load();
  assert.equal(loaded.owner, "user-1");
  const items = loaded.entries.find((entry) => entry.key[0] === "items");
  assert.deepEqual(items?.value, rows);
  assert.deepEqual(loaded.entries.find((entry) => entry.key[0] === "lists")?.value, [{ id: "L", name: "Weekly" }]);
});

test("changing one item writes one row; unchanged objects are not written again", () => {
  const db = memoryDb();
  const store = new RowStore(db);
  const a = item("a");
  const b = item("b");
  const c = item("c");
  store.save("u", [{ key: KEY, value: [a, b, c] }]);
  const writes = store.save("u", [{ key: KEY, value: [a, { ...b, name: "B!" }, c] }]);
  assert.equal(writes, 1);
  const [row] = db.getAllSync<{ value: string }>(`select value from list_rows where id = 'b'`);
  assert.equal(JSON.parse(row.value).name, "B!");
});

test("a removed item is deleted and a new order is saved once", () => {
  const db = memoryDb();
  const store = new RowStore(db);
  const a = item("a");
  const b = item("b");
  const c = item("c");
  store.save("u", [{ key: KEY, value: [a, b, c] }]);
  const writes = store.save("u", [{ key: KEY, value: [c, a] }]);
  assert.equal(writes, 2); // one deleted row, one order entry
  const loaded = new RowStore(db).load();
  assert.deepEqual(loaded.entries.find((entry) => entry.key[0] === "items")?.value, [c, a]);
});

test("pending changes are saved in order and the whole outbox is replaced", () => {
  const db = memoryDb();
  const store = new RowStore(db);
  store.save("u", [], [{ n: 1 }, { n: 2 }]);
  store.save("u", [], [{ n: 2 }, { n: 3 }]);
  assert.deepEqual(new RowStore(db).load().mutations, [{ n: 2 }, { n: 3 }]);
});

test("a removed entry goes with its rows", () => {
  const db = memoryDb();
  const store = new RowStore(db);
  store.save("u", [{ key: KEY, value: [item("a")] }]);
  store.save("u", [{ key: KEY, value: undefined }]);
  assert.equal(new RowStore(db).load().entries.length, 0);
});

test("after a restore, the first change writes only what changed", () => {
  const db = memoryDb();
  new RowStore(db).save("u", [{ key: KEY, value: [item("a"), item("b")] }]);
  const store = new RowStore(db);
  const restored = store.load().entries.find((entry) => entry.key[0] === "items")?.value as { id: string }[];
  const writes = store.save("u", [{ key: KEY, value: [restored[0], { ...restored[1], name: "x" }] }]);
  assert.equal(writes, 1);
});

test("a copy written by a newer app version is not used", () => {
  const db = memoryDb();
  new RowStore(db).save("u", [{ key: KEY, value: [item("a")] }]);
  db.runSync(`update meta set value = ? where name = 'schema'`, [String(SCHEMA_VERSION + 1)]);
  assert.equal(new RowStore(db).load().entries.length, 0);
});

test("clear forgets everything", () => {
  const db = memoryDb();
  const store = new RowStore(db);
  store.save("u", [{ key: KEY, value: [item("a")] }], [{ n: 1 }]);
  store.clear();
  const loaded = new RowStore(db).load();
  assert.deepEqual([loaded.entries.length, loaded.mutations.length, loaded.owner], [0, 0, null]);
});

test("after a failed write, the next save writes every row again and leaves no stale row", () => {
  const db = memoryDb();
  const store = new RowStore(db);
  const a = item("a");
  const b = item("b");
  store.save("u", [{ key: KEY, value: [a, b] }]);

  // The disk fails in the middle of the next save: nothing of it is kept.
  const run = db.runSync;
  let calls = 0;
  db.runSync = (sql, params) => {
    calls += 1;
    if (calls === 2) throw new Error("disk full");
    return run(sql, params);
  };
  const c = item("c");
  assert.throws(() => store.save("u", [{ key: KEY, value: [a, c] }]), /disk full/);
  db.runSync = run;
  assert.deepEqual(
    db.getAllSync<{ id: string }>(`select id from list_rows order by id`).map((row) => row.id),
    ["a", "b"],
  );

  // The retry holds the same objects; without the reset it would skip them.
  store.save("u", [{ key: KEY, value: [a, c] }]);
  const loaded = new RowStore(db).load();
  assert.deepEqual(loaded.entries.find((entry) => entry.key[0] === "items")?.value, [a, c]);
});
