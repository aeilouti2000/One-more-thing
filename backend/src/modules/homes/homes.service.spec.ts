import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { HomesService } from "./services/homes.service";

describe("HomesService", () => {
  const homes = {
    findMember: jest.fn<(homeId: string, userId: string) => Promise<{ role: string } | null>>(),
    deletePartner: jest.fn<(homeId: string, memberId: string) => Promise<number>>(),
    listForUser: jest.fn<(userId: string) => Promise<{ id: string }[]>>(),
    deleteOwnedHome: jest.fn<(userId: string, homeId: string) => Promise<{ home: null }>>(),
    updateHome: jest.fn<(homeId: string, patch: object) => Promise<void>>(),
    loadHome: jest.fn<(homeId: string) => Promise<{ id: string }>>(),
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

  it("blocks a partner from deleting a home", async () => {
    homes.findMember.mockResolvedValue({ role: "partner" });

    await expect(service.deleteHome("partner", "home")).rejects.toMatchObject({
      response: { code: "ONLY_HOST_CAN_DELETE" },
    });
    expect(homes.deleteOwnedHome).not.toHaveBeenCalled();
  });

  it("lets only the host turn home notifications off", async () => {
    homes.findMember.mockResolvedValue({ role: "partner" });
    await expect(service.updateNotificationSettings("partner", "home", false)).rejects.toMatchObject({
      response: { code: "ONLY_HOST_CAN_UPDATE_NOTIFICATIONS" },
    });
    expect(homes.updateHome).not.toHaveBeenCalled();

    homes.findMember.mockResolvedValue({ role: "owner" });
    homes.loadHome.mockResolvedValue({ id: "home" });
    await service.updateNotificationSettings("host", "home", false);
    expect(homes.updateHome).toHaveBeenCalledWith("home", { notificationsEnabled: false });
  });

  it("blocks deleting the last home", async () => {
    homes.findMember.mockResolvedValue({ role: "owner" });
    homes.listForUser.mockResolvedValue([{ id: "home" }]);

    await expect(service.deleteHome("host", "home")).rejects.toMatchObject({
      response: { code: "LAST_HOME" },
    });
    expect(homes.deleteOwnedHome).not.toHaveBeenCalled();
  });

  it("lets a host delete a home when another home remains", async () => {
    homes.findMember.mockResolvedValue({ role: "owner" });
    homes.listForUser.mockResolvedValue([{ id: "home" }, { id: "other" }]);
    homes.deleteOwnedHome.mockResolvedValue({ home: null });

    await service.deleteHome("host", "home");

    expect(homes.deleteOwnedHome).toHaveBeenCalledWith("host", "home");
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
