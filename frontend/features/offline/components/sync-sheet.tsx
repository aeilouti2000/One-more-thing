import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { TranslationKey } from "@/constants/i18n";
import { waitingColor } from "@/features/offline/components/sync-status-button";
import { probeNow } from "@/features/offline/network";
import {
  resumeOutbox,
  usePendingChanges,
  type ChangeAction,
  type OutboxEntry,
} from "@/features/offline/outbox";
import { closeSyncSheet, useOfflineUi, useSyncStatus } from "@/features/offline/sync-status";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const ACTION_KEYS: Record<ChangeAction, TranslationKey> = {
  add: "syncActAdd",
  edit: "syncActEdit",
  delete: "syncActDelete",
  buy: "syncActBuy",
  undo: "syncActUndo",
  notFound: "syncActNotFound",
  found: "syncActFound",
  reorder: "syncActReorder",
  move: "syncActMove",
  urgent: "syncActUrgent",
  later: "syncActLater",
  back: "syncActBack",
  price: "syncActPrice",
  invoice: "syncActInvoice",
  photo: "syncActPhoto",
  settings: "syncActSettings",
};

/** The most rows listed; a long offline trip can leave many more waiting. */
const SHOWN = 6;

/** "Waiting to sync": opened from the cloud in the header. */
export function SyncSheet() {
  const { sheetOpen } = useOfflineUi();
  const { state } = useSyncStatus();
  const pending = usePendingChanges();
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const [trying, setTrying] = useState(false);

  const offline = state === "offline";
  const title = offline
    ? pending.length > 0
      ? t("syncWaitingTitle")
      : t("syncOfflineTitle")
    : pending.length > 0
      ? t("syncSendingTitle")
      : t("syncAllSaved");
  const body = offline
    ? pending.length > 0
      ? t("syncWaitingBody")
      : t("syncOfflineBody")
    : pending.length > 0
      ? t("syncSendingBody")
      : t("syncAllSavedBody");

  const ago = (entry: OutboxEntry) => {
    const minutes = Math.floor((Date.now() - entry.at) / 60_000);
    if (minutes < 1) return t("syncJustNow");
    if (minutes < 60) return t("syncMinutesAgo", { count: minutes });
    return t("syncHoursAgo", { count: Math.floor(minutes / 60) });
  };

  const tryNow = async () => {
    setTrying(true);
    const answered = await probeNow();
    if (answered) resumeOutbox();
    setTrying(false);
  };

  const shown = pending.slice(0, SHOWN);
  const more = pending.length - shown.length;

  return (
    <BottomSheet visible={sheetOpen} onClose={closeSyncSheet}>
      <View className="gap-1 px-1 pb-1">
        <AppText className="text-xl font-semibold text-cove-ink">{title}</AppText>
        <AppText className="text-sm text-cove-muted">{body}</AppText>
      </View>

      {shown.length > 0 ? (
        <View className="mt-4 gap-2">
          {shown.map((entry, index) => (
            <View
              key={`${entry.at}-${index}`}
              className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3"
              style={{ backgroundColor: scheme === "dark" ? colors.mist : colors.ice }}
            >
              <Ionicons name="time-outline" size={18} color={waitingColor(scheme)} />
              <View className="min-w-0 flex-1">
                <AppText numberOfLines={1} className="text-base font-semibold text-cove-ink">
                  {entry.label.title ??
                    (entry.label.action === "settings"
                      ? t("syncActSettings")
                      : t("syncItems", { count: entry.label.count ?? 1 }))}
                </AppText>
                <AppText numberOfLines={1} className="text-xs text-cove-muted">
                  {entry.label.title || entry.label.action !== "settings"
                    ? `${t(ACTION_KEYS[entry.label.action] ?? "syncActEdit")} · ${ago(entry)}`
                    : ago(entry)}
                </AppText>
              </View>
            </View>
          ))}
          {more > 0 ? (
            <AppText className="px-1 text-xs font-semibold text-cove-muted">
              {t("syncMore", { count: more })}
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View className="mt-5 flex-row gap-2.5">
        <View className="flex-1">
          <AppButton label={t("close")} variant="secondary" onPress={closeSyncSheet} />
        </View>
        {offline ? (
          <View className="flex-1">
            <AppButton label={t("syncTryNow")} loading={trying} onPress={() => void tryNow()} />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}
