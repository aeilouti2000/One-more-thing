import { HttpException } from "@nestjs/common";
import { AuthService } from "./auth.service";

function repo() {
  return {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    save: jest.fn(async (value) => value),
    create: jest.fn((value) => value),
    update: jest.fn(),
  };
}

describe("AuthService", () => {
  const users = repo();
  const emailTokens = repo();
  const refreshTokens = repo();
  const jwt = { signAsync: jest.fn() };
  const mail = { sendConfirmation: jest.fn() };
  const config = { get: jest.fn((key: string) => (key === "EMAIL_TOKEN_TTL_HOURS" ? 24 : "15m")) };

  const service = new AuthService(
    users as never,
    emailTokens as never,
    refreshTokens as never,
    jwt as never,
    mail as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects a duplicate email", async () => {
    users.findOne.mockResolvedValue({ id: "user-1" });

    await expect(service.signUp("Ada", "ada@example.com", "secret1")).rejects.toMatchObject({
      response: { code: "EMAIL_TAKEN" },
    });
  });

  it("rejects a password that does not change", async () => {
    await expect(service.changePassword("user-1", "secret1", "secret1")).rejects.toBeInstanceOf(HttpException);
  });
});
