import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../../common/domain.error";
import { ItemsService } from "./services/items.service";

type ItemRow = {
  id: string;
  homeId: string;
  status: "needed" | "bought";
  category: string;
  unit: string | null;
};

describe("Bulk edits: category and unit for many items", () => {
  let rows: ItemRow[];
  let member: boolean;
  let usableCategories: string[];

  const itemsRepo = {
    findNeededByIds: jest.fn(async (ids: string[], homeId: string) =>
      rows
        .filter((row) => ids.includes(row.id) && row.homeId === homeId && row.status === "needed")
        .map((row) => ({ ...row })),
    ),
    // Like the real one: only the named columns, only items still needed.
    patchNeeded: jest.fn(async (ids: string[], homeId: string, changes: Partial<ItemRow>) => {
      const targets = rows.filter(
        (row) => ids.includes(row.id) && row.homeId === homeId && row.status === "needed",
      );
      for (const target of targets) Object.assign(target, changes);
      return targets.length;
    }),
  };
  const homes = {
    requireMembership: jest.fn(async () => {
      if (!member) throw new Error("not a member");
      return { homeId: "h1" };
    }),
  };
  const categories = {
    assertUsable: jest.fn(async (_homeId: string, category: string) => {
      if (usableCategories.includes(category)) return;
      throw new DomainError("CATEGORY_NOT_FOUND", "That category was not found.", HttpStatus.BAD_REQUEST);
    }),
  };
  const itemRows = {
    // The items' own home: In(ids) arrives as a FindOperator.
    find: jest.fn(async ({ where }: { where: { id: { value: string[] } } }) =>
      rows
        .filter((row) => where.id.value.includes(row.id))
        .map((row) => ({ id: row.id, homeId: row.homeId })),
    ),
  };
  const service = new ItemsService(
    itemsRepo as never,
    {} as never,
    homes as never,
    {} as never,
    {} as never,
    categories as never,
    {} as never,
    itemRows as never,
  );

  const row = (id: string) => rows.find((entry) => entry.id === id) as ItemRow;

  beforeEach(() => {
    member = true;
    usableCategories = ["other", "vegetables", "meat"];
    rows = [
      { id: "tomato", homeId: "h1", status: "needed", category: "other", unit: null },
      { id: "cucumber", homeId: "h1", status: "needed", category: "vegetables", unit: "kg" },
      { id: "milk", homeId: "h1", status: "bought", category: "other", unit: null },
      { id: "stranger", homeId: "h2", status: "needed", category: "other", unit: null },
    ];
    jest.clearAllMocks();
  });

  describe("category", () => {
    it("moves every selected item to the category", async () => {
      const result = await service.setManyCategory("u1", ["tomato", "cucumber"], "vegetables");
      expect(result).toEqual({ updated: 2 });
      expect(row("tomato").category).toBe("vegetables");
      expect(row("cucumber").category).toBe("vegetables");
    });

    it("writes only the items that actually change", async () => {
      await service.setManyCategory("u1", ["tomato", "cucumber"], "vegetables");
      expect(itemsRepo.patchNeeded).toHaveBeenCalledWith(["tomato"], "h1", { category: "vegetables" });
    });

    it("counts a repeated id once", async () => {
      const result = await service.setManyCategory("u1", ["tomato", "tomato"], "meat");
      expect(result).toEqual({ updated: 1 });
      expect(itemsRepo.patchNeeded).toHaveBeenCalledWith(["tomato"], "h1", { category: "meat" });
    });

    it("refuses a category the home cannot use, and changes nothing", async () => {
      await expect(service.setManyCategory("u1", ["tomato"], "removed")).rejects.toMatchObject({
        response: { code: "CATEGORY_NOT_FOUND" },
      });
      expect(row("tomato").category).toBe("other");
      expect(itemsRepo.patchNeeded).not.toHaveBeenCalled();
    });

    it("refuses when one of the items is already bought, and changes nothing", async () => {
      await expect(service.setManyCategory("u1", ["tomato", "milk"], "meat")).rejects.toMatchObject({
        response: { code: "ITEM_NOT_FOUND" },
      });
      expect(row("tomato").category).toBe("other");
    });

    it("refuses items from more than one home", async () => {
      await expect(service.setManyCategory("u1", ["tomato", "stranger"], "meat")).rejects.toMatchObject({
        response: { code: "ITEM_NOT_FOUND" },
      });
      expect(itemsRepo.patchNeeded).not.toHaveBeenCalled();
    });

    it("answers like a missing item for someone outside the home", async () => {
      member = false;
      await expect(service.setManyCategory("u9", ["tomato"], "meat")).rejects.toMatchObject({
        response: { code: "ITEM_NOT_FOUND" },
      });
      expect(row("tomato").category).toBe("other");
    });

    it("refuses an id that does not exist", async () => {
      await expect(service.setManyCategory("u1", ["tomato", "ghost"], "meat")).rejects.toMatchObject({
        response: { code: "ITEM_NOT_FOUND" },
      });
    });
  });

  it("leaves every other column alone, so a purchase made meanwhile is not undone", async () => {
    // The other phone buys the tomato after this request has read it as needed.
    itemsRepo.findNeededByIds.mockImplementationOnce(async () => {
      const stale = rows.filter((entry) => entry.id === "tomato").map((entry) => ({ ...entry }));
      row("tomato").status = "bought";
      return stale;
    });
    await service.setManyCategory("u1", ["tomato"], "meat");
    expect(row("tomato").status).toBe("bought");
    expect(row("tomato").category).toBe("other");
  });

  describe("unit", () => {
    it("gives every selected item the unit", async () => {
      const result = await service.setManyUnit("u1", ["tomato", "cucumber"], "kg");
      expect(result).toEqual({ updated: 2 });
      expect(row("tomato").unit).toBe("kg");
      expect(row("cucumber").unit).toBe("kg");
      // The cucumber was already in kg.
      expect(itemsRepo.patchNeeded).toHaveBeenCalledWith(["tomato"], "h1", { unit: "kg" });
    });

    it("clears the unit with a blank value", async () => {
      await service.setManyUnit("u1", ["tomato", "cucumber"], "  ");
      expect(row("tomato").unit).toBeNull();
      expect(row("cucumber").unit).toBeNull();
      // The tomato had no unit to clear.
      expect(itemsRepo.patchNeeded).toHaveBeenCalledWith(["cucumber"], "h1", { unit: null });
    });

    it("trims the unit before saving", async () => {
      await service.setManyUnit("u1", ["tomato"], " box ");
      expect(row("tomato").unit).toBe("box");
    });

    it("refuses when one of the items is already bought, and changes nothing", async () => {
      await expect(service.setManyUnit("u1", ["tomato", "milk"], "kg")).rejects.toMatchObject({
        response: { code: "ITEM_NOT_FOUND" },
      });
      expect(row("tomato").unit).toBeNull();
    });

    it("answers like a missing item for someone outside the home", async () => {
      member = false;
      await expect(service.setManyUnit("u9", ["tomato"], "kg")).rejects.toMatchObject({
        response: { code: "ITEM_NOT_FOUND" },
      });
    });
  });
});
