import { randomBytes } from "node:crypto";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createTestDatabase, type TestDatabase } from "./test-database";

/**
 * The whole API, started exactly as in production, against a throwaway
 * database. For tests whose answer depends on real SQL.
 */
export type TestApi = {
  t: TestDatabase;
  call: <T = any>(method: string, path: string, options?: { token?: string; body?: unknown; headers?: Record<string, string> }) => Promise<{ status: number; body: T }>;
  /** Signs up a new person and returns their access token and id. */
  signUp: (name?: string) => Promise<{ token: string; userId: string }>;
  close: () => Promise<void>;
};

export async function startTestApi(): Promise<TestApi> {
  const t = await createTestDatabase();
  const url = (t.db.options as { url: string }).url;
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: url,
    DATABASE_SSL: "false",
    JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef",
    CRON_SECRET: "test-cron-secret",
    CORS_ORIGINS: "",
  });
  // Imported here so the env above is in place when the config is validated.
  const { AppModule } = await import("../../app.module");
  const { configureApp } = await import("../../app.setup");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error"] });
  configureApp(app, { log: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api`;
  Logger.overrideLogger(["error"]);

  const call: TestApi["call"] = async (method, path, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        // Each test person gets their own address, so the sign-in rate limit is per person.
        "x-forwarded-for": `10.0.${randomBytes(1)[0]}.${randomBytes(1)[0]}`,
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  const signUp: TestApi["signUp"] = async (name = "Tester") => {
    const response = await call<{ accessToken: string; user: { id: string } }>("POST", "/auth/signup", {
      body: { name, email: `t${randomBytes(5).toString("hex")}`, password: "test-password-1" },
    });
    if (response.status >= 300) throw new Error(`sign up failed: ${JSON.stringify(response.body)}`);
    return { token: response.body.accessToken, userId: response.body.user.id };
  };

  return {
    t,
    call,
    signUp,
    close: async () => {
      await app.close();
      await t.drop();
    },
  };
}
