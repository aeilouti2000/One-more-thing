import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { I18nManager, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AuthBrand } from "@/features/auth/components/auth-frame";
import { GuestOnly } from "@/features/auth/components/guest-only";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import type { TranslationKey } from "@/constants/i18n";
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const HOW_IT_WORKS_STEPS: {
  key: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "howItWorksStep1", icon: "home-outline" },
  { key: "howItWorksStep2", icon: "people-outline" },
  { key: "howItWorksStep3", icon: "add-circle-outline" },
  { key: "howItWorksStep4", icon: "cart-outline" },
];

const STEP_HOLD_MS = 2800;
const STEP_FADE_MS = 280;

const MARK = "#F5A623";

/**
 * Android draws RTL script on the opposite edge from textAlign.
 * "left" is the visual right for Arabic on Android. Web and iOS use "right".
 */
function rtlAlign() {
  return Platform.OS === "android" ? "left" : "right";
}

export default function WelcomeScreen() {
  const { t, locale, setLocale, isRTL } = useI18n();
  const { colors, scheme, setScheme } = useTheme();
  const dark = scheme === "dark";
  // Web mirrors flex from the document direction. Native mirrors only when
  // the phone language is RTL, so compensate when the app language differs.
  const row =
    Platform.OS === "web" || isRTL === I18nManager.isRTL
      ? "row"
      : "row-reverse";
  const start = isRTL ? rtlAlign() : "left";

  return (
    <GuestOnly>
      <Screen safeTop>
        <View style={[styles.header, { flexDirection: row }]}>
          <View style={styles.brandName}>
            <AppText
              numberOfLines={1}
              style={{
                color: colors.ink,
                fontWeight: "600",
                fontSize: 24,
                lineHeight: 32,
                textAlign: isRTL && Platform.OS === "android" ? "right" : start,
                writingDirection: Platform.OS === "android" ? "ltr" : isRTL ? "rtl" : "ltr",
              }}
            >
              {t("appName")}
            </AppText>
          </View>
          <View style={[styles.headerActions, { flexDirection: row }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("appearance")}
              onPress={() => setScheme(dark ? "light" : "dark")}
              hitSlop={8}
              style={styles.iconButton}
            >
              <Ionicons
                name={dark ? "sunny-outline" : "moon-outline"}
                size={22}
                color={colors.ink}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("languageLabel")}
              onPress={() => setLocale(locale === "ar" ? "en" : "ar")}
              hitSlop={8}
              style={styles.iconButton}
            >
              <Ionicons name="language-outline" size={22} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        <AuthBrand showName={false} />

        <View style={styles.slips}>
          <Animated.View entering={FadeInDown.delay(60).duration(260)}>
            <PreviewSlip
              label={t("previewMilk")}
              done
              style={{ transform: [{ rotate: "-7deg" }, { translateX: isRTL ? 14 : -14 }] }}
            />
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(150).duration(260)}>
            <PreviewSlip
              label={t("previewBread")}
              done
              style={{ transform: [{ rotate: "6deg" }, { translateX: isRTL ? -16 : 16 }] }}
            />
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(240).duration(260)}>
            <PreviewSlip
              label={t("previewOpen")}
              style={{ transform: [{ rotate: "-2deg" }], width: "74%", maxWidth: 250 }}
            />
          </Animated.View>
        </View>

        <Animated.View entering={FadeIn.delay(360).duration(280)} style={styles.copy}>
          <HowItWorksCopy key={locale} />
        </Animated.View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("logIn")}
            onPress={() => router.push("/login")}
            style={styles.buttonPress}
          >
            <View style={[styles.button, { backgroundColor: colors.accent }]}>
              <AppText
                style={{
                  color: colors.onAccent,
                  fontWeight: "600",
                  fontSize: 16,
                  lineHeight: 20,
                  textAlign: "center",
                }}
              >
                {t("logIn")}
              </AppText>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("createAccount")}
            onPress={() => router.push("/signup")}
            style={styles.buttonPress}
          >
            <View
              style={[
                styles.button,
                {
                  backgroundColor: dark ? withAlpha(colors.white, 0.04) : colors.paper,
                  borderWidth: 1,
                  borderColor: dark ? withAlpha(colors.white, 0.16) : colors.line,
                },
              ]}
            >
              <AppText
                style={{
                  color: colors.ink,
                  fontWeight: "600",
                  fontSize: 16,
                  lineHeight: 20,
                  textAlign: "center",
                }}
              >
                {t("createAccount")}
              </AppText>
            </View>
          </Pressable>
        </View>

        <View style={[styles.legal, { flexDirection: row }]}>
          <Pressable onPress={() => router.push("/legal/privacy" as Href)} accessibilityRole="link">
            <AppText style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
              {t("privacyPolicy")}
            </AppText>
          </Pressable>
          <Pressable onPress={() => router.push("/legal/terms" as Href)} accessibilityRole="link">
            <AppText style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
              {t("terms")}
            </AppText>
          </Pressable>
        </View>
      </Screen>
    </GuestOnly>
  );
}

