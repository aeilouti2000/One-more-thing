import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HomeMember } from "../homes/home-member.entity";
import { PushToken } from "./push-token.entity";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type NoticeKind = "added" | "added_urgent" | "urgent";

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(PushToken) private readonly tokens: Repository<PushToken>,
    @InjectRepository(HomeMember) private readonly members: Repository<HomeMember>,
  ) {}

  async register(userId: string, token: string, locale: "en" | "ar") {
    const existing = await this.tokens.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      existing.locale = locale;
      await this.tokens.save(existing);
      return { registered: true };
    }

    await this.tokens.save(this.tokens.create({ userId, token, locale }));
    return { registered: true };
  }

  async unregister(userId: string, token: string) {
    await this.tokens.delete({ userId, token });
    return { removed: true };
  }

  async notifyItemAdded(input: {
    homeId: string;
    actorId: string;
    actorName: string;
    itemName: string;
    urgent: boolean;
  }) {
    await this.notifyOthers(input.homeId, input.actorId, input.urgent ? "added_urgent" : "added", input);
  }

  async notifyItemUrgent(input: { homeId: string; actorId: string; actorName: string; itemName: string }) {
    await this.notifyOthers(input.homeId, input.actorId, "urgent", input);
  }

  private async notifyOthers(
    homeId: string,
    actorId: string,
    kind: NoticeKind,
    input: { actorName: string; itemName: string },
  ) {
    try {
      const recipients = await this.tokens
        .createQueryBuilder("token")
        .innerJoin(HomeMember, "member", "member.userId = token.userId")
        .where("member.homeId = :homeId", { homeId })
        .andWhere("token.userId != :actorId", { actorId })
        .getMany();

      if (recipients.length === 0) return;

      const messages = recipients.map((recipient) => {
        const copy = noticeCopy(recipient.locale, kind, input.actorName, input.itemName);
        return {
          to: recipient.token,
          title: copy.title,
          body: copy.body,
          sound: "default",
          priority: "high",
          channelId: "list-updates",
          data: { type: kind, homeId },
        };
      });

      for (let index = 0; index < messages.length; index += 100) {
        const chunk = messages.slice(index, index + 100);
        const response = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(chunk),
        });

        if (!response.ok) {
          this.logger.warn(`Expo push failed with ${response.status}`);
          continue;
        }

        const payload = (await response.json()) as { data?: ExpoTicket[] };
        const expired = (payload.data ?? [])
          .map((ticket, ticketIndex) =>
            ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
              ? chunk[ticketIndex]?.to
              : null,
          )
          .filter((token): token is string => Boolean(token));

        if (expired.length > 0) {
          await this.tokens
            .createQueryBuilder()
            .delete()
            .where("token IN (:...expired)", { expired })
            .execute();
        }
      }
    } catch (error) {
      this.logger.warn(`Could not send list notification: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
}

export function noticeCopy(locale: string, kind: NoticeKind, actorName: string, itemName: string) {
  const actor = actorName.trim() || "Someone";
  const item = itemName.trim() || "an item";
  if (locale === "ar") {
    if (kind === "urgent") {
      return { title: "عنصر عاجل", body: `${actor} علّم ${item} عاجلاً` };
    }
    if (kind === "added_urgent") {
      return { title: "عنصر عاجل", body: `${actor} أضاف ${item} وعلّمه عاجلاً` };
    }
    return { title: "عنصر جديد", body: `${actor} أضاف ${item}` };
  }

  if (kind === "urgent") {
    return { title: "Urgent item", body: `${actor} marked ${item} urgent` };
  }
  if (kind === "added_urgent") {
    return { title: "Urgent item", body: `${actor} added ${item} and marked it urgent` };
  }
  return { title: "New item", body: `${actor} added ${item}` };
}
