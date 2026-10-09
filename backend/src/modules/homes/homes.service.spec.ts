import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { HomesService } from "./services/homes.service";

describe("HomesService", () => {
  const homes = {
    findMember: jest.fn<(homeId: string, userId: string) => Promise<{ role: string } | null>>(),
    deletePartner: jest.fn<(homeId: string, memberId: string) => Promise<number>>(),
  };
  const service = new HomesService(homes as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks a host from removing themselves", async () => {
    await expect(
      service.removeMember("host", "home", "host"),
    ).rejects.toMatchObject({
      response: { code: "HOST_CANNOT_REMOVE_SELF" },
    });
  });

  it("blocks a partner from renaming a home", async () => {
    homes.findMember.mockResolvedValue({ role: "partner" });

    await expect(service.updateName("partner", "home", "New name")).rejects.toMatchObject({
      response: { code: "ONLY_HOST_CAN_RENAME" },
    });
  });

  it("blocks a partner from removing members", async () => {
    homes.findMember.mockResolvedValue({ role: "partner" });

    await expect(
      service.removeMember("partner", "home", "other"),
    ).rejects.toMatchObject({
      response: { code: "ONLY_HOST_CAN_REMOVE" },
    });
  });
});
