import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeName } from "@/features/items/utils/insights";

// The server keys names the same way (backend/src/modules/items/utils/name-key.ts).
// Both test suites read this one list, so the two rules cannot drift apart.
const cases = JSON.parse(
  readFileSync(new URL("../../../../backend/src/modules/items/utils/name-key.cases.json", import.meta.url), "utf8"),
) as [string, string][];

test("normalizeName gives the server's name key for every shared case", () => {
  for (const [input, expected] of cases) {
    assert.equal(normalizeName(input), expected, JSON.stringify(input));
  }
});
