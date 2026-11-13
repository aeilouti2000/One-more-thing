import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import {
  NOTIFICATIONS_REPOSITORY,
  type INotificationsRepository,
} from "../repo/notifications-repo/notifications.repository";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** Changes from the same person within this window arrive as one notification. */
export const GROUP_WINDOW_MS = 4_000;
/** A slow Expo must never hold up the server. */
const SEND_TIMEOUT_MS = 5_000;
/** Expo asks to wait before reading receipts; they hold most delivery errors. */
const RECEIPT_DELAY_MS = 15 * 60_000;
const SEND_CHUNK = 100;
const RECEIPT_CHUNK = 300;
const MAX_GROUP_ITEMS = 50;

export type NoticeKind = "added" | "urgent" | "due";

export type NoticeItem = { name: string; urgent: boolean; listId: string | null };

type PendingGroup = {
  homeId: string;
  actorId: string | undefined;
  actorName: string;
  kind: NoticeKind;
  items: NoticeItem[];
  timer: ReturnType<typeof setTimeout>;
};

type ExpoTicket = {
  status?: string;
  id?: string;
  details?: { error?: string };
};

type ExpoRequestError = {
  code?: string;
  message?: string;
  /** For PUSH_TOO_MANY_EXPERIENCE_IDS: project name → its tokens. */
  details?: Record<string, unknown>;
};

/**
 * Splits a rejected batch by Expo project, using the token lists Expo returns
 * with PUSH_TOO_MANY_EXPERIENCE_IDS. Null when the error is something else.
 */
export function splitByProject<M extends { to: string }>(
  errors: ExpoRequestError[],
  messages: M[],
): M[][] | null {
  const error = errors.find((entry) => entry.code === "PUSH_TOO_MANY_EXPERIENCE_IDS");
  if (!error?.details) return null;
  const groups: M[][] = [];
  const placed = new Set<string>();
  for (const tokens of Object.values(error.details)) {
    if (!Array.isArray(tokens)) continue;
    const wanted = new Set(tokens.filter((token): token is string => typeof token === "string"));
    const group = messages.filter((message) => wanted.has(message.to) && !placed.has(message.to));
    group.forEach((message) => placed.add(message.to));
    if (group.length > 0) groups.push(group);
  }
  // Each group must be smaller than the batch, or the same request would repeat.
  if (groups.length < 2) return null;
  return groups;
}

