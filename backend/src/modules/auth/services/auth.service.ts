import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import { DataSource, QueryFailedError } from "typeorm";
import { Home } from "../../homes/entities/home.entity";
import { HomeMember } from "../../homes/entities/home-member.entity";
import type { AppConfig } from "../../../config/env";
import { DomainError } from "../../../common/domain.error";
import { randomToken, sha256 } from "../../../common/crypto";
import { User } from "../../../users/user.entity";
import { AUTH_REPOSITORY, type IAuthRepository } from "../repo/auth-repo/auth.repository";

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
    @Inject(AUTH_REPOSITORY) private readonly auth: IAuthRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly dataSource: DataSource,
  ) {}

  async signUp(name: string, email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.auth.findUserByEmail(normalizedEmail);
    if (existing) {
      throw new DomainError("EMAIL_TAKEN", "That username is already taken", HttpStatus.CONFLICT);
    }

    const user = await this.auth.saveNewUser({
      email: normalizedEmail,
      name: name.trim() || "Member",
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new DomainError("EMAIL_TAKEN", "That username is already taken", HttpStatus.CONFLICT);
      }
      throw error;
    });

    return this.createSession(user);
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.auth.findUserByEmail(email.trim().toLowerCase());
    const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !matches) {
      throw new DomainError("INVALID_CREDENTIALS", "Wrong username or password", HttpStatus.UNAUTHORIZED);
    }
    return this.createSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const tokenHash = sha256(refreshToken);
    const stored = await this.auth.findRefreshByHash(tokenHash);
    if (!stored) {
      throw new DomainError("INVALID_TOKEN", "Refresh token is invalid", HttpStatus.UNAUTHORIZED);
    }
    if (stored.revokedAt) {
      throw new DomainError("INVALID_TOKEN", "Refresh token is invalid", HttpStatus.UNAUTHORIZED);
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new DomainError("INVALID_TOKEN", "Refresh token is expired", HttpStatus.UNAUTHORIZED);
    }

    const user = await this.auth.findUserById(stored.userId);
    if (!user) {
      throw new DomainError("INVALID_TOKEN", "Refresh token is invalid", HttpStatus.UNAUTHORIZED);
    }

    const accessToken = await this.signAccessToken(user);
    return { accessToken, refreshToken, user: this.toPublicUser(user) };
  }

  async logout(refreshToken: string) {
    await this.auth.revokeByHash(sha256(refreshToken), new Date());
    return { signedOut: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (currentPassword === newPassword) {
      throw new DomainError("PASSWORD_UNCHANGED", "New password must be different", HttpStatus.BAD_REQUEST);
    }
    const user = await this.auth.findUserById(userId);
    if (!user) {
      throw new DomainError("NOT_SIGNED_IN", "Sign in required", HttpStatus.UNAUTHORIZED);
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new DomainError("CURRENT_PASSWORD_WRONG", "Current password is wrong", HttpStatus.UNAUTHORIZED);
    }
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.auth.saveUser(user);
    await this.auth.revokeActiveForUser(userId, new Date());
    return { updated: true };
  }

  async updateProfile(
    userId: string,
    input: { name?: string; email?: string },
  ) {
    const user = await this.auth.findUserById(userId);
    if (!user) {
      throw new DomainError("NOT_SIGNED_IN", "Sign in required", HttpStatus.UNAUTHORIZED);
    }

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) {
        throw new DomainError("NAME_REQUIRED", "Name is required", HttpStatus.BAD_REQUEST);
      }
      user.name = trimmed;
    }

    if (input.email !== undefined) {
      const normalized = input.email.trim().toLowerCase();
      if (!normalized) {
        throw new DomainError("USERNAME_REQUIRED", "Username is required", HttpStatus.BAD_REQUEST);
      }
      const existing = await this.auth.findUserByEmail(normalized);
      if (existing && existing.id !== userId) {
        throw new DomainError("EMAIL_TAKEN", "That username is already taken", HttpStatus.CONFLICT);
      }
      user.email = normalized;
    }

    if (input.name === undefined && input.email === undefined) {
      throw new DomainError("PROFILE_UNCHANGED", "Nothing to update", HttpStatus.BAD_REQUEST);
    }

    await this.auth.saveUser(user).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new DomainError("EMAIL_TAKEN", "That username is already taken", HttpStatus.CONFLICT);
      }
      throw error;
    });

    return this.toPublicUser(user);
  }

  async deleteAccount(userId: string, password: string) {
    const user = await this.auth.findUserById(userId);
    if (!user) {
      throw new DomainError("NOT_SIGNED_IN", "Sign in required", HttpStatus.UNAUTHORIZED);
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new DomainError("CURRENT_PASSWORD_WRONG", "Current password is wrong", HttpStatus.UNAUTHORIZED);
    }

    await this.dataSource.transaction(async (manager) => {
      const members = manager.getRepository(HomeMember);
      const homes = manager.getRepository(Home);
      const memberships = await members.find({ where: { userId } });

      for (const membership of memberships) {
        const others = await members.find({
          where: { homeId: membership.homeId },
          order: { createdAt: "ASC" },
        });
        const rest = others.filter((row) => row.userId !== userId);
        if (rest.length === 0) {
          await homes.delete(membership.homeId);
          continue;
        }
        if (membership.role === "owner") {
          rest[0].role = "owner";
          await members.save(rest[0]);
        }
        await members.delete({ homeId: membership.homeId, userId });
      }

      await manager.query(`update items set bought_by = null where bought_by = $1`, [userId]);
      await manager.query(
        `update items
         set added_by = (
           select member.user_id from home_members member
           where member.home_id = items.home_id
           order by member.created_at asc
           limit 1
         )
         where added_by = $1
           and exists (
             select 1 from home_members member where member.home_id = items.home_id
           )`,
        [userId],
      );
      await manager.query(
        `update staples
         set created_by = (
           select member.user_id from home_members member
           where member.home_id = staples.home_id
           order by member.created_at asc
           limit 1
         )
         where created_by = $1
           and exists (
             select 1 from home_members member where member.home_id = staples.home_id
           )`,
        [userId],
      );
      await manager.getRepository(User).delete(userId);
    });

    return { deleted: true };
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }

  private signAccessToken(user: User) {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
        expiresIn: this.config.get("JWT_ACCESS_TTL", { infer: true }),
      },
    );
  }

  private async createSession(user: User): Promise<AuthSession> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = randomToken(48);
    const days = this.config.get("JWT_REFRESH_TTL_DAYS", { infer: true });
    await this.auth.saveRefresh({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      revokedAt: null,
    });
    return { accessToken, refreshToken, user: this.toPublicUser(user) };
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof QueryFailedError && (error.driverError as { code?: string } | undefined)?.code === "23505";
}
