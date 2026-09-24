import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import bcrypt from "bcrypt";
import { IsNull, QueryFailedError, Repository } from "typeorm";
import type { AppConfig } from "../../config/env";
import { DomainError } from "../../common/domain.error";
import { randomToken, sha256 } from "../../common/crypto";
import { User } from "../../users/user.entity";
import { RefreshToken } from "./refresh-token.entity";

const BCRYPT_ROUNDS = 12;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async signUp(name: string, email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.users.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      throw new DomainError("EMAIL_TAKEN", "Email is already in use", HttpStatus.CONFLICT);
    }

    const user = await this.users.save(
      this.users.create({
        email: normalizedEmail,
        name: name.trim() || "Member",
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      }),
    ).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new DomainError("EMAIL_TAKEN", "Email is already in use", HttpStatus.CONFLICT);
      }
      throw error;
    });

    return this.createSession(user);
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.users.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !matches) {
      throw new DomainError("INVALID_CREDENTIALS", "Wrong email or password", HttpStatus.UNAUTHORIZED);
    }
    return this.createSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const tokenHash = sha256(refreshToken);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });
    if (!stored) {
      throw new DomainError("INVALID_TOKEN", "Refresh token is invalid", HttpStatus.UNAUTHORIZED);
    }
    if (stored.revokedAt) {
      await this.refreshTokens.update({ userId: stored.userId, revokedAt: IsNull() }, { revokedAt: new Date() });
      throw new DomainError("INVALID_TOKEN", "Refresh token is invalid", HttpStatus.UNAUTHORIZED);
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new DomainError("INVALID_TOKEN", "Refresh token is expired", HttpStatus.UNAUTHORIZED);
    }

    stored.revokedAt = new Date();
    await this.refreshTokens.save(stored);

    const user = await this.users.findOne({ where: { id: stored.userId } });
    if (!user) {
      throw new DomainError("INVALID_TOKEN", "Refresh token is invalid", HttpStatus.UNAUTHORIZED);
    }
    return this.createSession(user);
  }

  async logout(refreshToken: string) {
    await this.refreshTokens.update({ tokenHash: sha256(refreshToken) }, { revokedAt: new Date() });
    return { signedOut: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (currentPassword === newPassword) {
      throw new DomainError("PASSWORD_UNCHANGED", "New password must be different", HttpStatus.BAD_REQUEST);
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new DomainError("NOT_SIGNED_IN", "Sign in required", HttpStatus.UNAUTHORIZED);
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new DomainError("CURRENT_PASSWORD_WRONG", "Current password is wrong", HttpStatus.UNAUTHORIZED);
    }
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.save(user);
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    return { updated: true };
  }

  async updateProfile(userId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new DomainError("NAME_REQUIRED", "Name is required", HttpStatus.BAD_REQUEST);
    }
    await this.users.update(userId, { name: trimmed });
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    return this.toPublicUser(user);
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }

  private async createSession(user: User): Promise<AuthSession> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
        expiresIn: this.config.get("JWT_ACCESS_TTL", { infer: true }),
      },
    );
    const refreshToken = randomToken(48);
    const days = this.config.get("JWT_REFRESH_TTL_DAYS", { infer: true });
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        revokedAt: null,
      }),
    );
    return { accessToken, refreshToken, user: this.toPublicUser(user) };
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof QueryFailedError && (error.driverError as { code?: string } | undefined)?.code === "23505";
}
