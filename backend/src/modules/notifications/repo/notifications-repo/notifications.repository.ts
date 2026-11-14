import type { PushToken } from "../../entities/push-token.entity";

/** Which kinds of list notification a person wants. */
export type NotificationPrefs = { added: boolean; urgent: boolean; due: boolean };

/** A phone to notify. Missing choices count as "wanted". */
export type Recipient = { token: string; locale: string } & Partial<NotificationPrefs>;

export interface INotificationsRepository {
  findByToken(token: string): Promise<PushToken | null>;
  save(token: PushToken): Promise<PushToken>;
  insert(input: { userId: string; token: string; locale: string }): Promise<void>;
  deleteForUser(userId: string, token: string): Promise<void>;
  findRecipients(homeId: string, actorId?: string): Promise<Recipient[]>;
  deleteTokens(tokens: string[]): Promise<void>;
  getPrefs(userId: string): Promise<NotificationPrefs>;
  savePrefs(userId: string, patch: Partial<NotificationPrefs>): Promise<NotificationPrefs>;
}

export const NOTIFICATIONS_REPOSITORY = Symbol("NOTIFICATIONS_REPOSITORY");
