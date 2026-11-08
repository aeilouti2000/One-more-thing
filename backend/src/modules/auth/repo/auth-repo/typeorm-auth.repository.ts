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

  async revokeByHash(tokenHash: string, revokedAt: Date) {
    await this.refreshTokens.update({ tokenHash }, { revokedAt });
  }

  async revokeActiveForUser(userId: string, revokedAt: Date) {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt });
  }

  saveNewEmailCode(input: NewEmailCodeInput) {
    return this.emailCodes.save(this.emailCodes.create({ ...input, attempts: 0, usedAt: null }));
  }

  saveEmailCode(code: EmailCode) {
    return this.emailCodes.save(code);
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
