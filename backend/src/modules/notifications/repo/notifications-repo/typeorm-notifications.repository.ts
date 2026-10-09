import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HomeMember } from "../../../homes/entities/home-member.entity";
import { PushToken } from "../../entities/push-token.entity";
import { INotificationsRepository } from "./notifications.repository";

@Injectable()
export class TypeormNotificationsRepository implements INotificationsRepository {
  constructor(@InjectRepository(PushToken) private readonly tokens: Repository<PushToken>) {}

  findByToken(token: string) {
    return this.tokens.findOne({ where: { token } });
  }

  save(token: PushToken) {
    return this.tokens.save(token);
  }

  async insert(input: { userId: string; token: string; locale: string }) {
    await this.tokens.save(this.tokens.create(input));
  }

  async deleteForUser(userId: string, token: string) {
    await this.tokens.delete({ userId, token });
  }

  findRecipients(homeId: string, actorId?: string) {
    const query = this.tokens
      .createQueryBuilder("token")
      .innerJoin(HomeMember, "member", "member.userId = token.userId")
      .where("member.homeId = :homeId", { homeId });
    if (actorId) query.andWhere("token.userId != :actorId", { actorId });
    return query.getMany();
  }

  async deleteTokens(tokens: string[]) {
    await this.tokens
      .createQueryBuilder()
      .delete()
      .where("token IN (:...expired)", { expired: tokens })
      .execute();
  }
}
