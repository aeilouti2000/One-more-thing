import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HomeMember } from "../../../homes/entities/home-member.entity";
import { Home } from "../../../homes/entities/home.entity";
import { User } from "../../../../users/user.entity";
import { PushToken } from "../../entities/push-token.entity";
import {
  INotificationsRepository,
  type NotificationPrefs,
  type Recipient,
} from "./notifications.repository";

@Injectable()
export class TypeormNotificationsRepository implements INotificationsRepository {
  constructor(
    @InjectRepository(PushToken) private readonly tokens: Repository<PushToken>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findByToken(token: string) {
    return this.tokens.findOne({ where: { token } });
  }

  save(token: PushToken) {
    return this.tokens.save(token);
  }

  async insert(input: { userId: string; token: string; locale: string }) {
    // Upsert: the app can register the same token twice at once (start + language change).
    await this.tokens.upsert(input, ["token"]);
  }

  async deleteForUser(userId: string, token: string) {
    await this.tokens.delete({ userId, token });
  }

  async findRecipients(homeId: string, actorId?: string): Promise<Recipient[]> {
    const query = this.tokens
      .createQueryBuilder("token")
      .innerJoin(HomeMember, "member", "member.userId = token.userId")
      // The host can turn notifications off for the whole home.
      .innerJoin(Home, "home", "home.id = member.homeId AND home.notificationsEnabled = true")
      .innerJoin(User, "person", "person.id = token.userId")
      .where("member.homeId = :homeId", { homeId })
      .select("token.token", "token")
      .addSelect("token.locale", "locale")
      .addSelect("person.notifyAdded", "added")
      .addSelect("person.notifyUrgent", "urgent")
      .addSelect("person.notifyDue", "due");
    if (actorId) query.andWhere("token.userId != :actorId", { actorId });
    return query.getRawMany<Recipient>();
  }

  async getPrefs(userId: string): Promise<NotificationPrefs> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, notifyAdded: true, notifyUrgent: true, notifyDue: true },
    });
    return {
      added: user?.notifyAdded !== false,
      urgent: user?.notifyUrgent !== false,
      due: user?.notifyDue !== false,
    };
  }

  async savePrefs(userId: string, patch: Partial<NotificationPrefs>) {
    const update: Partial<User> = {};
    if (typeof patch.added === "boolean") update.notifyAdded = patch.added;
    if (typeof patch.urgent === "boolean") update.notifyUrgent = patch.urgent;
    if (typeof patch.due === "boolean") update.notifyDue = patch.due;
    if (Object.keys(update).length > 0) await this.users.update(userId, update);
    return this.getPrefs(userId);
  }

  async deleteTokens(tokens: string[]) {
    await this.tokens
      .createQueryBuilder()
      .delete()
      .where("token IN (:...expired)", { expired: tokens })
      .execute();
  }
}
