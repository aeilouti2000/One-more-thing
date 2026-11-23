/**
 * The phone's saved copy, kept in SQLite tables instead of one long text.
 *
 * - `entries`: one row per cache entry (household, lists, categories, …).
 * - `list_rows`: item, product and trip lists, one row per element, so a
 *   change to one item writes one row. The order of a list is one small entry
 *   (`order:<key>`), written only when the order changes.
 * - `outbox`: the changes still waiting to be sent, one row each.
 * - `meta`: whose copy this is and when it was saved.
 *
 * Everything here is plain logic over a tiny database interface, so it is
 * tested with an in-memory stand-in (row-store.test.ts); on the phone the
 * database is expo-sqlite (see sqlite-db.ts).
 */
export interface RowDatabase {
  execSync(sql: string): void;
  runSync(sql: string, params: (string | number | null)[]): unknown;
  getAllSync<T>(sql: string, params?: (string | number | null)[]): T[];
  withTransactionSync(work: () => void): void;
}

export const SCHEMA_VERSION = 1;

/** Cache entries whose value is a list of rows with an `id`, saved row by row. */
export const ROW_KINDS = new Set(["items", "products", "trips"]);

export type SavedCopy = {
  owner: string | null;
  savedAt: number;
  entries: { key: unknown[]; value: unknown }[];
  mutations: unknown[];
};

export function openSchema(db: RowDatabase) {
  db.execSync(`
    create table if not exists meta (name text primary key, value text);
    create table if not exists entries (key text primary key, value text not null);
    create table if not exists list_rows (list_key text not null, id text not null, value text not null, primary key (list_key, id));
    create table if not exists outbox (position integer primary key, value text not null);
  `);
  const [row] = db.getAllSync<{ value: string }>(`select value from meta where name = 'schema'`);
  const version = row ? Number(row.value) : 0;
  if (version > SCHEMA_VERSION) {
    // Written by a newer app (after a downgrade): start from a fresh copy.
    db.withTransactionSync(() => {
      db.runSync(`delete from entries`, []);
      db.runSync(`delete from list_rows`, []);
      db.runSync(`delete from meta`, []);
    });
  }
  if (version !== SCHEMA_VERSION) {
    db.runSync(`insert or replace into meta (name, value) values ('schema', ?)`, [String(SCHEMA_VERSION)]);
  }
}

const keyText = (key: unknown[]) => JSON.stringify(key);
const orderKey = (key: unknown[]) => `order:${keyText(key)}`;

