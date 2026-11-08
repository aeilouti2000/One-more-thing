import type { EmailCode, EmailCodePurpose } from "../../entities/email-code.entity";
import type { RefreshToken } from "../../entities/refresh-token.entity";
import type { User } from "../../../../users/user.entity";

export type NewUserInput = {
  email: string;
  name: string;
  passwordHash: string | null;
  contactEmail?: string | null;
  emailVerifiedAt?: Date | null;
  googleSub?: string | null;
  googleEmail?: string | null;
};

export type NewRefreshInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type NewEmailCodeInput = {
  userId: string;
  email: string;
  purpose: EmailCodePurpose;
  codeHash: string;
  expiresAt: Date;
};

export interface IAuthRepository {
  /** By username (the `email` column). */
  findUserByEmail(email: string): Promise<User | null>;
  findUserByVerifiedEmail(email: string): Promise<User | null>;
  findUserByGoogleSub(sub: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  saveNewUser(input: NewUserInput): Promise<User>;
  saveUser(user: User): Promise<User>;
  findRefreshByHash(tokenHash: string): Promise<RefreshToken | null>;
  saveRefresh(input: NewRefreshInput): Promise<void>;
  revokeByHash(tokenHash: string, revokedAt: Date): Promise<void>;
  revokeActiveForUser(userId: string, revokedAt: Date): Promise<void>;
  saveNewEmailCode(input: NewEmailCodeInput): Promise<EmailCode>;
  saveEmailCode(code: EmailCode): Promise<EmailCode>;
  findLatestEmailCode(userId: string, purpose: EmailCodePurpose): Promise<EmailCode | null>;
  invalidateEmailCodes(userId: string, purpose: EmailCodePurpose, usedAt: Date): Promise<void>;
  /** Spend one try on a code, atomically. False when no tries are left. */
  claimEmailCodeAttempt(codeId: string, maxAttempts: number): Promise<boolean>;
  /** Mark a code used once; false if it was already used. */
  markEmailCodeUsed(codeId: string, usedAt: Date): Promise<boolean>;
  countEmailCodesSince(userId: string, since: Date): Promise<number>;
}

export const AUTH_REPOSITORY = Symbol("AUTH_REPOSITORY");
