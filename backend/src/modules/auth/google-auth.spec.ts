import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AuthService } from "./services/auth.service";

type Row = Record<string, unknown> & { id: string };

describe("AuthService Google sign-in", () => {
  let users: Row[];
  const auth = {
    findUserByEmail: jest.fn(async (email: string) => users.find((u) => u.email === email) ?? null),
    findUserByVerifiedEmail: jest.fn(
      async (email: string) => users.find((u) => u.contactEmail === email && u.emailVerifiedAt) ?? null,
    ),
    findUserByGoogleSub: jest.fn(async (sub: string) => users.find((u) => u.googleSub === sub) ?? null),
    findUserById: jest.fn(async (id: string) => users.find((u) => u.id === id) ?? null),
    saveNewUser: jest.fn(async (input: Record<string, unknown>) => {
      const row = { id: `u${users.length + 1}`, createdAt: new Date(), ...input } as Row;
      users.push(row);
      return row;
    }),
    saveUser: jest.fn(async (user: Row) => user),
    saveRefresh: jest.fn(async () => undefined),
  };
  const jwt = { signAsync: jest.fn(async () => "access") };
  const config = { get: jest.fn(() => 90) };
  const google = { verify: jest.fn<(token: string) => Promise<unknown>>() };
  const service = new AuthService(auth as never, jwt as never, config as never, {} as never, google as never, {} as never);

  beforeEach(() => {
    users = [];
    jest.clearAllMocks();
  });

  it("creates a password-less account with a generated username", async () => {
    users.push({ id: "taken", email: "sara.k" });
    google.verify.mockResolvedValue({ sub: "g1", email: "sara.k@gmail.com", emailVerified: true, name: "Sara" });

    const session = await service.signInWithGoogle("token");

    expect(session.isNew).toBe(true);
    expect(session.user.email).toMatch(/^sara\.k\d+$/);
    expect(session.user).toMatchObject({
      hasPassword: false,
      googleLinked: true,
      emailVerified: true,
      contactEmail: "sara.k@gmail.com",
    });
  });

  it("links an existing account with the same verified email", async () => {
    users.push({ id: "u-old", email: "sara", contactEmail: "sara@gmail.com", emailVerifiedAt: new Date(), passwordHash: "x" });
    google.verify.mockResolvedValue({ sub: "g2", email: "sara@gmail.com", emailVerified: true, name: "Sara" });

    const session = await service.signInWithGoogle("token");

    expect(session.isNew).toBe(false);
    expect(session.user.id).toBe("u-old");
    expect(session.user.googleEmail).toBe("sara@gmail.com");
  });

  it("does not link by an unverified email", async () => {
    users.push({ id: "u-old", email: "sara", contactEmail: "sara@gmail.com", emailVerifiedAt: null });
    google.verify.mockResolvedValue({ sub: "g3", email: "sara@gmail.com", emailVerified: true, name: "Sara" });

    const session = await service.signInWithGoogle("token");

    expect(session.user.id).not.toBe("u-old");
  });

  it("refuses to unlink Google from an account with no password", async () => {
    users.push({ id: "u1", email: "sara", googleSub: "g1", passwordHash: null });
    await expect(service.unlinkGoogle("u1")).rejects.toMatchObject({ response: { code: "LAST_SIGN_IN_METHOD" } });
  });

  it("refuses to link a Google account that belongs to someone else", async () => {
    users.push({ id: "u1", email: "a", googleSub: "g1" }, { id: "u2", email: "b" });
    google.verify.mockResolvedValue({ sub: "g1", email: "a@gmail.com", emailVerified: true, name: "A" });
    await expect(service.linkGoogle("u2", "token")).rejects.toMatchObject({ response: { code: "GOOGLE_IN_USE" } });
  });

  it("deletes only with the linked Google account", async () => {
    users.push({ id: "u1", email: "a", googleSub: "g1", passwordHash: null });
    google.verify.mockResolvedValue({ sub: "other", email: "x@gmail.com", emailVerified: true, name: "X" });
    await expect(service.deleteAccount("u1", { googleIdToken: "t" })).rejects.toMatchObject({
      response: { code: "GOOGLE_MISMATCH" },
    });
  });
});
