// Tests that need a real Postgres (triggers, migrations, SQL). They create and
// drop their own throwaway database. Run with `npm run test:db` while the
// local database is up (`docker compose up db`).
const base = require("./package.json").jest;

module.exports = {
  ...base,
  testRegex: ".*\\.db-spec\\.ts$",
  testTimeout: 60000,
};
