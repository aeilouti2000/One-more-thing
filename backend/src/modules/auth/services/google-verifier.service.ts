import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import type { AppConfig } from "../../../config/env";
import { DomainError } from "../../../common/domain.error";

export type GoogleIdentity = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

/** Checks a Google ID token's signature, expiry and audience. */
@Injectable()
export class GoogleVerifier {
  private readonly logger = new Logger(GoogleVerifier.name);
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const audience = this.config
      .get("GOOGLE_CLIENT_ID", { infer: true })
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (audience.length === 0) {
      throw new DomainError("GOOGLE_UNAVAILABLE", "Google sign-in is not set up", HttpStatus.SERVICE_UNAVAILABLE);
    }

    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (!payload?.sub) throw new Error("Token has no subject");
      return {
        sub: payload.sub,
        email: payload.email?.toLowerCase() ?? null,
        emailVerified: payload.email_verified === true,
        name: payload.name ?? payload.given_name ?? null,
      };
    } catch (error) {
      this.logger.warn(`Google token rejected: ${error instanceof Error ? error.message : String(error)}`);
      throw new DomainError("GOOGLE_TOKEN_INVALID", "Google sign-in failed. Try again.", HttpStatus.UNAUTHORIZED);
    }
  }
}
