// Runs the pending migrations against DATABASE_URL, the way the server does
// when it starts. Used to rehearse migrations on a copy of a database.
//
//   DATABASE_URL=postgres://omt:omt@localhost:5432/omt_rehearsal npx ts-node --transpile-only scripts/migrate.ts
import "reflect-metadata";
import { DataSource } from "typeorm";
import { MIGRATIONS } from "../src/database/migrations";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL");
  const dataSource = new DataSource({
    type: "postgres",
    url,
    migrations: MIGRATIONS,
    migrationsTransactionMode: "each",
    logging: ["error", "migration"],
  });
  await dataSource.initialize();
  const started = Date.now();
  const ran = await dataSource.runMigrations();
  console.log(`ran ${ran.length} migrations in ${Date.now() - started} ms: ${ran.map((m) => m.name).join(", ") || "none"}`);
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
