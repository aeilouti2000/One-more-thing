import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { LOCALES } from "@/constants/i18n";
import { iconSize, withAlpha } from "@/constants/theme";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import {
  SettingsCardCopy,
  SettingsCardIcon,
} from "@/features/settings/components/settings-ui";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type NavId = "account" | "app" | "costs" | "language" | "appearance";

function activeNavId(pathname: string): NavId | null {
  if (pathname.startsWith("/settings/account")) return "account";
  if (
    pathname.startsWith("/settings/app") ||
    pathname.startsWith("/settings/categories") ||
    pathname.startsWith("/settings/pins") ||
    pathname.startsWith("/settings/swipe-actions")
  ) {
    return "app";
  }
  if (pathname.startsWith("/settings/costs")) return "costs";
  if (pathname.startsWith("/settings/language")) return "language";
  if (pathname.startsWith("/settings/appearance")) return "appearance";
  return null;
}

function NavRow({
  icon,
  title,
  summary,
  href,
  selected,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  href: Href;
  selected: boolean;
}) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const wide = useWideLayout();

  return (
    <Pressable
      onPress={() => {
        if (selected) return;
        // Wide: replace so top-level switches don't stack behind the master pane.
        // Phone: push so back returns to the settings hub.
        if (wide) router.replace(href);
        else router.push(href);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      className="flex-row items-center gap-3 overflow-hidden rounded-3xl px-4 py-4 active:opacity-80"
      style={{
        backgroundColor: selected
          ? withAlpha(colors.accent, 0.12)
          : colors.paper,
      }}
    >
      <SettingsCardIcon icon={icon} colors={colors} />
      <SettingsCardCopy title={title} body={summary} bodyLines={1} />
      <Ionicons
        name={isRTL ? "chevron-back" : "chevron-forward"}
        size={iconSize.sm}
        color={selected ? colors.accent : colors.ink}
      />
    </Pressable>
  );
}

/** Shared settings destinations — phone hub cards and fold master pane. */
export function SettingsNavList() {
  const { user } = useAuth();
  const { household } = useHousehold();
  const { scheme } = useTheme();
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const selected = activeNavId(pathname);

  const displayName = user?.name?.trim() || t("member");
  const languageLabel =
    LOCALES.find((item) => item.id === locale)?.label ?? t("language");
  const costsSummary = household?.costsEnabled
    ? t("trackCosts")
    : t("costsSectionBody");

  return (
    <View className="gap-3">
      <NavRow
        icon="person-outline"
        title={t("account")}
        summary={displayName}
        href={"/settings/account" as Href}
        selected={selected === "account"}
      />
      <NavRow
        icon="options-outline"
        title={t("appSettings")}
        summary={`${t("categories")} · ${t("pinsTitle")} · ${t("listAlerts")}`}
        href={"/settings/app" as Href}
        selected={selected === "app"}
      />
      {household ? (
        <NavRow
          icon="cash-outline"
          title={t("costsSection")}
          summary={costsSummary}
          href={"/settings/costs" as Href}
          selected={selected === "costs"}
        />
      ) : null}
      <NavRow
        icon="language-outline"
        title={t("languageLabel")}
        summary={languageLabel}
        href={"/settings/language" as Href}
        selected={selected === "language"}
      />
      <NavRow
        icon="color-palette-outline"
        title={t("appearance")}
        summary={`${scheme === "dark" ? t("dark") : t("light")} · ${t("textSize")}`}
        href={"/settings/appearance" as Href}
        selected={selected === "appearance"}
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
        <Ionicons name="settings-outline" size={28} color={colors.accent} />
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
