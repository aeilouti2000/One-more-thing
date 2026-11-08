import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import { DataSource, QueryFailedError } from "typeorm";
import { Home } from "../../homes/entities/home.entity";
import { HomeMember } from "../../homes/entities/home-member.entity";
import type { AppConfig } from "../../../config/env";
import { DomainError } from "../../../common/domain.error";
import { randomInt } from "crypto";
import { randomToken, sha256, tokensMatch } from "../../../common/crypto";
import { User } from "../../../users/user.entity";
import type { EmailCodePurpose } from "../entities/email-code.entity";
import { AUTH_REPOSITORY, type IAuthRepository } from "../repo/auth-repo/auth.repository";
import { GoogleVerifier } from "./google-verifier.service";
import { MailService } from "./mail.service";

const BCRYPT_ROUNDS = 12;
const CODE_TTL_MINUTES = 15;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_COOLDOWN_MS = 60_000;
/** Codes per account per day, across purposes: caps email spam and guessing. */
const CODE_DAILY_LIMIT = 10;

export type PublicUser = {
  id: string;
  /** The username (historical column name). */
  email: string;
  name: string;
  createdAt: Date;
  contactEmail: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  /** The linked Google account's email, or null when Google isn't connected. */
  googleEmail: string | null;
  googleLinked: boolean;
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
    private readonly google: GoogleVerifier,
    private readonly mail: MailService,
  ) {}

  async signUp(name: string, email: string, password: string, contactEmail?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.auth.findUserByEmail(normalizedEmail);
    if (existing) {
      throw new DomainError("EMAIL_TAKEN", "That username is already taken", HttpStatus.CONFLICT);
    }
    const address = contactEmail ? normalizeAddress(contactEmail) : null;
    if (address && (await this.auth.findUserByVerifiedEmail(address))) {
      throw new DomainError("EMAIL_IN_USE", "That email belongs to another account", HttpStatus.CONFLICT);
    }

    const user = await this.auth.saveNewUser({
      email: normalizedEmail,
      name: name.trim() || "Member",
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      contactEmail: address,
      emailVerifiedAt: null,
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new DomainError("EMAIL_TAKEN", "That username is already taken", HttpStatus.CONFLICT);
      }
      throw error;
    });

    if (address) {
      // The account exists either way; the app offers "Resend" if this fails.
      await this.sendCode(user.id, address, "verify").catch(() => undefined);
    }

    return this.createSession(user);
  }

  async login(login: string, password: string): Promise<AuthSession> {
    const user = await this.findByLogin(login);
    const matches = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !matches) {
      throw new DomainError("INVALID_CREDENTIALS", "Wrong username or password", HttpStatus.UNAUTHORIZED);
    }
    return this.createSession(user);
  }

  /**
   * Google sign-in: the linked account, else the account whose verified
   * email matches (linking it), else a new account with a generated username.
   */
  async signInWithGoogle(idToken: string): Promise<AuthSession & { isNew: boolean }> {
    const identity = await this.google.verify(idToken);

    const linked = await this.auth.findUserByGoogleSub(identity.sub);
    if (linked) {
      if (identity.email && linked.googleEmail !== identity.email) {
        linked.googleEmail = identity.email;
        await this.auth.saveUser(linked);
      }
      return { ...(await this.createSession(linked)), isNew: false };
    }

    if (identity.email && identity.emailVerified) {
      const byEmail = await this.auth.findUserByVerifiedEmail(identity.email);
      if (byEmail) {
        // Never swap out a Google account the user linked on purpose.
        if (byEmail.googleSub && byEmail.googleSub !== identity.sub) {
          throw new DomainError("GOOGLE_MISMATCH", "Use the Google account linked to this account", HttpStatus.UNAUTHORIZED);
        }
        byEmail.googleSub = identity.sub;
        byEmail.googleEmail = identity.email;
        await this.auth.saveUser(byEmail);
        return { ...(await this.createSession(byEmail)), isNew: false };
      }
    }

    const verified = identity.email && identity.emailVerified ? identity.email : null;
    const name = identity.name?.trim() || identity.email?.split("@")[0] || "Member";
    const user = await this.createGoogleUser(name.slice(0, 80), identity.sub, identity.email, verified);
    return { ...(await this.createSession(user)), isNew: true };
  }

  async linkGoogle(userId: string, idToken: string) {
    const user = await this.requireUser(userId);
    const identity = await this.google.verify(idToken);
    const owner = await this.auth.findUserByGoogleSub(identity.sub);
    if (owner && owner.id !== userId) {
      throw new DomainError("GOOGLE_IN_USE", "That Google account is linked to another account", HttpStatus.CONFLICT);
    }
    user.googleSub = identity.sub;
    user.googleEmail = identity.email;

    // No verified email yet: adopt Google's (already verified by Google).
    if (!user.emailVerifiedAt && identity.email && identity.emailVerified) {
      const other = await this.auth.findUserByVerifiedEmail(identity.email);
      if (!other) {
        user.contactEmail = identity.email;
        user.emailVerifiedAt = new Date();
      }
    }

    await this.auth.saveUser(user).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new DomainError("GOOGLE_IN_USE", "That Google account is linked to another account", HttpStatus.CONFLICT);
      }
      throw error;
    });
    return this.toPublicUser(user);
  }

  async unlinkGoogle(userId: string) {
    const user = await this.requireUser(userId);
    if (!user.passwordHash) {
      throw new DomainError(
        "LAST_SIGN_IN_METHOD",
        "Set a password before disconnecting Google",
        HttpStatus.BAD_REQUEST,
      );
    }
    user.googleSub = null;
    user.googleEmail = null;
    await this.auth.saveUser(user);
    return this.toPublicUser(user);
  }

  /** Set or change the account email; a code goes to the new address. */
  async setEmail(userId: string, email: string) {
    const user = await this.requireUser(userId);
    const address = normalizeAddress(email);
    if (user.emailVerifiedAt && user.contactEmail === address) {
      return this.toPublicUser(user);
    }
    const other = await this.auth.findUserByVerifiedEmail(address);
    if (other && other.id !== userId) {
      throw new DomainError("EMAIL_IN_USE", "That email belongs to another account", HttpStatus.CONFLICT);
    }

    // A verified address stays in place until the new one is confirmed, so
    // password reset keeps working in between. The pending one lives on the code.
    if (!user.emailVerifiedAt) {
      user.contactEmail = address;
      await this.auth.saveUser(user);
    }
    await this.sendCode(user.id, address, "verify");
    return this.toPublicUser(user);
  }

  async resendEmailCode(userId: string) {
    const user = await this.requireUser(userId);
    const latest = await this.auth.findLatestEmailCode(userId, "verify");
    const address =
      latest && !latest.usedAt ? latest.email : !user.emailVerifiedAt ? user.contactEmail : null;
    if (!address) {
      throw new DomainError("NO_PENDING_EMAIL", "There's no email waiting to be verified", HttpStatus.BAD_REQUEST);
    }
    await this.sendCode(userId, address, "verify");
    return { sent: true, email: address };
  }

  async verifyEmail(userId: string, code: string) {
    const user = await this.requireUser(userId);
    const stored = await this.consumeCode(userId, "verify", code);
    user.contactEmail = stored.email;
    user.emailVerifiedAt = new Date();
    await this.auth.saveUser(user).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new DomainError("EMAIL_IN_USE", "That email belongs to another account", HttpStatus.CONFLICT);
      }
      throw error;
    });
    return this.toPublicUser(user);
  }

  /**
   * Always answers the same way, so it doesn't reveal which accounts have a
   * verified email. Only a verified email gets a code.
   */
  async forgotPassword(login: string) {
    const user = await this.findByLogin(login);
    if (user?.contactEmail && user.emailVerifiedAt) {
      const latest = await this.auth.findLatestEmailCode(user.id, "reset");
      const coolingDown =
        latest && !latest.usedAt && Date.now() - latest.createdAt.getTime() < CODE_RESEND_COOLDOWN_MS;
      if (!coolingDown) {
        await this.sendCode(user.id, user.contactEmail, "reset").catch((error: unknown) => {
          // The daily cap answers like any other request: no account hints.
          if (error instanceof DomainError && (error.getResponse() as { code?: string }).code === "CODE_COOLDOWN") return;
          throw error;
        });
      }
    }
    return { sent: true };
  }

  async resetPassword(login: string, code: string, newPassword: string): Promise<AuthSession> {
    const user = await this.findByLogin(login);
    if (!user || !user.emailVerifiedAt) {
      throw new DomainError("CODE_INVALID", "That code isn't right", HttpStatus.BAD_REQUEST);
    }
    await this.consumeCode(user.id, "reset", code);
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.auth.saveUser(user);
    await this.auth.revokeActiveForUser(user.id, new Date());
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

  /** Change the password, or set a first one on a Google-only account. */
  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    if (currentPassword === newPassword) {
      throw new DomainError("PASSWORD_UNCHANGED", "New password must be different", HttpStatus.BAD_REQUEST);
    }
    const user = await this.auth.findUserById(userId);
    if (!user) {
      throw new DomainError("NOT_SIGNED_IN", "Sign in required", HttpStatus.UNAUTHORIZED);
    }
    const settingFirst = !user.passwordHash;
    if (user.passwordHash) {
      const matches = currentPassword ? await bcrypt.compare(currentPassword, user.passwordHash) : false;
      if (!matches) {
        throw new DomainError("CURRENT_PASSWORD_WRONG", "Current password is wrong", HttpStatus.UNAUTHORIZED);
      }
    }
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.auth.saveUser(user);
    // A first password (Google-only account) adds a way in; nothing to revoke.
    if (settingFirst) return { updated: true, signedOut: false };
    await this.auth.revokeActiveForUser(userId, new Date());
    return { updated: true, signedOut: true };
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

  /** Confirmed with the password, or a fresh Google sign-in for the linked account. */
  async deleteAccount(userId: string, proof: { password?: string; googleIdToken?: string }) {
    const user = await this.requireUser(userId);
    if (proof.googleIdToken) {
      const identity = await this.google.verify(proof.googleIdToken);
      if (!user.googleSub || identity.sub !== user.googleSub) {
        throw new DomainError("GOOGLE_MISMATCH", "Use the Google account linked to this account", HttpStatus.UNAUTHORIZED);
      }
    } else {
      const matches =
        proof.password && user.passwordHash ? await bcrypt.compare(proof.password, user.passwordHash) : false;
      if (!matches) {
        throw new DomainError("CURRENT_PASSWORD_WRONG", "Current password is wrong", HttpStatus.UNAUTHORIZED);
      }
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
      contactEmail: user.contactEmail ?? null,
      emailVerified: !!user.emailVerifiedAt,
      hasPassword: !!user.passwordHash,
      googleEmail: user.googleSub ? (user.googleEmail ?? null) : null,
      googleLinked: !!user.googleSub,
    };
  }

  private async requireUser(userId: string) {
    const user = await this.auth.findUserById(userId);
    if (!user) {
      throw new DomainError("NOT_SIGNED_IN", "Sign in required", HttpStatus.UNAUTHORIZED);
    }
    return user;
  }

  /**
   * A username, or a verified email. Older accounts may have an email as their
   * username, so an "@" login falls back to the username column.
   */
  private async findByLogin(login: string) {
    const value = login.trim().toLowerCase();
    if (!value.includes("@")) return this.auth.findUserByEmail(value);
    return (await this.auth.findUserByVerifiedEmail(value)) ?? (await this.auth.findUserByEmail(value));
  }

  private async sendCode(userId: string, email: string, purpose: EmailCodePurpose) {
    const latest = await this.auth.findLatestEmailCode(userId, purpose);
    if (
      latest &&
      !latest.usedAt &&
      latest.email === email &&
      Date.now() - latest.createdAt.getTime() < CODE_RESEND_COOLDOWN_MS
    ) {
      throw new DomainError("CODE_COOLDOWN", "Wait a minute before asking for another code", HttpStatus.TOO_MANY_REQUESTS);
    }
    const now = new Date();
    const sentToday = await this.auth.countEmailCodesSince(userId, new Date(now.getTime() - 86_400_000));
    if (sentToday >= CODE_DAILY_LIMIT) {
      throw new DomainError("CODE_COOLDOWN", "Too many codes today. Try again tomorrow.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.auth.invalidateEmailCodes(userId, purpose, now);
    await this.auth.saveNewEmailCode({
      userId,
      email,
      purpose,
      codeHash: hashCode(userId, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000),
    });
    await this.mail.sendCode(email, code, purpose, CODE_TTL_MINUTES);
  }

  private async consumeCode(userId: string, purpose: EmailCodePurpose, code: string) {
    const stored = await this.auth.findLatestEmailCode(userId, purpose);
    if (!stored || stored.usedAt) {
      throw new DomainError("CODE_INVALID", "That code isn't right", HttpStatus.BAD_REQUEST);
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new DomainError("CODE_EXPIRED", "That code has expired. Ask for a new one.", HttpStatus.BAD_REQUEST);
    }
    // Every check spends a try first, atomically, so parallel guesses can't
    // get more than CODE_MAX_ATTEMPTS looks at one code.
    if (!(await this.auth.claimEmailCodeAttempt(stored.id, CODE_MAX_ATTEMPTS))) {
      throw new DomainError("CODE_TOO_MANY_ATTEMPTS", "Too many tries. Ask for a new code.", HttpStatus.BAD_REQUEST);
    }
    if (!tokensMatch(stored.codeHash, hashCode(userId, code.trim()))) {
      throw new DomainError("CODE_INVALID", "That code isn't right", HttpStatus.BAD_REQUEST);
    }
    const usedAt = new Date();
    if (!(await this.auth.markEmailCodeUsed(stored.id, usedAt))) {
      throw new DomainError("CODE_INVALID", "That code isn't right", HttpStatus.BAD_REQUEST);
    }
    stored.usedAt = usedAt;
    return stored;
  }

  private async createGoogleUser(name: string, sub: string, googleEmail: string | null, verifiedEmail: string | null) {
    const base = usernameBase(googleEmail?.split("@")[0] ?? name);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base.slice(0, 26)}${randomInt(1000, 1_000_000)}`;
      if (await this.auth.findUserByEmail(candidate)) continue;
      try {
        return await this.auth.saveNewUser({
          email: candidate,
          name,
          passwordHash: null,
          contactEmail: verifiedEmail,
          emailVerifiedAt: verifiedEmail ? new Date() : null,
          googleSub: sub,
          googleEmail,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // A race on the username, or Google sub/email linked meanwhile: retry.
        const linked = await this.auth.findUserByGoogleSub(sub);
        if (linked) return linked;
      }
    }
    throw new DomainError("USERNAME_UNAVAILABLE", "Couldn't create the account. Try again.", HttpStatus.CONFLICT);
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

function normalizeAddress(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(userId: string, code: string) {
  return sha256(`${userId}:${code}`);
}

/** Lowercase letters, numbers, dots, underscores; 3–20 chars. */
function usernameBase(source: string) {
  const cleaned = source
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9._]/g, "")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 20);
  return cleaned.length >= 3 ? cleaned : `member${cleaned}`.slice(0, 20);
}

function isUniqueViolation(error: unknown) {
  return error instanceof QueryFailedError && (error.driverError as { code?: string } | undefined)?.code === "23505";
}
