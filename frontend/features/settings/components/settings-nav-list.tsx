import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import { useSyncExternalStore } from "react";
import { Linking, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { iconSize, withAlpha } from "@/constants/theme";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import {
  SettingsCardCopy,
  SettingsCardIcon,
} from "@/features/settings/components/settings-ui";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { readUpdateState, subscribeUpdateState } from "@/lib/app-release";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type NavId = "account" | "home-settings" | "preferences" | "permissions" | "about";

/** Each main card, and the pages that live behind it. */
const NAV_PAGES: Record<NavId, string[]> = {
  account: ["account"],
  "home-settings": ["home-settings", "categories", "pins", "costs", "trips", "home-alerts"],
  preferences: ["preferences", "notifications", "swipe-actions", "language", "appearance", "app-icon"],
  permissions: ["permissions"],
  about: ["about", "whats-new", "features"],
};

function activeNavId(pathname: string): NavId | null {
  const ids = Object.keys(NAV_PAGES) as NavId[];
  return (
    ids.find((id) => NAV_PAGES[id].some((page) => pathname.startsWith(`/settings/${page}`))) ??
    null
  );
}

function openPage(href: Href, selected: boolean, wide: boolean) {
  if (selected) return;
  // Wide: replace so top-level switches don't stack behind the master pane.
  // Phone: push so back returns to the settings hub.
  if (wide) router.replace(href);
  else router.push(href);
}

function NavRow({
  icon,
  title,
  summary,
  href,
  selected,
  outside,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  href: Href;
  selected: boolean;
  /** Leads out of Settings: always opens on top, so back returns here. */
  outside?: boolean;
}) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const wide = useWideLayout();

  return (
    <Pressable
      onPress={() => (outside ? router.push(href) : openPage(href, selected, wide))}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      className="flex-row items-center gap-3 overflow-hidden rounded-3xl px-4 py-4 active:opacity-80"
      style={{
        backgroundColor: selected
          ? withAlpha(colors.accentText, 0.12)
          : colors.paper,
      }}
    >
      <SettingsCardIcon icon={icon} colors={colors} />
      <SettingsCardCopy title={title} body={summary} bodyLines={1} />
      <Ionicons
        name={isRTL ? "chevron-back" : "chevron-forward"}
        size={iconSize.sm}
        color={selected ? colors.accentText : colors.ink}
      />
    </Pressable>
  );
}

/** The signed-in person: opens Account. */
function ProfileCard({ selected }: { selected: boolean }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const wide = useWideLayout();
  const name = user?.name?.trim() || t("member");
  const detail = user?.contactEmail?.trim() || user?.googleEmail?.trim() || user?.email || "";

  return (
    <Pressable
      onPress={() => openPage("/settings/account" as Href, selected, wide)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${t("account")}, ${name}`}
      className="flex-row items-center gap-3 overflow-hidden rounded-3xl px-4 py-4 active:opacity-80"
      style={{
        backgroundColor: selected ? withAlpha(colors.accentText, 0.12) : colors.paper,
      }}
    >
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.accent }}
      >
        <AppText className="text-xl font-semibold" style={{ color: colors.onAccent }}>
          {name.charAt(0).toUpperCase()}
        </AppText>
      </View>
      <View className="min-w-0 flex-1">
        <AppText className="text-lg font-semibold text-cove-ink" numberOfLines={1}>
          {name}
        </AppText>
        <AppText className="mt-1 text-sm text-cove-muted" numberOfLines={1}>
          {detail ? `${detail} · ${t("account")}` : t("account")}
        </AppText>
      </View>
      <Ionicons
        name={isRTL ? "chevron-back" : "chevron-forward"}
        size={iconSize.sm}
        color={selected ? colors.accentText : colors.ink}
      />
    </Pressable>
  );
}

export function useUpdateState() {
  return useSyncExternalStore(subscribeUpdateState, readUpdateState, readUpdateState);
}

/** Shown only while a newer version waits, so "Later" is never a dead end. */
function UpdateStrip() {
  const update = useUpdateState();
  const { colors } = useTheme();
  const { t } = useI18n();
  if (update.status !== "available") return null;

  return (
    <Pressable
      onPress={() => void Linking.openURL(update.downloadUrl).catch(() => undefined)}
      accessibilityRole="button"
      accessibilityLabel={`${t("updateReady", { version: update.version })}, ${t("updateNow")}`}
      className="flex-row items-center gap-3 rounded-3xl px-4 py-3.5 active:opacity-80"
      style={{ backgroundColor: withAlpha(colors.accentText, 0.12) }}
    >
      <Ionicons name="arrow-down-circle-outline" size={22} color={colors.accentText} />
      <AppText className="min-w-0 flex-1 text-sm font-semibold text-cove-ink">
        {t("updateReady", { version: update.version })}
      </AppText>
      <AppText className="text-sm font-semibold" style={{ color: colors.accentText }}>
        {t("updateNow")}
      </AppText>
    </Pressable>
  );
}

/** Shared settings destinations — phone hub cards and fold master pane. */
export function SettingsNavList() {
  const { user } = useAuth();
  const { household } = useHousehold();
  const { t } = useI18n();
  const pathname = usePathname();
  const selected = activeNavId(pathname);

  const role =
    household?.members.find((member) => member.id === user?.id)?.role === "owner"
      ? t("host")
      : t("member");
  const homeSummary = household
    ? `${household.name} · ${
        household.members.length === 1
          ? t("justYou")
          : t("membersShort", { count: household.members.length })
      } · ${role}`
    : t("settingsNoHomeBody");
  return (
    <View className="gap-3">
      <UpdateStrip />
      <ProfileCard selected={selected === "account"} />
      <NavRow
        icon="home-outline"
        title={t("homeSettings")}
        summary={homeSummary}
        href={(household ? "/settings/home-settings" : "/home/add") as Href}
        selected={selected === "home-settings"}
        outside={!household}
      />
      <NavRow
        icon="options-outline"
        title={t("preferences")}
        summary={`${t("notificationsTitle")} · ${t("languageLabel")} · ${t("appearance")}`}
        href={"/settings/preferences" as Href}
        selected={selected === "preferences"}
      />
      <NavRow
        icon="shield-checkmark-outline"
        title={t("permissionsTitle")}
        summary={t("permissionsSubtitle")}
        href={"/settings/permissions" as Href}
        selected={selected === "permissions"}
      />
      <NavRow
        icon="information-circle-outline"
        title={t("aboutHelp")}
        summary={t("aboutHelpSummary")}
        href={"/settings/about" as Href}
        selected={selected === "about"}
      />
    </View>
  );
}

export function SettingsWidePlaceholder() {
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View
        className="items-center justify-center rounded-full"
        style={{
          width: 56,
          height: 56,
          backgroundColor: colors.mist,
        }}
      >
        <Ionicons name="settings-outline" size={28} color={colors.accentText} />
      </View>
      <AppText className="mt-4 text-center text-lg font-semibold text-cove-ink">
        {t("settingsPickTitle")}
      </AppText>
      <AppText className="mt-2 text-center text-base leading-6 text-cove-muted">
        {t("settingsPickBody")}
      </AppText>
    </View>
  );
}
