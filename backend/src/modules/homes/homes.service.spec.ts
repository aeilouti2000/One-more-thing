import { HomesService } from "./homes.service";

describe("HomesService", () => {
  const members = { findOne: jest.fn(), delete: jest.fn() };
  const service = new HomesService({} as never, members as never);

  beforeEach(() => jest.clearAllMocks());

  it("blocks a host from removing themselves", async () => {
    await expect(service.removeMember("host", "home", "host")).rejects.toMatchObject({
      response: { code: "HOST_CANNOT_REMOVE_SELF" },
    });
  });

  it("blocks a partner from removing members", async () => {
    members.findOne.mockResolvedValue({ role: "partner" });

    await expect(service.removeMember("partner", "home", "other")).rejects.toMatchObject({
      response: { code: "ONLY_HOST_CAN_REMOVE" },
    });
  });
});
