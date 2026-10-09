import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { User } from "../../../../users/user.entity";
import { RefreshToken } from "../../entities/refresh-token.entity";
import { IAuthRepository, type NewRefreshInput, type NewUserInput } from "./auth.repository";

@Injectable()
export class TypeormAuthRepository implements IAuthRepository {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  findUserByEmail(email: string) {
    return this.users.findOne({ where: { email } });
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
}
