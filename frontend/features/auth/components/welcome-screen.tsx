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
import {
  AuthBrand,
  AuthFrame,
  AuthLegal,
  AuthLink,
} from "@/features/auth/components/auth-frame";
import { GuestOnly } from "@/features/auth/components/guest-only";
import { AppText } from "@/components/ui/AppText";
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

/** Static colors from the app icon — do not follow theme. */
const ICON_NAVY = "#071633";
const ICON_MARK = "#FFB020";

export default function WelcomeScreen() {
  const { t, locale, setLocale, isRTL } = useI18n();
  const { colors, scheme, setScheme } = useTheme();
  const dark = scheme === "dark";

  return (
    <GuestOnly>
      <AuthFrame scroll={false}>
        <View style={styles.page}>
          <View style={styles.toolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("appearance")}
              onPress={() => setScheme(dark ? "light" : "dark")}
              hitSlop={8}
              style={styles.iconButton}
            >
              <Ionicons
                name={dark ? "sunny-outline" : "moon-outline"}
                size={20}
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
              <Ionicons name="language-outline" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.main}>
            <View style={styles.hero}>
              <AuthBrand showName={false} />

              <AppText
                numberOfLines={2}
                style={{
                  marginTop: 12,
                  color: colors.ink,
                  fontWeight: "600",
                  fontSize: 24,
                  lineHeight: 30,
                  letterSpacing: locale === "ar" ? 0 : 0.3,
                  textAlign: "center",
                  writingDirection: isRTL ? "rtl" : "ltr",
                }}
              >
                {t("appName")}
              </AppText>

              <View style={styles.slips}>
                <Animated.View entering={FadeInDown.delay(60).duration(260)}>
                  <PreviewSlip
                    label={t("previewMilk")}
                    done
                    style={{ transform: [{ rotate: "-7deg" }, { translateX: isRTL ? 12 : -12 }] }}
                  />
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(150).duration(260)}>
                  <PreviewSlip
                    label={t("previewBread")}
                    done
                    style={{ transform: [{ rotate: "6deg" }, { translateX: isRTL ? -14 : 14 }] }}
                  />
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(240).duration(260)}>
                  <PreviewSlip
                    label={t("previewOpen")}
                    style={{ transform: [{ rotate: "-2deg" }], width: "74%", maxWidth: 240 }}
                  />
                </Animated.View>
              </View>
            </View>

            <Animated.View entering={FadeIn.delay(320).duration(260)} style={styles.copy}>
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
              <AuthLink
                prompt={t("newHerePrompt")}
                action={t("newHereAction")}
                onPress={() => router.push("/signup")}
              />
            </View>

            <View style={styles.mainSpacer} />
          </View>

          <AuthLegal
            onPrivacy={() => router.push("/legal/privacy" as Href)}
            onTerms={() => router.push("/legal/terms" as Href)}
          />
        </View>
      </AuthFrame>
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
    transform: [{ translateY: interpolate(reveal.value, [0, 1], [4, 0]) }],
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
          fontSize: 12,
          letterSpacing: 2,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {t("howItWorks")}
      </AppText>

      <Animated.View style={[styles.stepStage, stageStyle]}>
        <Ionicons name={current.icon} size={18} color={colors.accent} />
        <AppText
          numberOfLines={2}
          style={{
            flexShrink: 1,
            color: colors.ink,
            fontWeight: "600",
            fontSize: 16,
            lineHeight: 20,
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
          backgroundColor: done ? (dark ? colors.mist : colors.white) : ICON_NAVY,
          borderWidth: done ? 1 : 0,
          borderColor: done
            ? dark
              ? withAlpha(colors.white, 0.08)
              : withAlpha("#12141A", 0.06)
            : "transparent",
        },
        style,
      ]}
    >
      {done ? (
        <View style={[styles.check, { backgroundColor: colors.accent }]}>
          <Ionicons name="checkmark" size={12} color={colors.onAccent} />
        </View>
      ) : (
        <View style={[styles.ring, { borderColor: ICON_MARK }]} />
      )}
      <View style={styles.slipLabel}>
        <AppText
          numberOfLines={1}
          style={{
            width: "100%",
            color: done ? colors.ink : "#FFFFFF",
            fontWeight: "600",
            fontSize: 13,
            lineHeight: 18,
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
  page: {
    flex: 1,
    minHeight: 0,
  },
  toolbar: {
    position: "absolute",
    top: -8,
    right: -8,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  main: {
    flex: 1,
    minHeight: 0,
    marginTop: 50,
  },
  hero: {
    flexShrink: 0,
    alignItems: "center",
    paddingTop: 20,
  },
  slips: {
    marginTop: 18,
    alignItems: "center",
    gap: 8,
  },
  slip: {
    justifyContent: "flex-start",
    width: "64%",
    maxWidth: 220,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
  },
  slipLabel: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  copy: {
    marginTop: 60,
    marginBottom: 20,
    alignItems: "center",
    width: "100%",
    flexShrink: 0,
  },
  howItWorks: {
    width: "100%",
    alignItems: "center",
    gap: 6,
  },
  stepStage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    maxWidth: "92%",
    paddingHorizontal: 8,
  },
  actions: {
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  mainSpacer: {
    flex: 1,
    minHeight: 12,
  },
  buttonPress: {
    width: "100%",
    maxWidth: 280,
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
});
