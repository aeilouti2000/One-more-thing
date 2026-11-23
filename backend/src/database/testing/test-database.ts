import { randomBytes } from "node:crypto";
import "reflect-metadata";
import { DataSource, type MigrationInterface } from "typeorm";
import { MIGRATIONS } from "../migrations";

/**
 * A throwaway Postgres database for tests that need real SQL (triggers,
 * migrations, queries). It is created empty, migrated, and dropped afterwards.
 *
 * Needs a local Postgres: `docker compose up db` in backend/. The admin
 * address can be changed with TEST_DATABASE_ADMIN_URL.
 */
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://omt:omt@localhost:5432/postgres";

export type TestDatabase = {
  db: DataSource;
  /** Runs SQL and returns the rows. */
  sql: <T = Record<string, unknown>>(query: string, params?: unknown[]) => Promise<T[]>;
  /** Runs migrations not run yet (for tests that seed data between migrations). */
  migrate: (migrations?: (new () => MigrationInterface)[]) => Promise<void>;
  drop: () => Promise<void>;
};

export async function createTestDatabase(
  migrations: (new () => MigrationInterface)[] = MIGRATIONS,
): Promise<TestDatabase> {
  const name = `omt_test_${randomBytes(4).toString("hex")}`;
  const admin = new DataSource({ type: "postgres", url: ADMIN_URL });
  await admin.initialize();
  await admin.query(`create database ${name}`);
  await admin.destroy();

  const url = ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
  let db = await open(url, migrations);

  return {
    get db() {
      return db;
    },
    sql: (query, params) => db.query(query, params),
    migrate: async (next = MIGRATIONS) => {
      await db.destroy();
      db = await open(url, next);
    },
    drop: async () => {
      if (db.isInitialized) await db.destroy();
      const cleanup = new DataSource({ type: "postgres", url: ADMIN_URL });
      await cleanup.initialize();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.destroy();
    },
  };
}

async function open(url: string, migrations: (new () => MigrationInterface)[]) {
  const db = new DataSource({
    type: "postgres",
    url,
    migrations,
    migrationsTransactionMode: "each",
  });
  await db.initialize();
  await db.runMigrations();
  return db;
}

/** A user, a home with that user as owner, and one list. */
export async function seedHome(t: TestDatabase, label = "a") {
  const [user] = await t.sql<{ id: string }>(
    `insert into users (email, name) values ($1, $2) returning id`,
    [`${label}-${randomBytes(3).toString("hex")}@example.test`, `User ${label}`],
  );
  const [home] = await t.sql<{ id: string }>(
    `insert into homes (name, invite_code) values ($1, $2) returning id`,
    [`Home ${label}`, randomBytes(4).toString("hex")],
  );
  await t.sql(`insert into home_members (home_id, user_id, role) values ($1, $2, 'owner')`, [home.id, user.id]);
  const [list] = await t.sql<{ id: string }>(
    `insert into lists (home_id, name) values ($1, 'Weekly') returning id`,
    [home.id],
  );
  return { userId: user.id, homeId: home.id, listId: list.id };
}
