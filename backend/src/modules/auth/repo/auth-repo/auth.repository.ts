import type { RefreshToken } from "../../entities/refresh-token.entity";
import type { User } from "../../../../users/user.entity";

export type NewUserInput = {
  email: string;
  name: string;
  passwordHash: string;
};

export type NewRefreshInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  saveNewUser(input: NewUserInput): Promise<User>;
  saveUser(user: User): Promise<User>;
  findRefreshByHash(tokenHash: string): Promise<RefreshToken | null>;
  saveRefresh(input: NewRefreshInput): Promise<void>;
  revokeByHash(tokenHash: string, revokedAt: Date): Promise<void>;
  revokeActiveForUser(userId: string, revokedAt: Date): Promise<void>;
}

export const AUTH_REPOSITORY = Symbol("AUTH_REPOSITORY");
