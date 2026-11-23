import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FontSizeBar } from "@/components/ui/FontSizeBar";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { ThemeColorPicker } from "@/components/ui/ThemeColorPicker";
import type { FontScaleLevel } from "@/constants/font";
import type { TranslationKey } from "@/constants/i18n";
import {
  getColors,
  getGlassColors,
  GLASS_FROST_LEVELS,
  glassBackdropStyle,
  spacing,
  withAlpha,
  type GlassFrost,
} from "@/constants/theme";
import { SettingsNavCard, SettingsSection } from "@/features/settings/components/settings-ui";
import { THEME_LABELS } from "@/features/settings/data/theme-labels";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import type { ThemePreference } from "@/lib/theme-storage";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** The gallery's cards, left to right. */
const THEMES: ThemePreference[] = ["system", "light", "dark", "glass"];

const FROST_LABELS: Record<GlassFrost, TranslationKey> = {
  clear: "glassFrostClear",
  frosted: "glassFrostFrosted",
  milky: "glassFrostMilky",
};

const TEXT_SIZE_LABELS: Record<FontScaleLevel, TranslationKey> = {
  small: "textSizeSmall",
  medium: "textSizeMedium",
  large: "textSizeLarge",
  xl: "textSizeXl",
};

/** Which setting's sheet is open. */
type Sheet = "color" | "frost" | "textSize";

/** A theme card's share of the page width; the rest shows its neighbours. */
const CARD_WIDTH_RATIO = 0.56;
const CARD_MAX_WIDTH = 250;
const CARD_HEIGHT_RATIO = 1.3;
const CARD_GAP = 12;
/** A card away from the centre is this small and this faint. */
const SIDE_SCALE = 0.92;
const SIDE_OPACITY = 0.5;

export default function AppearanceSettingsScreen() {
  const { t } = useI18n();
  const { accent, colors, glass, glassFrost, preference, setGlassFrost } = useTheme();
  const { level } = useFontScale();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const closeSheet = () => setSheet(null);

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("appearance")}
        subtitle={`${t(THEME_LABELS[preference])} · ${t("textSize")}`}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <ThemeGallery />

      <SettingsSection>
        <SettingsNavCard
          icon="color-palette-outline"
          title={t("themeColor")}
          summary={accent.toUpperCase()}
          onPress={() => setSheet("color")}
          colors={colors}
        />
        {glass ? (
          <SettingsNavCard
            icon="snow-outline"
            title={t("glassFrost")}
            summary={t(FROST_LABELS[glassFrost])}
            onPress={() => setSheet("frost")}
            colors={colors}
          />
        ) : null}
        <SettingsNavCard
          icon="text-outline"
          title={t("textSize")}
          summary={t(TEXT_SIZE_LABELS[level])}
          onPress={() => setSheet("textSize")}
          colors={colors}
        />
      </SettingsSection>

      <BottomSheet visible={sheet === "color"} onClose={closeSheet}>
        <SheetTitle title={t("themeColor")} />
        <ThemeColorPicker />
      </BottomSheet>

      <BottomSheet visible={sheet === "frost"} onClose={closeSheet}>
        <SheetTitle title={t("glassFrost")} body={t("glassFrostBody")} />
        <SegmentedToggle
          value={glassFrost}
          options={GLASS_FROST_LEVELS.map((id) => ({ id, label: t(FROST_LABELS[id]) }))}
          onChange={setGlassFrost}
          accessibilityLabel={t("glassFrost")}
        />
      </BottomSheet>

      <BottomSheet visible={sheet === "textSize"} onClose={closeSheet}>
        <SheetTitle title={t("textSize")} />
        <FontSizeBar />
      </BottomSheet>
    </Screen>
  );
}

function SheetTitle({ title, body }: { title: string; body?: string }) {
  return (
    <View className="mb-4 gap-1">
      <AppText className="text-xl font-semibold text-cove-ink">{title}</AppText>
      {body ? <AppText className="text-sm text-cove-muted">{body}</AppText> : null}
    </View>
  );
}

