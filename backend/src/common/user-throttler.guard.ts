import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { AppConfig } from "../config/env";

type ThrottledRequest = {
  ip?: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
};

/**
 * Counts requests per signed-in user instead of per IP address, so two people
 * shopping on the same Wi-Fi don't use up each other's allowance.
 *
 * Only a token with a valid signature counts as a user; anything else, and
 * every /auth route (login, codes), stays limited per IP address.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  @Inject(ConfigService)
  private readonly config: ConfigService<AppConfig, true>;

  protected async getTracker(req: ThrottledRequest): Promise<string> {
    const ip = req.ip ?? "unknown";
    if (req.path?.startsWith("/api/auth")) return ip;
    const header = req.headers?.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
    const userId = token ? this.verifiedUserId(token) : null;
    return userId ? `user:${userId}` : ip;
  }

  /** The token's user id, when it is signed with our secret and not expired. */
  private verifiedUserId(token: string): string | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [head, body, signature] = parts;
    try {
      const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as { alg?: string };
      if (header.alg !== "HS256") return null;
      const secret = this.config.get("JWT_ACCESS_SECRET", { infer: true });
      const expected = createHmac("sha256", secret).update(`${head}.${body}`).digest();
      const given = Buffer.from(signature, "base64url");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
        sub?: unknown;
        exp?: unknown;
      };
      if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
      return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
