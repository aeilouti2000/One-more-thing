import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { withAlpha } from "@/constants/theme";
import type { TranslationKey } from "@/constants/i18n";
import {
  canUsePush,
  readNotificationPermission,
  readPushEnabled,
  syncPushRegistration,
  writePushEnabled,
  type PermissionState,
} from "@/features/notifications/api/push";
import {
  CardBlock,
  SettingsCardCopy,
  SettingsCardIcon,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type PermissionId = "notifications" | "camera" | "photos";
type State = PermissionState | "limited";

type PermissionRow = {
  id: PermissionId;
  icon: keyof typeof Ionicons.glyphMap;
  title: TranslationKey;
  why: TranslationKey;
};

const ROWS: PermissionRow[] = [
  { id: "notifications", icon: "notifications-outline", title: "permissionNotifications", why: "permissionNotificationsWhy" },
  { id: "camera", icon: "camera-outline", title: "permissionCamera", why: "permissionCameraWhy" },
  { id: "photos", icon: "images-outline", title: "permissionPhotos", why: "permissionPhotosWhy" },
];

function fromPicker(response: ImagePicker.PermissionResponse & { accessPrivileges?: string }): State {
  if (response.granted) return response.accessPrivileges === "limited" ? "limited" : "granted";
  return response.canAskAgain ? "undetermined" : "denied";
}

async function readState(id: PermissionId): Promise<State> {
  if (Platform.OS === "web") return "unsupported";
  try {
    if (id === "notifications") return canUsePush() ? await readNotificationPermission() : "unsupported";
    if (id === "camera") return fromPicker(await ImagePicker.getCameraPermissionsAsync());
    return fromPicker(await ImagePicker.getMediaLibraryPermissionsAsync());
  } catch {
    return "unsupported";
  }
}

const STATUS_LABEL: Record<State, TranslationKey> = {
  granted: "permissionAllowed",
  limited: "permissionLimited",
  denied: "permissionBlocked",
  undetermined: "permissionNotAsked",
  unsupported: "permissionUnavailable",
};

export default function PermissionsSettingsScreen() {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [states, setStates] = useState<Partial<Record<PermissionId, State>>>({});
  const [busy, setBusy] = useState<PermissionId | null>(null);

  const reload = useCallback(async () => {
    const entries = await Promise.all(ROWS.map(async (row) => [row.id, await readState(row.id)] as const));
    setStates(Object.fromEntries(entries));
  }, []);

  // Coming back from the phone's settings may have changed any of them.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async read updates state on completion
    void reload();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    return () => subscription.remove();
  }, [reload]);

  async function allow(id: PermissionId) {
    setBusy(id);
    try {
      if (id === "notifications") {
        if (!readPushEnabled()) writePushEnabled(true);
        await syncPushRegistration(locale, { prompt: true });
      } else if (id === "camera") {
        await ImagePicker.requestCameraPermissionsAsync();
      } else {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
    } finally {
      setBusy(null);
      await reload();
    }
  }

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("permissionsTitle")}
        subtitle={t("permissionsSubtitle")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <AppText className="px-1 text-sm text-cove-muted">{t("permissionsIntro")}</AppText>

        {ROWS.map((row) => {
          const state = states[row.id];
          const granted = state === "granted" || state === "limited";
          const tone = granted ? colors.accent : state === "denied" ? colors.ink : colors.muted;
          return (
            <CardBlock key={row.id}>
              <View className="flex-row items-start gap-3">
                <SettingsCardIcon icon={row.icon} colors={colors} />
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-center justify-between gap-2">
                    <SettingsCardCopy title={t(row.title)} />
                    {state ? (
                      <View
                        className="rounded-full px-3 py-1"
                        style={{ backgroundColor: withAlpha(tone, 0.12) }}
                      >
                        <AppText className="text-xs font-semibold" style={{ color: tone }}>
                          {t(STATUS_LABEL[state])}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText className="mt-2 text-sm text-cove-muted">{t(row.why)}</AppText>

                  {state === "undetermined" ? (
                    <Pressable
                      disabled={busy !== null}
                      onPress={() => void allow(row.id)}
                      className="mt-3 self-start rounded-full bg-cove-accent px-4 py-2 active:opacity-80"
                    >
                      <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                        {t("permissionAllow")}
                      </AppText>
                    </Pressable>
                  ) : state && state !== "unsupported" ? (
                    <Pressable
                      onPress={() => void Linking.openSettings()}
                      className="mt-3 self-start active:opacity-80"
                    >
                      <AppText className="text-sm font-semibold text-cove-accent">
                        {granted ? t("permissionManage") : t("openPhoneSettings")}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </CardBlock>
          );
        })}

        {Platform.OS !== "web" ? (
          <AppText className="px-1 text-xs text-cove-muted">{t("permissionsTurnOffNote")}</AppText>
        ) : null}
      </SettingsSection>
    </Screen>
  );
}
