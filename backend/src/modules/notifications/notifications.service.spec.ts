import { noticeCopy } from "./notifications.service";

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
  });
});
