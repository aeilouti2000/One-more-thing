import { describe, expect, it } from "@jest/globals";
import cases from "./emoji.cases.json";
import { isSingleEmoji } from "./emoji";

describe("isSingleEmoji", () => {
  it.each(cases as [string, boolean][])("%j → %s", (input, expected) => {
    expect(isSingleEmoji(input)).toBe(expected);
  });
});
