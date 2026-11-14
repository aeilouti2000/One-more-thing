import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, MoreThanOrEqual, Not, Repository } from "typeorm";
import { User } from "../../../../users/user.entity";
import { EmailCode, type EmailCodePurpose } from "../../entities/email-code.entity";
import { RefreshToken } from "../../entities/refresh-token.entity";
import {
  IAuthRepository,
  type NewEmailCodeInput,
  type NewRefreshInput,
  type NewUserInput,
} from "./auth.repository";

@Injectable()
export class TypeormAuthRepository implements IAuthRepository {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(EmailCode) private readonly emailCodes: Repository<EmailCode>,
  ) {}

  findUserByEmail(email: string) {
    return this.users.findOne({ where: { email } });
  }

  findUserByVerifiedEmail(email: string) {
    return this.users.findOne({ where: { contactEmail: email, emailVerifiedAt: Not(IsNull()) } });
  }

  findUserByGoogleSub(sub: string) {
    return this.users.findOne({ where: { googleSub: sub } });
  }

  findUserById(id: string) {
    return this.users.findOne({ where: { id } });
  }

  saveNewUser(input: NewUserInput) {
    return this.users.save(this.users.create(input));
  }

  saveUser(user: User) {
    return this.users.save(user);
  }

  findRefreshByHash(tokenHash: string) {
    return this.refreshTokens.findOne({ where: { tokenHash } });
  }

  async saveRefresh(input: NewRefreshInput) {
    await this.refreshTokens.save(this.refreshTokens.create(input));
  }

  async rotateRefresh(current: RefreshToken, next: { tokenHash: string; expiresAt: Date }) {
    await this.refreshTokens.manager.transaction(async (manager) => {
      const tokens = manager.getRepository(RefreshToken);
      const now = new Date();
      // Asked again with the same token: the earlier replacement never arrived.
      if (current.supersededAt) {
        await tokens.update({ parentId: current.id, revokedAt: IsNull() }, { revokedAt: now });
      }
      // This token is in use, so the one it replaced is finished for good.
      if (current.parentId) {
        await tokens.update({ id: current.parentId, revokedAt: IsNull() }, { revokedAt: now });
      }
      await tokens.update({ id: current.id }, { supersededAt: now });
      await tokens.save(
        tokens.create({
          userId: current.userId,
          tokenHash: next.tokenHash,
          expiresAt: next.expiresAt,
          revokedAt: null,
          parentId: current.id,
          supersededAt: null,
        }),
      );
      // Old rows are only kept long enough to recognise a reused token.
      await manager.query(
        `delete from refresh_tokens
          where user_id = $1
            and (expires_at < now() or revoked_at < now() - interval '14 days')`,
        [current.userId],
      );
    });
  }

  wasRefreshReplacementUsed(tokenId: string) {
    return this.refreshTokens.exist({ where: { parentId: tokenId, supersededAt: Not(IsNull()) } });
  }

  async revokeByHash(tokenHash: string, revokedAt: Date, pushToken?: string) {
    await this.refreshTokens.update({ tokenHash }, { revokedAt });
    if (!pushToken) return;
    // Signed out on this phone: it stops getting the home's notifications,
    // even if the app could not remove its device itself.
    await this.refreshTokens.query(
      `delete from push_tokens p
        using refresh_tokens r
        where r.token_hash = $1 and p.user_id = r.user_id and p.token = $2`,
      [tokenHash, pushToken],
    );
  }

  async revokeActiveForUser(userId: string, revokedAt: Date) {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt });
    // Every session is over, so no phone should keep getting notifications
    // for this account. A phone that signs in again registers again.
    await this.refreshTokens.query(`delete from push_tokens where user_id = $1`, [userId]);
  }

  saveNewEmailCode(input: NewEmailCodeInput) {
    return this.emailCodes.save(this.emailCodes.create({ ...input, attempts: 0, usedAt: null }));
  }

  async deleteEmailCode(codeId: string) {
    await this.emailCodes.delete({ id: codeId });
  }

  findLatestEmailCode(userId: string, purpose: EmailCodePurpose) {
    return this.emailCodes.findOne({ where: { userId, purpose }, order: { createdAt: "DESC" } });
  }

  async invalidateEmailCodes(userId: string, purpose: EmailCodePurpose, usedAt: Date) {
    await this.emailCodes.update({ userId, purpose, usedAt: IsNull() }, { usedAt });
  }

  async claimEmailCodeAttempt(codeId: string, maxAttempts: number) {
    // One statement, so parallel guesses can't all read the same count.
    const result = await this.emailCodes
      .createQueryBuilder()
      .update(EmailCode)
      .set({ attempts: () => "attempts + 1" })
      .where("id = :codeId AND attempts < :maxAttempts AND used_at IS NULL", { codeId, maxAttempts })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markEmailCodeUsed(codeId: string, usedAt: Date) {
    const result = await this.emailCodes.update({ id: codeId, usedAt: IsNull() }, { usedAt });
    return (result.affected ?? 0) > 0;
  }

  countEmailCodesSince(userId: string, since: Date) {
    return this.emailCodes.count({ where: { userId, createdAt: MoreThanOrEqual(since) } });
  }
}
