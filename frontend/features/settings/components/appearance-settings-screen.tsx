import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FontSizeBar } from "@/components/ui/FontSizeBar";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ThemeColorPicker } from "@/components/ui/ThemeColorPicker";
import { getColors, withAlpha } from "@/constants/theme";
import { CardBlock } from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function AppearanceSettingsScreen() {
  const { t } = useI18n();
  const { scheme, preference, setPreference } = useTheme();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("appearance")}
        subtitle={`${
          preference === "system"
            ? t("themeSystem")
            : scheme === "dark"
              ? t("dark")
              : t("light")
        } · ${t("textSize")}`}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <View className="gap-6">
        <Section title={t("theme")}>
          <View accessibilityRole="radiogroup" className="flex-row gap-3">
            <ThemeTile
              mode="system"
              label={t("themeSystem")}
              selected={preference === "system"}
              onPress={() => setPreference("system")}
            />
            <ThemeTile
              mode="light"
              label={t("light")}
              selected={preference === "light"}
              onPress={() => setPreference("light")}
            />
            <ThemeTile
              mode="dark"
              label={t("dark")}
              selected={preference === "dark"}
              onPress={() => setPreference("dark")}
            />
          </View>
        </Section>

        <Section title={t("themeColor")}>
          <CardBlock>
            <ThemeColorPicker />
          </CardBlock>
        </Section>

        <Section title={t("textSize")}>
          <CardBlock>
            <FontSizeBar />
          </CardBlock>
        </Section>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2.5">
      <AppText className="px-1 text-xs font-bold uppercase tracking-widest text-cove-muted">
        {title}
      </AppText>
      {children}
    </View>
  );
}

/**
 * A small picture of the app in that theme, so the choice is visual.
 * "Match phone" shows light and dark side by side.
 */
function ThemeTile({
  mode,
  label,
  selected,
  onPress,
}: {
  mode: "light" | "dark" | "system";
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className="flex-1 active:opacity-85"
    >
      <View
        style={{
          borderRadius: 24,
          padding: 6,
          backgroundColor: colors.paper,
          borderWidth: 2,
          borderColor: selected ? colors.accent : "transparent",
        }}
      >
        {mode === "system" ? (
          <View style={{ borderRadius: 18, overflow: "hidden", height: 116 }}>
            <MiniScreen mode="light" />
            {/* Right half: the dark version, cut down the middle */}
            <View
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "50%",
                right: 0,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  right: 0,
                  width: "200%",
                }}
              >
                <MiniScreen mode="dark" />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ borderRadius: 18, overflow: "hidden" }}>
            <MiniScreen mode={mode} />
          </View>
        )}
        <View className="flex-row items-center justify-between gap-1.5 px-2 pb-1 pt-2.5">
          {/* One line that shrinks on narrow tiles instead of wrapping into the check. */}
          <AppText
            className="text-sm font-semibold text-cove-ink"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={{ flex: 1, minWidth: 0 }}
          >
            {label}
          </AppText>
          <View
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: selected ? 0 : 1.5,
              borderColor: withAlpha(colors.muted, 0.5),
              backgroundColor: selected ? colors.accent : "transparent",
            }}
          >
            {selected ? (
              <Ionicons name="checkmark" size={13} color={colors.onAccent} />
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function MiniScreen({ mode }: { mode: "light" | "dark" }) {
  const { accent, surfaceDepth } = useTheme();
  const preview = getColors(mode, accent, surfaceDepth);
  return (
    <View style={{ backgroundColor: preview.ice, height: 116 }}>
      <View
        style={{
          height: 30,
          backgroundColor: preview.accent,
          paddingHorizontal: 10,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 44,
            height: 6,
            borderRadius: 3,
            backgroundColor: withAlpha("#FFFFFF", 0.85),
          }}
        />
      </View>
      <View style={{ padding: 8, gap: 6 }}>
        {[0.7, 0.5, 0.6].map((width, index) => (
          <View
            key={index}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              height: 20,
              paddingHorizontal: 7,
              borderRadius: 7,
              backgroundColor: preview.paper,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor:
                  index === 0 ? preview.accent : withAlpha(preview.muted, 0.6),
                backgroundColor: index === 0 ? preview.accent : "transparent",
              }}
            />
            <View
              style={{
                width: `${width * 100}%`,
                height: 5,
                borderRadius: 3,
                backgroundColor: withAlpha(preview.ink, 0.35),
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
