import type { PushToken } from "../../entities/push-token.entity";

export interface INotificationsRepository {
  findByToken(token: string): Promise<PushToken | null>;
  save(token: PushToken): Promise<PushToken>;
  insert(input: { userId: string; token: string; locale: string }): Promise<void>;
  deleteForUser(userId: string, token: string): Promise<void>;
  findRecipients(homeId: string, actorId?: string): Promise<PushToken[]>;
  deleteTokens(tokens: string[]): Promise<void>;
}

export const NOTIFICATIONS_REPOSITORY = Symbol("NOTIFICATIONS_REPOSITORY");