type ExpoReceipt = {
  status?: string;
  details?: { error?: string };
};

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly pending = new Map<string, PendingGroup>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly receiptTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly accessToken = process.env.EXPO_ACCESS_TOKEN?.trim() || "";

  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly tokens: INotificationsRepository,
  ) {}

  async register(userId: string, token: string, locale: "en" | "ar", previousToken?: string) {
    // The phone's token rotated: drop the old one so it stops getting pushes.
    if (previousToken && previousToken !== token) {
      await this.tokens.deleteForUser(userId, previousToken);
    }

    const existing = await this.tokens.findByToken(token);
    if (existing) {
      existing.userId = userId;
      existing.locale = locale;
      await this.tokens.save(existing);
      return { registered: true };
    }

    await this.tokens.insert({ userId, token, locale });
    return { registered: true };
  }

  async unregister(userId: string, token: string) {
    await this.tokens.deleteForUser(userId, token);
    return { removed: true };
  }

  /** Queues the notice and returns at once; sending never blocks the request. */
  notifyItemAdded(input: {
    homeId: string;
    actorId: string;
    actorName: string;
    itemName: string;
    urgent: boolean;
    listId?: string | null;
  }) {
    this.enqueue(input.homeId, input.actorId, input.actorName, "added", {
      name: input.itemName,
      urgent: input.urgent,
      listId: input.listId ?? null,
    });
  }

  notifyItemUrgent(input: {
    homeId: string;
    actorId: string;
    actorName: string;
    itemName: string;
    listId?: string | null;
  }) {
    this.enqueue(input.homeId, input.actorId, input.actorName, "urgent", {
      name: input.itemName,
      urgent: true,
      listId: input.listId ?? null,
    });
  }

  notifyPinDue(input: { homeId: string; itemName: string; listId?: string | null }) {
    this.enqueue(input.homeId, undefined, "", "due", {
      name: input.itemName,
      urgent: false,
      listId: input.listId ?? null,
    });
  }

  /** Sends everything queued now (shutdown, tests) and waits for it. */
  async flushPending() {
    for (const key of [...this.pending.keys()]) this.flush(key);
    await Promise.all([...this.inFlight]);
  }

  async onModuleDestroy() {
    await this.flushPending();
    for (const timer of this.receiptTimers) clearTimeout(timer);
    this.receiptTimers.clear();
  }

  private enqueue(
    homeId: string,
    actorId: string | undefined,
    actorName: string,
    kind: NoticeKind,
    item: NoticeItem,
  ) {
    const key = `${kind}:${homeId}:${actorId ?? ""}`;
    const group = this.pending.get(key);
    if (group) {
      if (group.items.length < MAX_GROUP_ITEMS) group.items.push(item);
      if (actorName.trim()) group.actorName = actorName;
      return;
    }

    const timer = setTimeout(() => this.flush(key), GROUP_WINDOW_MS);
    timer.unref?.();
    this.pending.set(key, { homeId, actorId, actorName, kind, items: [item], timer });
  }

  private flush(key: string) {
    const group = this.pending.get(key);
    if (!group) return;
    this.pending.delete(key);
    clearTimeout(group.timer);

    const task = this.send(group).finally(() => this.inFlight.delete(task));
    this.inFlight.add(task);
  }

  private async send(group: PendingGroup) {
    try {
      const recipients = await this.tokens.findRecipients(group.homeId, group.actorId);
      if (recipients.length === 0) return;

      const lists = new Set(group.items.map((item) => item.listId));
      const listId = lists.size === 1 ? [...lists][0] : null;
      const anyUrgent = group.items.some((item) => item.urgent);
      const type =
        group.kind === "added" && anyUrgent && group.items.length === 1 ? "added_urgent" : group.kind;

      const messages = recipients.map((recipient) => {
        const copy = noticeCopy(recipient.locale, group.kind, group.actorName, group.items);
        return {
          to: recipient.token,
          title: copy.title,
          body: copy.body,
          sound: "default",
          priority: "high",
          channelId: "list-updates",
          data: { type, homeId: group.homeId, listId, count: group.items.length },
        };
      });

      const sent: { id: string; token: string }[] = [];
      const expired: string[] = [];

      const batches: (typeof messages)[] = [];
      for (let index = 0; index < messages.length; index += SEND_CHUNK) {
        batches.push(messages.slice(index, index + SEND_CHUNK));
      }

      while (batches.length > 0) {
        const chunk = batches.shift()!;
        const result = await this.post<{ data?: ExpoTicket[] }>(EXPO_PUSH_URL, chunk);
        if (!result.ok) {
          // Tokens from different Expo projects (an old dev or Expo Go install
          // next to the real app) can't share one request: Expo rejects all of
          // them. Send each project's tokens on its own.
          const split = splitByProject(result.errors, chunk);
          if (split) batches.push(...split);
          continue;
        }

        (result.data.data ?? []).forEach((ticket, ticketIndex) => {
          const token = chunk[ticketIndex]?.to;
          if (!token) return;
          if (ticket.status === "ok" && ticket.id) sent.push({ id: ticket.id, token });
          if (ticket.status === "error") {
            if (ticket.details?.error === "DeviceNotRegistered") expired.push(token);
            else this.logger.warn(`Push ticket error: ${ticket.details?.error ?? "unknown"}`);
          }
        });
      }

      if (expired.length > 0) await this.tokens.deleteTokens(expired);
      if (sent.length > 0) this.scheduleReceiptCheck(sent);
    } catch (error) {
      this.logger.warn(
        `Could not send list notification: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  private scheduleReceiptCheck(sent: { id: string; token: string }[]) {
    const timer = setTimeout(() => {
      this.receiptTimers.delete(timer);
      void this.checkReceipts(sent);
    }, RECEIPT_DELAY_MS);
    timer.unref?.();
    this.receiptTimers.add(timer);
  }

  /** Exposed for tests. Removes tokens Expo later reported as unregistered. */
  async checkReceipts(sent: { id: string; token: string }[]) {
    try {
      const tokenById = new Map(sent.map((entry) => [entry.id, entry.token]));
      const ids = [...tokenById.keys()];
      const expired: string[] = [];

      for (let index = 0; index < ids.length; index += RECEIPT_CHUNK) {
        const chunk = ids.slice(index, index + RECEIPT_CHUNK);
        const result = await this.post<{ data?: Record<string, ExpoReceipt> }>(
          EXPO_RECEIPTS_URL,
          { ids: chunk },
        );
        if (!result.ok) continue;
        for (const [id, receipt] of Object.entries(result.data.data ?? {})) {
          if (receipt.status !== "error") continue;
          if (receipt.details?.error === "DeviceNotRegistered") {
            const token = tokenById.get(id);
            if (token) expired.push(token);
          } else {
            this.logger.warn(`Push receipt error: ${receipt.details?.error ?? "unknown"}`);
          }
        }
      }

      if (expired.length > 0) await this.tokens.deleteTokens(expired);
    } catch (error) {
      this.logger.warn(
        `Could not read push receipts: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  private async post<T>(
    url: string,
    body: unknown,
  ): Promise<{ ok: true; data: T } | { ok: false; errors: ExpoRequestError[] }> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let errors: ExpoRequestError[] = [];
      try {
        errors = (JSON.parse(text) as { errors?: ExpoRequestError[] }).errors ?? [];
      } catch {
        // Not JSON; the raw text is logged below.
      }
      const reason = errors.map((error) => `${error.code ?? "?"}: ${error.message ?? ""}`).join("; ");
      this.logger.warn(
        `Expo push request failed with ${response.status}: ${(reason || text).slice(0, 500)}`,
      );
      return { ok: false, errors };
    }
    return { ok: true, data: (await response.json()) as T };
  }
}