/**
 * The themes as large pictures of the app, side by side. Swipe (or tap a
 * card) to bring one to the centre: that one becomes the app's theme.
 */
function ThemeGallery() {
  const [width, setWidth] = useState(0);

  return (
    <View
      // Out to the edges of the page, past its side padding.
      style={{ marginHorizontal: -spacing.screen, marginBottom: spacing.xxl }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {/* The cards are sized from the width, so they wait for it. */}
      {width > 0 ? <ThemeCarousel width={width} /> : null}
    </View>
  );
}

function ThemeCarousel({ width }: { width: number }) {
  const { t } = useI18n();
  const { colors, preference, setPreference } = useTheme();
  const motionOff = useMotionOff();
  const listRef = useAnimatedRef<Animated.ScrollView>();
  const cardWidth = Math.min(CARD_MAX_WIDTH, Math.round(width * CARD_WIDTH_RATIO));
  const step = cardWidth + CARD_GAP;
  const chosen = Math.max(0, THEMES.indexOf(preference));
  // The card nearest the centre: ahead of `chosen` while a swipe is under way.
  const [centred, setCentred] = useState(chosen);
  const scrollX = useSharedValue(chosen * step);

  const indexAt = (x: number) => {
    "worklet";
    return Math.min(THEMES.length - 1, Math.max(0, Math.round(x / step)));
  };
  const choose = (index: number) => setPreference(THEMES[index]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    // The swipe has come to rest on a card.
    onMomentumEnd: (event) => {
      runOnJS(choose)(indexAt(event.contentOffset.x));
    },
  });
  useAnimatedReaction(
    () => indexAt(scrollX.value),
    (index, previous) => {
      if (index !== previous) runOnJS(setCentred)(index);
    },
  );

  function press(index: number) {
    listRef.current?.scrollTo({ x: index * step, animated: !motionOff });
    choose(index);
  }

  return (
    // Left to right in every language, like the app's other pickers.
    <View style={{ direction: "ltr" }}>
      <Animated.ScrollView
        ref={listRef}
        horizontal
        accessibilityRole="radiogroup"
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={step}
        contentOffset={{ x: chosen * step, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: (width - cardWidth) / 2, gap: CARD_GAP }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {THEMES.map((theme, index) => (
          <ThemeCard
            key={theme}
            theme={theme}
            index={index}
            width={cardWidth}
            step={step}
            scrollX={scrollX}
            centred={centred === index}
            label={t(THEME_LABELS[theme])}
            onPress={() => press(index)}
          />
        ))}
      </Animated.ScrollView>

      <AppText className="mt-4 text-center text-xl font-semibold text-cove-ink">
        {t(THEME_LABELS[THEMES[centred]])}
      </AppText>
      <View className="mt-2.5 flex-row items-center justify-center gap-1.5">
        {THEMES.map((theme, index) => (
          <View
            key={theme}
            style={{
              width: centred === index ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor:
                centred === index ? colors.accentText : withAlpha(colors.muted, 0.4),
            }}
          />
        ))}
      </View>
    </View>
  );
}

function ThemeCard({
  theme,
  index,
  width,
  step,
  scrollX,
  centred,
  label,
  onPress,
}: {
  theme: ThemePreference;
  index: number;
  width: number;
  /** Distance between one card and the next. */
  step: number;
  scrollX: SharedValue<number>;
  centred: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const height = Math.round(width * CARD_HEIGHT_RATIO);

  // Follows the finger: full size in the centre, smaller and fainter to the sides.
  const style = useAnimatedStyle(() => {
    const away = Math.abs(scrollX.value / step - index);
    return {
      opacity: interpolate(away, [0, 1], [1, SIDE_OPACITY], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(away, [0, 1], [1, SIDE_SCALE], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected: centred }}
        accessibilityLabel={label}
      >
        <View
          style={{
            width,
            height,
            borderRadius: Math.round(width * 0.13),
            overflow: "hidden",
            borderWidth: 2,
            borderColor: centred ? colors.accentText : withAlpha(colors.muted, 0.25),
          }}
        >
          {theme === "system" ? (
            <>
              <ThemeScene look="light" width={width} height={height} />
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
                <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, width }}>
                  <ThemeScene look="dark" width={width} height={height} />
                </View>
              </View>
            </>
          ) : (
            <ThemeScene look={theme} width={width} height={height} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** The app's page in miniature: a header, list rows and the tab bar. */
function ThemeScene({
  look,
  width,
  height,
}: {
  look: "light" | "dark" | "glass";
  width: number;
  height: number;
}) {
  const { accent, glassFrost, surfaceDepth } = useTheme();
  const glassLook = look === "glass";
  const palette = glassLook
    ? getGlassColors(accent, glassFrost)
    : getColors(look, accent, surfaceDepth);
  // Every measure below is a share of the card's width, so any size looks the same.
  const u = width / 100;
  const edge = glassLook ? { borderWidth: 1, borderColor: palette.line } : null;
  // Light pages open with a band of the theme colour, dark ones with a darker band; glass has none.
  const band = look === "light" ? palette.accent : look === "dark" ? palette.deep : undefined;
  const title = look === "light" ? palette.onAccent : palette.ink;

  return (
    <View
      style={[
        { width, height, backgroundColor: palette.ice },
        glassLook ? glassBackdropStyle(accent) : null,
      ]}
    >
      <View
        style={{
          height: 30 * u,
          backgroundColor: band,
          paddingHorizontal: 9 * u,
          justifyContent: "center",
          gap: 3 * u,
        }}
      >
        <View
          style={{
            width: 38 * u,
            height: 5 * u,
            borderRadius: 3 * u,
            backgroundColor: withAlpha(title, 0.9),
          }}
        />
        <View
          style={{
            width: 24 * u,
            height: 3 * u,
            borderRadius: 2 * u,
            backgroundColor: withAlpha(title, 0.5),
          }}
        />
      </View>
      <View style={{ paddingHorizontal: 7 * u, paddingTop: 8 * u, gap: 6 * u }}>
        {[0.62, 0.42, 0.54].map((share, row) => (
          <View
            key={row}
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 5 * u,
                height: 17 * u,
                paddingHorizontal: 6 * u,
                borderRadius: 6 * u,
                backgroundColor: palette.paper,
              },
              edge,
            ]}
          >
            <View
              style={{
                width: 7 * u,
                height: 7 * u,
                borderRadius: 4 * u,
                borderWidth: 1.5,
                borderColor: row === 0 ? palette.accent : withAlpha(palette.muted, 0.6),
                backgroundColor: row === 0 ? palette.accent : "transparent",
              }}
            />
            <View
              style={{
                width: `${share * 100}%`,
                height: 4 * u,
                borderRadius: 2 * u,
                backgroundColor: withAlpha(palette.ink, 0.35),
              }}
            />
          </View>
        ))}
      </View>
      {/* The floating tab bar, with the current tab marked. */}
      <View
        style={[
          {
            position: "absolute",
            left: 14 * u,
            right: 14 * u,
            bottom: 7 * u,
            height: 13 * u,
            borderRadius: 7 * u,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-evenly",
            backgroundColor: look === "light" ? palette.white : palette.mist,
          },
          edge,
        ]}
      >
        {[0, 1, 2, 3].map((tab) => (
          <View
            key={tab}
            style={{
              width: (tab === 0 ? 10 : 4) * u,
              height: 4 * u,
              borderRadius: 2 * u,
              backgroundColor: tab === 0 ? palette.accentText : withAlpha(palette.muted, 0.55),
            }}
          />
        ))}
      </View>
    </View>
  );
}
