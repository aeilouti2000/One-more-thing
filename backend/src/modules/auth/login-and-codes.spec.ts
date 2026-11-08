import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as bcrypt from "bcrypt";
import { AuthService } from "./services/auth.service";

type Row = Record<string, unknown> & { id: string };

describe("AuthService login and email codes", () => {
  let users: Row[];
  let code: Row | null;
  const auth = {
    findUserByEmail: jest.fn(async (email: string) => users.find((u) => u.email === email) ?? null),
    findUserByVerifiedEmail: jest.fn(
      async (email: string) => users.find((u) => u.contactEmail === email && u.emailVerifiedAt) ?? null,
    ),
    findUserById: jest.fn(async (id: string) => users.find((u) => u.id === id) ?? null),
    saveUser: jest.fn(async (user: Row) => user),
    saveRefresh: jest.fn(async () => undefined),
    findLatestEmailCode: jest.fn(async () => code),
    claimEmailCodeAttempt: jest.fn(async (_id: string, max: number) => {
      if (!code || (code.attempts as number) >= max) return false;
      code.attempts = (code.attempts as number) + 1;
      return true;
    }),
    markEmailCodeUsed: jest.fn(async () => true),
  };
  const jwt = { signAsync: jest.fn(async () => "access") };
  const config = { get: jest.fn(() => 90) };
  const service = new AuthService(auth as never, jwt as never, config as never, {} as never, {} as never, {} as never);

  beforeEach(async () => {
    users = [{ id: "u1", email: "jane@gmail.com", passwordHash: await bcrypt.hash("secret1", 4) }];
    code = {
      id: "c1",
      email: "jane@gmail.com",
      attempts: 0,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: "not-a-real-hash",
    };
    jest.clearAllMocks();
  });

  it("logs in an older account whose username is an email address", async () => {
    await expect(service.login("Jane@Gmail.com", "secret1")).resolves.toMatchObject({ accessToken: "access" });
  });

  it("stops checking a code after five tries", async () => {
    for (let index = 0; index < 5; index += 1) {
      await expect(service.verifyEmail("u1", "123456")).rejects.toMatchObject({ response: { code: "CODE_INVALID" } });
    }
    await expect(service.verifyEmail("u1", "123456")).rejects.toMatchObject({
      response: { code: "CODE_TOO_MANY_ATTEMPTS" },
    });
  });
});