const NAMES_SHOWN = 3;

function nameList(locale: string, names: string[]) {
  const shown = names.slice(0, NAMES_SHOWN).join(locale === "ar" ? "، " : ", ");
  const more = names.length - NAMES_SHOWN;
  if (more <= 0) return shown;
  return locale === "ar" ? `${shown} و${more} غيرها` : `${shown} and ${more} more`;
}

/** Arabic counted noun: 2 → dual, 3–10 → plural, 11+ → singular accusative. */
function arabicItems(count: number) {
  if (count === 2) return "عنصرين";
  if (count >= 3 && count <= 10) return `${count} عناصر`;
  return `${count} عنصراً`;
}

export function noticeCopy(
  locale: string,
  kind: NoticeKind,
  actorName: string,
  items: Pick<NoticeItem, "name" | "urgent">[],
) {
  const actor = actorName.trim() || (locale === "ar" ? "أحد الأعضاء" : "Someone");
  const names = items.map((item) => item.name.trim()).filter(Boolean);
  const count = Math.max(items.length, 1);
  const item = names[0] || (locale === "ar" ? "عنصراً" : "an item");
  const anyUrgent = items.some((entry) => entry.urgent);

  if (locale === "ar") {
    if (count > 1) {
      const list = nameList("ar", names);
      if (kind === "due") return { title: "عادت إلى القائمة", body: `حان موعد ${arabicItems(count)}: ${list}` };
      if (kind === "urgent") {
        return { title: "عناصر عاجلة", body: `${actor} علّم ${arabicItems(count)} عاجلة: ${list}` };
      }
      return {
        title: anyUrgent ? "عناصر عاجلة" : "عناصر جديدة",
        body: `${actor} أضاف ${arabicItems(count)}: ${list}`,
      };
    }
    if (kind === "due") return { title: "عاد إلى القائمة", body: `حان موعد ${item}` };
    if (kind === "urgent") return { title: "عنصر عاجل", body: `${actor} علّم ${item} عاجلاً` };
    if (anyUrgent) return { title: "عنصر عاجل", body: `${actor} أضاف ${item} وعلّمه عاجلاً` };
    return { title: "عنصر جديد", body: `${actor} أضاف ${item}` };
  }

  if (count > 1) {
    const list = nameList("en", names);
    if (kind === "due") return { title: "Back on the list", body: `${count} items are due: ${list}` };
    if (kind === "urgent") {
      return { title: "Urgent items", body: `${actor} marked ${count} items urgent: ${list}` };
    }
    return {
      title: anyUrgent ? "Urgent items" : "New items",
      body: `${actor} added ${count} items: ${list}`,
    };
  }
  if (kind === "due") return { title: "Back on the list", body: `${item} is due` };
  if (kind === "urgent") return { title: "Urgent item", body: `${actor} marked ${item} urgent` };
  if (anyUrgent) return { title: "Urgent item", body: `${actor} added ${item} and marked it urgent` };
  return { title: "New item", body: `${actor} added ${item}` };
}
