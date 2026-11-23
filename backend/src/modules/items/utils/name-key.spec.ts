import { describe, expect, it } from "@jest/globals";
import cases from "./name-key.cases.json";
import { nameKey } from "./name-key";

describe("nameKey", () => {
  it.each(cases as [string, string][])("%j becomes %j", (input, expected) => {
    expect(nameKey(input)).toBe(expected);
  });
});
