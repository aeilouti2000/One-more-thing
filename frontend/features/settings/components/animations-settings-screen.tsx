import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { withAlpha } from "@/constants/theme";
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
import { useAnimationsSetting } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** The two choices, in the order shown. "On" is the app as it always was. */
const OPTIONS = [
  { off: false, icon: "flash-outline", title: "settingOn", body: "animationsOnBody" },
  { off: true, icon: "ban-outline", title: "settingOff", body: "animationsOffBody" },
] as const satisfies readonly {
  off: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}[];

/** "On" or "Off", as shown on the Preferences card and under this page's title. */
export function animationsLabel(off: boolean, t: (key: "settingOn" | "settingOff") => string) {
  return t(off ? "settingOff" : "settingOn");
}

export default function AnimationsSettingsScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { off, setOff } = useAnimationsSetting();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");

  function choose(next: boolean) {
    if (next === off) return;
    void Haptics.selectionAsync();
    setOff(next);
  }

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("animations")}
        subtitle={animationsLabel(off, t)}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <CardBlock>
          <View className="mb-3 flex-row items-center gap-3">
            <SettingsCardIcon icon="flash-outline" colors={colors} />
            <SettingsCardCopy title={t("animations")} body={t("animationsBody")} />
          </View>
          <MotionPreview />
        </CardBlock>

        <View accessibilityRole="radiogroup" className="gap-3">
          {OPTIONS.map((option) => {
            const selected = option.off === off;
            return (
              <Pressable
                key={option.title}
                onPress={() => choose(option.off)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${t(option.title)}, ${t(option.body)}`}
                className="flex-row items-center gap-3 overflow-hidden rounded-3xl bg-cove-paper px-4 py-4 active:opacity-80"
                style={{
                  borderWidth: 2,
                  borderColor: selected ? colors.accentText : "transparent",
                }}
              >
                <SettingsCardIcon icon={option.icon} colors={colors} />
                <SettingsCardCopy title={t(option.title)} body={t(option.body)} />
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: selected ? 0 : 1.5,
                    borderColor: withAlpha(colors.muted, 0.5),
                    backgroundColor: selected ? colors.accent : "transparent",
                  }}
                >
                  {selected ? (
                    <Ionicons name="checkmark" size={14} color={colors.onAccent} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </SettingsSection>
    </Screen>
  );
}

const SCENE_HEIGHT = 168;
const SHEET_HEIGHT = 96;
const ROW_HEIGHT = 24;
const ROW_GAP = 6;
const TABS_WIDTH = 150;
const TABS_PAD = 3;
const TAB_CELL = (TABS_WIDTH - TABS_PAD * 2) / 3;
const STEP_MS = 1300;

/**
 * A small picture of the app that plays the same four steps over and over:
 * a sheet opens, closes, an item joins the list, the tab changes. These are
 * ordinary animations, so they follow the setting like the rest of the app
 * and the choice can be seen before leaving the page.
 */
function MotionPreview() {
  const { colors } = useTheme();
  const sheet = useSharedValue(0);
  const added = useSharedValue(0);
  const tab = useSharedValue(0);

  useEffect(() => {
    let step = 0;
    // A plain timer drives the steps, so they keep coming with animations off.
    const timer = setInterval(() => {
      step = (step + 1) % 4;
      sheet.set(
        step === 1
          ? withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
          : withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }),
      );
      added.set(withTiming(step >= 2 ? 1 : 0, { duration: 220 }));
      tab.set(withSpring(step === 3 ? 1 : 0, { mass: 1, stiffness: 235, damping: 20 }));
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [added, sheet, tab]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheet.value) * SHEET_HEIGHT }],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: sheet.value }));
  const addedStyle = useAnimatedStyle(() => ({
    height: added.value * ROW_HEIGHT,
    marginBottom: added.value * ROW_GAP,
    opacity: added.value,
  }));
  const listStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.max(0, tab.value)) }));
  const otherStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, tab.value)) }));
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tab.value * TAB_CELL }],
  }));
  const tabsStyle = useAnimatedStyle(() => ({ opacity: 1 - sheet.value }));

  const bar = withAlpha(colors.ink, 0.3);
  const row = {
    height: ROW_HEIGHT,
    marginBottom: ROW_GAP,
    borderRadius: 9,
    backgroundColor: colors.paper,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 8,
    overflow: "hidden",
  } as const;

  function item(width: `${number}%`, isNew = false) {
    return (
      <>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            borderWidth: 1.5,
            borderColor: isNew ? colors.accent : withAlpha(colors.muted, 0.5),
            backgroundColor: isNew ? colors.accent : "transparent",
          }}
        />
        <View style={{ width, height: 5, borderRadius: 3, backgroundColor: bar }} />
      </>
    );
  }

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden rounded-2xl"
      style={{ direction: "ltr", height: SCENE_HEIGHT, backgroundColor: colors.ice }}
    >
      <Animated.View style={[{ position: "absolute", top: 10, left: 10, right: 10 }, listStyle]}>
        <View style={row}>{item("52%")}</View>
        <Animated.View style={[row, addedStyle]}>{item("38%", true)}</Animated.View>
        <View style={row}>{item("64%")}</View>
        <View style={row}>{item("44%")}</View>
      </Animated.View>

      <Animated.View
        style={[{ position: "absolute", top: 10, left: 10, right: 10, gap: ROW_GAP }, otherStyle]}
      >
        {(["40%", "58%"] as const).map((width) => (
          <View
            key={width}
            style={{ borderRadius: 10, backgroundColor: colors.paper, padding: 8, gap: 6 }}
          >
            <View style={{ width, height: 5, borderRadius: 3, backgroundColor: bar }} />
            <View style={{ width: "72%", height: 5, borderRadius: 3, backgroundColor: bar }} />
          </View>
        ))}
      </Animated.View>

      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: 9,
            alignSelf: "center",
            width: TABS_WIDTH,
            height: 26,
            borderRadius: 13,
            padding: TABS_PAD,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.overlay,
            borderWidth: 1,
            borderColor: withAlpha(colors.muted, 0.18),
          },
          tabsStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              position: "absolute",
              top: TABS_PAD,
              bottom: TABS_PAD,
              left: TABS_PAD,
              width: TAB_CELL,
              borderRadius: 10,
              backgroundColor: colors.mist,
            },
            pillStyle,
          ]}
        />
        {[0, 1, 2].map((index) => (
          <View key={index} style={{ flex: 1, alignItems: "center" }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 3,
                backgroundColor: withAlpha(colors.muted, 0.6),
              }}
            />
          </View>
        ))}
      </Animated.View>

      <Animated.View
        style={[
          { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(4,20,36,0.35)" },
          dimStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: SHEET_HEIGHT,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            backgroundColor: colors.overlay,
            paddingHorizontal: 12,
            paddingTop: 8,
            gap: 9,
          },
          sheetStyle,
        ]}
      >
        <View
          style={{
            alignSelf: "center",
            width: 28,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.mist,
          }}
        />
        <View style={{ width: "45%", height: 6, borderRadius: 3, backgroundColor: bar }} />
        <View style={{ width: "80%", height: 6, borderRadius: 3, backgroundColor: bar }} />
        <View style={{ height: 22, borderRadius: 10, backgroundColor: colors.accent }} />
      </Animated.View>
    </View>
  );
}
