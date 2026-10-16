import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { I18nManager, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { GuestOnly } from "@/features/auth/components/guest-only";
import { AppLogo } from "@/components/ui/AppLogo";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

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
      <Screen>
        <View style={[styles.header, { flexDirection: row }]}>
          <View style={[styles.brand, { flexDirection: row }]}>
            <AppLogo size={56} />
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

        <View style={styles.slips}>
          <PreviewSlip
            label={t("previewMilk")}
            done
            style={{ transform: [{ rotate: "-7deg" }, { translateX: isRTL ? 14 : -14 }] }}
          />
          <PreviewSlip
            label={t("previewBread")}
            done
            style={{ transform: [{ rotate: "6deg" }, { translateX: isRTL ? -16 : 16 }] }}
          />
          <PreviewSlip
            label={t("previewOpen")}
            style={{ transform: [{ rotate: "-2deg" }], width: "74%", maxWidth: 250 }}
          />
        </View>

        <View style={styles.copy}>
          <AppText
            style={{
              width: "100%",
              color: colors.ink,
              fontWeight: "600",
              fontSize: 16,
              lineHeight: 22,
              textAlign: start,
              writingDirection: isRTL ? "rtl" : "ltr",
            }}
          >
            {t("howItWorks")}
          </AppText>
          <AppText
            style={{
              marginTop: 6,
              width: "100%",
              color: colors.muted,
              fontSize: 15,
              lineHeight: 22,
              textAlign: start,
              writingDirection: isRTL ? "rtl" : "ltr",
            }}
          >
            {t("howItWorksBody")}
          </AppText>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("logIn")}
            onPress={() => router.push("/login")}
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
          backgroundColor: done ? (dark ? colors.paper : colors.white) : colors.accent,
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
        <View style={styles.ring} />
      )}
      <View style={styles.slipLabel}>
        <AppText
          numberOfLines={1}
          style={{
            width: "100%",
            color: done ? colors.ink : colors.onAccent,
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
    marginBottom: 8,
  },
  brand: {
    alignItems: "center",
    gap: 12,
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  brandName: {
    flexGrow: 0,
    flexShrink: 1,
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
    borderColor: MARK,
  },
  copy: {
    marginTop: 48,
  },
  actions: {
    marginTop: 48,
    gap: 12,
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