function isRowList(key: unknown[], value: unknown): value is { id: string }[] {
  return (
    typeof key[0] === "string" &&
    ROW_KINDS.has(key[0]) &&
    Array.isArray(value) &&
    value.every((row) => row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string")
  );
}

/**
 * Writes cache entries, remembering what it wrote so the next write of the
 * same list only touches rows whose object changed.
 */
export class RowStore {
  /** Per list key: id → the row object last written, and the order last written. */
  private written = new Map<string, { rows: Map<string, unknown>; order: string }>();

  private readonly db: RowDatabase;

  constructor(db: RowDatabase) {
    this.db = db;
    openSchema(db);
  }

  load(): SavedCopy {
    const meta = new Map(this.db.getAllSync<{ name: string; value: string }>(`select name, value from meta`).map((row) => [row.name, row.value]));
    const entries: SavedCopy["entries"] = [];
    const orders = new Map<string, string[]>();
    for (const row of this.db.getAllSync<{ key: string; value: string }>(`select key, value from entries`)) {
      if (row.key.startsWith("order:")) {
        orders.set(row.key.slice("order:".length), JSON.parse(row.value) as string[]);
        continue;
      }
      entries.push({ key: JSON.parse(row.key) as unknown[], value: JSON.parse(row.value) });
    }
    const lists = new Map<string, Map<string, unknown>>();
    for (const row of this.db.getAllSync<{ list_key: string; id: string; value: string }>(`select list_key, id, value from list_rows`)) {
      const rows = lists.get(row.list_key) ?? new Map<string, unknown>();
      rows.set(row.id, JSON.parse(row.value));
      lists.set(row.list_key, rows);
    }
    for (const [listKey, rows] of lists) {
      const order = orders.get(listKey) ?? [];
      const ordered: unknown[] = [];
      for (const id of order) {
        const row = rows.get(id);
        if (row !== undefined) {
          ordered.push(row);
          rows.delete(id);
        }
      }
      ordered.push(...rows.values());
      entries.push({ key: JSON.parse(listKey) as unknown[], value: ordered });
      this.written.set(listKey, {
        rows: new Map(ordered.map((row) => [(row as { id: string }).id, row])),
        order: ordered.map((row) => (row as { id: string }).id).join(","),
      });
    }
    const mutations = this.db
      .getAllSync<{ value: string }>(`select value from outbox order by position`)
      .map((row) => JSON.parse(row.value));
    return {
      owner: meta.get("owner") ?? null,
      savedAt: Number(meta.get("savedAt") ?? 0),
      entries,
      mutations,
    };
  }

  /**
   * After load(), the restored objects are the ones now in memory: remember
   * them as written, so the first change only writes what really changed.
   */
  adoptRestored(key: unknown[], value: unknown) {
    if (!isRowList(key, value)) return;
    this.written.set(keyText(key), {
      rows: new Map(value.map((row) => [row.id, row])),
      order: value.map((row) => row.id).join(","),
    });
  }

  /** Saves changed entries (value undefined: removed) and, when given, the whole outbox. */
  save(owner: string, changes: { key: unknown[]; value: unknown }[], mutations?: unknown[]) {
    try {
      return this.saveAll(owner, changes, mutations);
    } catch (error) {
      // The transaction rolled back, so nothing of it is on disk: forget what
      // was believed written, and the next save writes every row again.
      this.written.clear();
      throw error;
    }
  }

  private saveAll(owner: string, changes: { key: unknown[]; value: unknown }[], mutations?: unknown[]) {
    let writes = 0;
    this.db.withTransactionSync(() => {
      for (const { key, value } of changes) {
        const text = keyText(key);
        if (value === undefined) {
          this.db.runSync(`delete from entries where key = ? or key = ?`, [text, orderKey(key)]);
          this.db.runSync(`delete from list_rows where list_key = ?`, [text]);
          this.written.delete(text);
          writes += 1;
          continue;
        }
        if (isRowList(key, value)) {
          writes += this.saveList(text, key, value);
          continue;
        }
        this.db.runSync(`insert or replace into entries (key, value) values (?, ?)`, [text, JSON.stringify(value)]);
        writes += 1;
      }
      if (mutations) {
        this.db.runSync(`delete from outbox`, []);
        mutations.forEach((mutation, position) => {
          this.db.runSync(`insert into outbox (position, value) values (?, ?)`, [position, JSON.stringify(mutation)]);
        });
        writes += 1;
      }
      this.db.runSync(`insert or replace into meta (name, value) values ('owner', ?)`, [owner]);
      this.db.runSync(`insert or replace into meta (name, value) values ('savedAt', ?)`, [String(Date.now())]);
    });
    return writes;
  }

  clear() {
    this.written.clear();
    this.db.withTransactionSync(() => {
      this.db.runSync(`delete from entries`, []);
      this.db.runSync(`delete from list_rows`, []);
      this.db.runSync(`delete from outbox`, []);
      this.db.runSync(`delete from meta where name <> 'schema'`, []);
    });
  }

  private saveList(text: string, key: unknown[], rows: { id: string }[]) {
    let before = this.written.get(text);
    let writes = 0;
    if (!before) {
      // Nothing is known about this list on disk (first save, or after a failed
      // one): start it clean, so no row from before can linger.
      this.db.runSync(`delete from list_rows where list_key = ?`, [text]);
      before = { rows: new Map<string, unknown>(), order: "" };
      writes += 1;
    }
    const seen = new Set<string>();
    for (const row of rows) {
      seen.add(row.id);
      // The cache keeps an unchanged row as the very same object.
      if (before.rows.get(row.id) === row) continue;
      this.db.runSync(`insert or replace into list_rows (list_key, id, value) values (?, ?, ?)`, [text, row.id, JSON.stringify(row)]);
      writes += 1;
    }
    for (const id of before.rows.keys()) {
      if (seen.has(id)) continue;
      this.db.runSync(`delete from list_rows where list_key = ? and id = ?`, [text, id]);
      writes += 1;
    }
    const order = rows.map((row) => row.id).join(",");
    if (order !== before.order) {
      this.db.runSync(`insert or replace into entries (key, value) values (?, ?)`, [orderKey(key), JSON.stringify(rows.map((row) => row.id))]);
      writes += 1;
    }
    this.written.set(text, { rows: new Map(rows.map((row) => [row.id, row])), order });
    return writes;
  }
}
