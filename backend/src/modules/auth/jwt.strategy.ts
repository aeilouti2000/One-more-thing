import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AppConfig } from "../../config/env";
import { AUTH_REPOSITORY, type IAuthRepository } from "./repo/auth-repo/auth.repository";

type AccessPayload = { sub: string; email: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig, true>,
    @Inject(AUTH_REPOSITORY) private readonly auth: IAuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("JWT_ACCESS_SECRET", { infer: true }),
    });
  }

  async validate(payload: AccessPayload) {
    const user = await this.auth.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({ code: "NOT_SIGNED_IN", message: "Sign in required" });
    }
    return user;
  }
}
