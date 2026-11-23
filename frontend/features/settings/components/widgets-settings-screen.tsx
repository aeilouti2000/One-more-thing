import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState, Pressable, Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { StepSlider } from "@/components/ui/StepSlider";
import type { TranslationKey } from "@/constants/i18n";
import { withAlpha } from "@/constants/theme";
import {
  CardBlock,
  SettingsCardCopy,
  SettingsCardHeading,
  SettingsCardIcon,
  SettingsChoiceTile,
  SettingsGroup,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { widgetLook, type WidgetPalette } from "@/features/widgets/snapshot";
import {
  readWidgetBackground,
  readWidgetStyle,
  subscribeWidgetStyle,
  writeWidgetBackground,
  writeWidgetStyle,
} from "@/features/widgets/widget-prefs";
import {
  WIDGET_GLASS_CLARITY_STEPS,
  WIDGET_GLASS_TINTS,
  WIDGET_STYLES,
  type WidgetGlassTint,
  type WidgetStyle,
  type WidgetStylePrefs,
} from "@/features/widgets/widget-style";
import {
  readWidgetStatus,
  requestWidgetPin,
  widgetGlassAvailable,
  type WidgetKind,
  type WidgetStatus,
} from "@/modules/home-widgets/src";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const WIDGETS: {
  kind: WidgetKind;
  icon: keyof typeof Ionicons.glyphMap;
  communityIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: TranslationKey;
  body: TranslationKey;
}[] = [
  { kind: "list", icon: "list-outline", title: "widgetListName", body: "widgetListBody" },
  { kind: "budget", icon: "pie-chart-outline", title: "widgetBudgetName", body: "widgetBudgetBody" },
  {
    kind: "pins",
    icon: "bookmark-outline",
    communityIcon: "pin-outline",
    title: "widgetPinsName",
    body: "widgetPinsBody",
  },
  { kind: "pulse", icon: "pulse-outline", title: "widgetPulseName", body: "widgetPulseBody" },
];

const STYLE_LABELS: Record<WidgetStyle, TranslationKey> = {
  theme: "widgetStyleTheme",
  glass: "themeGlass",
};

const TINT_LABELS: Record<WidgetGlassTint, TranslationKey> = {
  auto: "themeSystem",
  light: "light",
  dark: "dark",
};

/** Preferences → Widgets: add them, how they look, and how they stay fresh. */
export default function WidgetsSettingsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [status, setStatus] = useState<WidgetStatus | null>(readWidgetStatus);
  const [background, setBackground] = useState(readWidgetBackground);

  // The phone's "add widget" prompt covers the app; read the counts again after it.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setStatus(readWidgetStatus());
    });
    return () => subscription.remove();
  }, []);

  function onBackground(enabled: boolean) {
    setBackground(enabled);
    writeWidgetBackground(enabled);
  }

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("widgetsTitle")}
        subtitle={t("widgetsSubtitle")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <View className="gap-6">
        {/* Only where the installed app can draw glass widgets. */}
        {widgetGlassAvailable ? <WidgetStyleSettings /> : null}

        <SettingsSection>
          {WIDGETS.map((widget) => {
            const placed = (status?.[widget.kind] ?? 0) > 0;
            return (
              <CardBlock key={widget.kind}>
                <View className="flex-row items-center gap-3">
                  <SettingsCardIcon
                    icon={widget.icon}
                    communityIcon={widget.communityIcon}
                    colors={colors}
                  />
                  <SettingsCardCopy
                    title={t(widget.title)}
                    body={placed ? `${t(widget.body)} ${t("widgetOnScreen")}.` : t(widget.body)}
                  />
                  {status?.canPin ? (
                    <Pressable
                      onPress={() => requestWidgetPin(widget.kind)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t("widgetAddLabel", { name: t(widget.title) })}
                      className="rounded-full px-4 py-2 active:opacity-80"
                      style={{ backgroundColor: placed ? colors.mist : colors.accent }}
                    >
                      <AppText
                        className="text-sm font-semibold"
                        style={{ color: placed ? colors.accentText : colors.onAccent }}
                      >
                        {t("widgetAdd")}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              </CardBlock>
            );
          })}

          <CardBlock>
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1 flex-row items-center gap-3">
                <SettingsCardIcon icon="sync-outline" colors={colors} />
                <SettingsCardCopy title={t("widgetsBackground")} body={t("widgetsBackgroundBody")} />
              </View>
              <Switch
                value={background}
                onValueChange={onBackground}
                trackColor={{ false: colors.mist, true: colors.accent }}
                thumbColor={colors.white}
                accessibilityLabel={t("widgetsBackground")}
              />
            </View>
          </CardBlock>

          <AppText className="px-1 text-xs leading-5 text-cove-muted">
            {`${t("widgetsHowTitle")}: ${t("widgetsHowBody")}`}
          </AppText>
        </SettingsSection>
      </View>
    </Screen>
  );
}

/** App theme or Glass, and for Glass its tint and how see-through it is. */
function WidgetStyleSettings() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const prefs = useSyncExternalStore(subscribeWidgetStyle, readWidgetStyle, readWidgetStyle);
  const change = (next: Partial<WidgetStylePrefs>) => writeWidgetStyle({ ...prefs, ...next });
  const swatch = (alpha: number) => (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: colors.muted,
        backgroundColor: withAlpha(colors.muted, alpha),
      }}
    />
  );

  return (
    <SettingsGroup title={t("widgetStyle")}>
      <View accessibilityRole="radiogroup" className="flex-row gap-3">
        {WIDGET_STYLES.map((style) => (
          <SettingsChoiceTile
            key={style}
            label={t(STYLE_LABELS[style])}
            selected={prefs.style === style}
            onPress={() => change({ style })}
          >
            <WidgetPreview prefs={{ ...prefs, style }} />
          </SettingsChoiceTile>
        ))}
      </View>

      {prefs.style === "glass" ? (
        <>
          <CardBlock>
            <SettingsCardHeading title={t("widgetGlassTint")} body={t("widgetGlassTintBody")} />
            <View className="mt-2">
              <SegmentedToggle
                value={prefs.tint}
                options={WIDGET_GLASS_TINTS.map((id) => ({ id, label: t(TINT_LABELS[id]) }))}
                onChange={(tint) => change({ tint })}
                accessibilityLabel={t("widgetGlassTint")}
              />
            </View>
          </CardBlock>
          <CardBlock>
            <SettingsCardHeading
              title={t("widgetGlassClarity")}
              body={t("widgetGlassClarityBody")}
            />
            <View className="mt-4">
              <StepSlider
                value={prefs.clarity}
                steps={WIDGET_GLASS_CLARITY_STEPS}
                onChange={(clarity) => change({ clarity })}
                accessibilityLabel={t("widgetGlassClarity")}
                valueLabel={t("widgetGlassClarityLevel", {
                  level: prefs.clarity + 1,
                  count: WIDGET_GLASS_CLARITY_STEPS,
                })}
                start={swatch(0.85)}
                end={swatch(0.12)}
              />
            </View>
          </CardBlock>
          <AppText className="px-1 text-xs leading-5 text-cove-muted">
            {t("widgetGlassNote")}
          </AppText>
        </>
      ) : null}
    </SettingsGroup>
  );
}

