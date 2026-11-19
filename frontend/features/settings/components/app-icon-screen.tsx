import { Image } from "expo-image";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import type { TranslationKey } from "@/constants/i18n";
import { SettingsSection } from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import {
  APP_ICON_CHOICES,
  currentAppIcon,
  setAppIcon,
  type AppIconChoice,
} from "@/lib/app-icon";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const DARK_ICON = require("@/assets/images/icon.png");
const LIGHT_ICON = require("@/assets/images/ios-icon-light.png");
const PREVIEW = 54;

const LABELS: Record<AppIconChoice, { title: TranslationKey; body: TranslationKey }> = {
  system: { title: "themeSystem", body: "appIconSystemBody" },
  dark: { title: "dark", body: "appIconDarkBody" },
  light: { title: "light", body: "appIconLightBody" },
};

/** Preferences → App icon: pick the icon shown on the home screen. */
export default function AppIconScreen() {
  const { t } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [selected, setSelected] = useState<AppIconChoice>(currentAppIcon);
  const [failed, setFailed] = useState(false);

  const choose = async (choice: AppIconChoice) => {
    if (choice === selected) return;
    const previous = selected;
    setSelected(choice);
    setFailed(false);
    try {
      await setAppIcon(choice);
    } catch {
      setSelected(previous);
      setFailed(true);
    }
  };

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("appIcon")}
        subtitle={t("appIconSubtitle")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <View accessibilityRole="radiogroup" className="gap-3">
          {APP_ICON_CHOICES.map((choice) => (
            <IconOption
              key={choice}
              choice={choice}
              title={t(LABELS[choice].title)}
              body={t(LABELS[choice].body)}
              selected={selected === choice}
              onPress={() => void choose(choice)}
            />
          ))}
        </View>
        {failed ? (
          <AppText className="px-1 text-sm font-semibold text-cove-ink">{t("appIconFailed")}</AppText>
        ) : null}
        {Platform.OS === "android" ? (
          <AppText className="px-1 text-xs leading-5 text-cove-muted">{t("appIconHint")}</AppText>
        ) : null}
      </SettingsSection>
    </Screen>
  );
}

function IconOption({
  choice,
  title,
  body,
  selected,
  onPress,
}: {
  choice: AppIconChoice;
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      className="flex-row items-center gap-3 rounded-3xl bg-cove-paper px-4 py-3.5 active:opacity-80"
      style={{ borderWidth: 2, borderColor: selected ? colors.accentText : "transparent" }}
    >
      <IconPreview choice={choice} />
      <View className="min-w-0 flex-1">
        <AppText className="text-base font-semibold text-cove-ink">{title}</AppText>
        <AppText className="mt-1 text-sm text-cove-muted">{body}</AppText>
      </View>
      <View
        className="h-5 w-5 items-center justify-center rounded-full"
        style={{ borderWidth: 2, borderColor: selected ? colors.accentText : colors.line }}
      >
        {selected ? (
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.accentText }} />
        ) : null}
      </View>
    </Pressable>
  );
}

/** The icon as it looks on the home screen; "system" shows light and dark halves. */
function IconPreview({ choice }: { choice: AppIconChoice }) {
  const frame = { width: PREVIEW, height: PREVIEW, borderRadius: PREVIEW * 0.23, overflow: "hidden" as const };

  if (choice !== "system") {
    return (
      <View style={frame}>
        <Image source={choice === "light" ? LIGHT_ICON : DARK_ICON} style={{ width: PREVIEW, height: PREVIEW }} />
      </View>
    );
  }
  return (
    <View style={frame}>
      <Image source={LIGHT_ICON} style={{ width: PREVIEW, height: PREVIEW }} />
      <View style={{ position: "absolute", top: 0, bottom: 0, left: PREVIEW / 2, right: 0, overflow: "hidden" }}>
        <Image
          source={DARK_ICON}
          style={{ position: "absolute", top: 0, left: -PREVIEW / 2, width: PREVIEW, height: PREVIEW }}
        />
      </View>
    </View>
  );
}
