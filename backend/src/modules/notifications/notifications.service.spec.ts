import { describe, expect, it } from "@jest/globals";
import { noticeCopy } from "./services/notifications.service";

describe("noticeCopy", () => {
  it("describes a new item and an urgent mark", () => {
    expect(noticeCopy("en", "added", "Alex", "Milk")).toEqual({
      title: "New item",
      body: "Alex added Milk",
    });
    expect(noticeCopy("en", "urgent", "Alex", "Milk")).toEqual({
      title: "Urgent item",
      body: "Alex marked Milk urgent",
    });
    expect(noticeCopy("ar", "added_urgent", "أحمد", "حليب").title).toBe("عنصر عاجل");
    expect(noticeCopy("en", "due", "", "Milk")).toEqual({
      title: "Back on the list",
      body: "Milk is due",
    });
    expect(noticeCopy("ar", "due", "", "حليب")).toEqual({
      title: "عاد إلى القائمة",
      body: "حان موعد حليب",
    });
  });
});