function HowItWorksCopy() {
  const { t, isRTL } = useI18n();
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const reveal = useSharedValue(1);
  const current = HOW_IT_WORKS_STEPS[step] ?? HOW_IT_WORKS_STEPS[0];

  useEffect(() => {
    reveal.value = 1;

    let active = true;
    const showNext = () => {
      if (!active) return;
      setStep((index) => (index + 1) % HOW_IT_WORKS_STEPS.length);
      reveal.value = withTiming(1, {
        duration: STEP_FADE_MS,
        easing: Easing.out(Easing.cubic),
      });
    };

    const id = setInterval(() => {
      if (!active) return;
      reveal.value = withTiming(
        0,
        { duration: STEP_FADE_MS, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(showNext)();
        },
      );
    }, STEP_HOLD_MS);

    return () => {
      active = false;
      clearInterval(id);
      cancelAnimation(reveal);
    };
  }, [reveal]);

  const stageStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: interpolate(reveal.value, [0, 1], [6, 0]) }],
  }));

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${t("howItWorks")}. ${t("howItWorksBody")}`}
      style={styles.howItWorks}
    >
      <AppText
        style={{
          color: colors.accent,
          fontWeight: "600",
          fontSize: 14,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {t("howItWorks")}
      </AppText>

      <Animated.View style={[styles.stepStage, stageStyle]}>
        <Ionicons name={current.icon} size={22} color={colors.accent} />
        <AppText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{
            flexShrink: 1,
            color: colors.ink,
            fontWeight: "600",
            fontSize: 18,
            lineHeight: 24,
            textAlign: "center",
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {t(current.key)}
        </AppText>
      </Animated.View>
    </View>
  );
}

function PreviewSlip({
  label,
  done = false,
  style,
}: {
  label: string;
  done?: boolean;
  style?: ViewStyle;
}) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const dark = scheme === "dark";

  return (
    <View
      style={[
        styles.slip,
        {
          flexDirection:
            Platform.OS === "web" || isRTL === I18nManager.isRTL ? "row" : "row-reverse",
          backgroundColor: done ? (dark ? colors.paper : colors.white) : MARK,
          boxShadow: dark
            ? "0 12px 28px rgba(0, 0, 0, 0.35)"
            : "0 12px 28px rgba(70, 100, 140, 0.14)",
        },
        style,
      ]}
    >
      {done ? (
        <View style={[styles.check, { backgroundColor: colors.accent }]}>
          <Ionicons name="checkmark" size={14} color={colors.onAccent} />
        </View>
      ) : (
        <View style={[styles.ring, { borderColor: colors.white }]} />
      )}
      <View style={styles.slipLabel}>
        <AppText
          numberOfLines={1}
          style={{
            width: "100%",
            color: done ? colors.ink : colors.white,
            fontWeight: "600",
            fontSize: 14,
            lineHeight: 20,
            textAlign: isRTL && Platform.OS === "android" ? "right" : "left",
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  brandName: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  headerActions: {
    alignItems: "center",
    gap: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  slips: {
    marginTop: 28,
    alignItems: "center",
    gap: 10,
  },
  slip: {
    justifyContent: "flex-start",
    width: "64%",
    maxWidth: 230,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  slipLabel: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  copy: {
    marginTop: 50,
    alignItems: "center",
    width: "100%",
  },
  howItWorks: {
    width: "100%",
    alignItems: "center",
    gap: 10,
  },
  stepStage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 24,
    maxWidth: "92%",
    paddingHorizontal: 8,
  },
  actions: {
    marginTop: 60,
    marginBottom: 46,
    alignItems: "center",
    gap: 12,
  },
  buttonPress: {
    width: "72%",
    maxWidth: 260,
    minWidth: 200,
  },
  button: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  legal: {
    marginTop: 16,
    justifyContent: "center",
    alignItems: "center",
    gap: 22,
  },
});