const PREVIEW_HEIGHT = 116;

/** A wallpaper to show the widget on: the same for both styles, so they compare. */
const WALLPAPER = {
  backgroundColor: "#27306B",
  backgroundImage: [
    {
      type: "radial-gradient" as const,
      shape: "ellipse" as const,
      size: { x: "90%", y: "80%" },
      position: { left: "10%", top: "0%" },
      colorStops: [
        { color: "rgba(255, 170, 110, 0.95)", positions: ["0%"] },
        { color: "rgba(255, 170, 110, 0)", positions: ["100%"] },
      ],
    },
    {
      type: "radial-gradient" as const,
      shape: "ellipse" as const,
      size: { x: "85%", y: "90%" },
      position: { left: "100%", top: "70%" },
      colorStops: [
        { color: "rgba(196, 110, 255, 0.9)", positions: ["0%"] },
        { color: "rgba(196, 110, 255, 0)", positions: ["100%"] },
      ],
    },
  ],
};

/**
 * The list widget in miniature, drawn with the colours the real one gets.
 * A widget that follows the phone's light or dark mode shows both, half and
 * half: the app cannot tell which one the phone is in while it forces a theme
 * of its own.
 */
function WidgetPreview({ prefs }: { prefs: WidgetStylePrefs }) {
  const { accent, preference, surfaceDepth } = useTheme();
  const look = widgetLook({ theme: { preference, accent, surfaceDepth }, style: prefs });
  const alpha = look.glass?.bg ?? 1;

  return (
    <View style={[{ height: PREVIEW_HEIGHT, direction: "ltr" }, WALLPAPER]}>
      {look.themeMode === "system" ? (
        <>
          <MiniWidget palette={look.light} alpha={alpha} glass={Boolean(look.glass)} />
          {/* Right half: the dark version, cut down the middle */}
          <View style={{ position: "absolute", top: 0, bottom: 0, left: "50%", right: 0, overflow: "hidden" }}>
            <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "200%" }}>
              <MiniWidget palette={look.dark} alpha={alpha} glass={Boolean(look.glass)} />
            </View>
          </View>
        </>
      ) : (
        <MiniWidget
          palette={look.themeMode === "dark" ? look.dark : look.light}
          alpha={alpha}
          glass={Boolean(look.glass)}
        />
      )}
    </View>
  );
}

function MiniWidget({
  palette,
  alpha,
  glass,
}: {
  palette: WidgetPalette;
  /** How solid the widget's background is (0–1). */
  alpha: number;
  glass: boolean;
}) {
  return (
    <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, padding: 12, justifyContent: "center" }}>
      <View
        style={{
          borderRadius: 14,
          padding: 9,
          gap: 7,
          backgroundColor: withAlpha(palette.bg, alpha),
          borderWidth: glass ? 1 : 0,
          borderColor: withAlpha("#FFFFFF", 0.3),
        }}
      >
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 34, height: 6, borderRadius: 3, backgroundColor: palette.ink }} />
          <View
            style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: withAlpha(palette.muted, 0.7) }}
          />
          <View style={{ width: 13, height: 13, borderRadius: 4, backgroundColor: palette.fill }} />
        </View>
        {[0.62, 0.44, 0.54].map((width, index) => (
          <View key={index} className="flex-row items-center gap-1.5">
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                borderWidth: 1.5,
                borderColor: palette.muted,
              }}
            />
            <View
              style={{
                width: `${width * 100}%`,
                height: 5,
                borderRadius: 3,
                backgroundColor: withAlpha(palette.ink, 0.8),
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
