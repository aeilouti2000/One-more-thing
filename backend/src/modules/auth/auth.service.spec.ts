import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { HttpException } from "@nestjs/common";
import { AuthService } from "./services/auth.service";

describe("AuthService", () => {
  const auth = {
    findUserByEmail: jest.fn<(email: string) => Promise<{ id: string } | null>>(),
  };
  const jwt = { signAsync: jest.fn<(payload: object, options: object) => Promise<string>>() };
  const config = { get: jest.fn(() => "15m") };

  const service = new AuthService(auth as never, jwt as never, config as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects a duplicate email", async () => {
    auth.findUserByEmail.mockResolvedValue({ id: "user-1" });

    await expect(
      service.signUp("Ada", "ada@example.com", "secret1"),
    ).rejects.toMatchObject({
      response: { code: "EMAIL_TAKEN" },
    });
  });

  it("rejects a password that does not change", async () => {
    await expect(
      service.changePassword("user-1", "secret1", "secret1"),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
