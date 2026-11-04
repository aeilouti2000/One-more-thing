import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import { I18nManager, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AuthFrame, AuthLegal, AuthLink } from "@/features/auth/components/auth-frame";
import { GuestOnly } from "@/features/auth/components/guest-only";
import { AppLogo } from "@/components/ui/AppLogo";
import { AppText } from "@/components/ui/AppText";
import type { TranslationKey } from "@/constants/i18n";
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const STEPS: { key: TranslationKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "welcomeStepHome", icon: "home-outline" },
  { key: "welcomeStepInvite", icon: "people-outline" },
  { key: "welcomeStepShop", icon: "checkmark-done-outline" },
];

/** Static colors from the app icon — do not follow theme. */
const ICON_MARK = "#FFB020";
const PARTNER = "#E0A64A";
const LIVE = "#5FD08A";

const TYPE_MS = 90;
/** Pause after typing before the item "lands" on the list. */
const LAND_DELAY_MS = 450;
/** How long the landed item stays before the loop restarts. */
const LAND_HOLD_MS = 2400;
const BOB_MS = 3200;

/**
 * Welcome (design A): a live picture of the shared list, one clear promise,
 * the three steps at a glance, and sign-up as the main action.
 */
export default function WelcomeScreen() {
  const { t, locale, setLocale, isRTL } = useI18n();
  const { colors, scheme, setScheme } = useTheme();
  const dark = scheme === "dark";
  // The app flips direction itself when the chosen language differs from the
  // native layout direction (same rule as the rest of the auth screens).
  const row = Platform.OS === "web" || isRTL === I18nManager.isRTL ? "row" : "row-reverse";
  const textAlign = isRTL ? "right" : "left";
  // Everything stays on one screen: the preview card gets the leftover height
  // and scales down when it doesn't fit (layout height ignores transforms).
  const [slotHeight, setSlotHeight] = useState(0);
  const [cardHeight, setCardHeight] = useState(0);
  const scale = slotHeight > 0 && cardHeight > 0 ? Math.min(1, slotHeight / cardHeight) : 1;
  // Each time the typed item lands, the "Synced live" badge blips.
  const [blip, setBlip] = useState(0);
  // Gentle float so the preview feels alive.
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.set(
      withRepeat(
        withSequence(
          withTiming(-4, { duration: BOB_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: BOB_MS, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  return (
    <GuestOnly>
      <AuthFrame scroll={false} bare>
        <View style={styles.page}>
          <LinearGradient
            pointerEvents="none"
            colors={[withAlpha(colors.accent, dark ? 0.22 : 0.14), withAlpha(colors.accent, 0)]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.glow}
          />
          {/* Header */}
          <View style={[styles.header, { flexDirection: row }]}>
            <View style={[styles.brand, { flexDirection: row }]}>
              <AppLogo size={34} />
              <AppText className="text-base font-semibold" style={{ color: colors.ink }}>
                {t("appName")}
              </AppText>
            </View>
            <View style={[styles.tools, { flexDirection: row }]}>
              <ToolButton
                icon={dark ? "sunny-outline" : "moon-outline"}
                label={t("appearance")}
                onPress={() => setScheme(dark ? "light" : "dark")}
              />
              <ToolButton
                icon="language-outline"
                label={t("languageLabel")}
                onPress={() => setLocale(locale === "ar" ? "en" : "ar")}
              />
            </View>
          </View>

          {/* Product card — fills the spare height, shrinks to fit if needed */}
          <View
            style={[styles.previewSlot, { justifyContent: scale < 1 ? "flex-start" : "center" }]}
            onLayout={(event) => setSlotHeight(event.nativeEvent.layout.height)}
          >
          <Animated.View
            entering={FadeInDown.duration(380)}
            onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
            style={[styles.cardWrap, { transform: [{ scale }], transformOrigin: "top" }]}
          >
            <Animated.View style={bobStyle}>
            <View
              style={[
                styles.card,
                {
                  // Solid surface: a see-through card let Android's elevation
                  // shadow show through as a square behind it.
                  backgroundColor: dark ? colors.paper : colors.white,
                  borderColor: dark ? withAlpha(colors.white, 0.08) : withAlpha("#12141A", 0.08),
                },
              ]}
            >
              <View style={[styles.cardHead, { flexDirection: row }]}>
                <AppText className="text-[13px] font-semibold" style={{ color: colors.muted }}>
                  {t("welcomeListName")}
                </AppText>
                <View style={[styles.headRight, { flexDirection: row }]}>
                  <SyncedBadge blip={blip} />
                  <View style={[styles.avatars, { flexDirection: row }]}>
                    <Avatar color={colors.accent} />
                    <Avatar color={PARTNER} overlap />
                  </View>
                </View>
              </View>

              <Animated.View entering={FadeInDown.delay(120).duration(300)}>
                <PreviewRow
                  done
                  label={t("previewMilk")}
                  meta={t("welcomeBoughtByPartner")}
                  row={row}
                  textAlign={textAlign}
                />
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(220).duration(300)}>
                <PreviewRow
                  label={t("previewBread")}
                  meta={t("welcomeAddedByYou")}
                  row={row}
                  textAlign={textAlign}
                />
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(320).duration(300)}>
                <TypingRow
                  key={locale}
                  text={t("previewOpen")}
                  row={row}
                  textAlign={textAlign}
                  onLanded={() => setBlip((value) => value + 1)}
                />
              </Animated.View>
            </View>
            </Animated.View>
          </Animated.View>
          </View>

          {/* Promise */}
          <Animated.View entering={FadeIn.delay(260).duration(360)} style={styles.copy}>

            <AppText
              className="text-[17px] font-semibold leading-[24px]"
              style={{ color: colors.ink, textAlign: "center" }}
            >
              {t("welcomeBody")}
            </AppText>
          </Animated.View>

          {/* Steps */}
          <Animated.View
            entering={FadeIn.delay(380).duration(360)}
            accessible
            accessibilityLabel={`${t("howItWorks")}: ${STEPS.map((step) => t(step.key)).join(", ")}`}
            style={[
              styles.steps,
              {
                flexDirection: row,
                backgroundColor: dark ? withAlpha(colors.white, 0.03) : withAlpha("#12141A", 0.03),
                borderColor: dark ? withAlpha(colors.white, 0.06) : withAlpha("#12141A", 0.06),
              },
            ]}
          >
            {STEPS.map((step, index) => (
              <View key={step.key} style={[styles.stepWrap, { flexDirection: row }]}>
                <View style={styles.step}>
                  <View
                    style={[styles.stepIcon, { backgroundColor: withAlpha(colors.accent, dark ? 0.16 : 0.12) }]}
                  >
                    <Ionicons name={step.icon} size={18} color={colors.accent} />
                    <View style={[styles.stepNumber, { backgroundColor: colors.accent, borderColor: dark ? colors.deep : colors.ice }]}>
                      <AppText className="text-[10px] font-bold" style={{ color: colors.onAccent }}>
                        {index + 1}
                      </AppText>
                    </View>
                  </View>
                  <AppText
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    className="text-xs font-semibold"
                    style={{ color: colors.ink, textAlign: "center" }}
                  >
                    {t(step.key)}
                  </AppText>
                </View>
                {index < STEPS.length - 1 ? (
                  <View style={[styles.connector, { borderColor: withAlpha(colors.muted, 0.35) }]} />
                ) : null}
              </View>
            ))}
          </Animated.View>

          {/* Actions */}
          <Animated.View entering={FadeInDown.delay(440).duration(360)} style={styles.actions}>
            {/* Background lives on an inner View: NativeWind drops function
                styles on Pressable, which left the button as plain text. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("createAccount")}
              onPress={() => router.push("/signup")}
              className="active:opacity-85"
              style={styles.buttonPress}
            >
              <View
                style={[
                  styles.button,
                  styles.primaryButton,
                  { backgroundColor: colors.accent, shadowColor: colors.accent, flexDirection: row },
                ]}
              >
                <AppText className="text-base font-bold" style={{ color: colors.onAccent }}>
                  {t("createAccount")}
                </AppText>
                <Ionicons
                  name={isRTL ? "arrow-back" : "arrow-forward"}
                  size={18}
                  color={colors.onAccent}
                />
              </View>
            </Pressable>
            <AuthLink
              prompt={t("alreadyHaveAccountPrompt")}
              action={t("alreadyHaveAccountAction")}
              onPress={() => router.push("/login")}
            />
          </Animated.View>

          <AuthLegal
            onPrivacy={() => router.push("/legal/privacy" as Href)}
            onTerms={() => router.push("/legal/terms" as Href)}
          />
        </View>
      </AuthFrame>
    </GuestOnly>
  );
}

function ToolButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className="active:opacity-70"
    >
      <View
        style={[
          styles.tool,
          {
            backgroundColor:
              scheme === "dark" ? withAlpha(colors.white, 0.06) : withAlpha("#12141A", 0.05),
          },
        ]}
      >
        <Ionicons name={icon} size={18} color={colors.ink} />
      </View>
    </Pressable>
  );
}

function Avatar({ color, overlap = false }: { color: string; overlap?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: color, borderColor: colors.paper },
        overlap ? { marginStart: -8 } : null,
      ]}
    >
      <Ionicons name="person" size={13} color="#FFFFFF" />
    </View>
  );
}

function SyncedBadge({ blip }: { blip: number }) {
  const { t } = useI18n();
  const pulse = useSharedValue(1);
  const bump = useSharedValue(1);
  useEffect(() => {
    pulse.set(
      withRepeat(
        withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1,
        false,
      ),
    );
  }, [pulse]);
  useEffect(() => {
    if (blip === 0) return;
    bump.set(
      withSequence(
        withTiming(1.14, { duration: 140, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 260, easing: Easing.inOut(Easing.quad) }),
      ),
    );
  }, [blip, bump]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  return (
    <Animated.View entering={ZoomIn.delay(420).duration(260)}>
      <Animated.View style={[styles.badge, bumpStyle]}>
        <Animated.View style={[styles.badgeDot, dotStyle]} />
        <AppText className="text-[11px] font-bold" style={{ color: "#8FE0AD" }}>
          {t("welcomeSynced")}
        </AppText>
      </Animated.View>
    </Animated.View>
  );
}

function PreviewRow({
  label,
  meta,
  done = false,
  row,
  textAlign,
}: {
  label: string;
  meta: string;
  done?: boolean;
  row: "row" | "row-reverse";
  textAlign: "left" | "right";
}) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          flexDirection: row,
          backgroundColor: scheme === "dark" ? withAlpha(colors.white, 0.04) : withAlpha("#12141A", 0.03),
        },
      ]}
    >
      {done ? (
        <Animated.View
          entering={ZoomIn.delay(700).duration(280)}
          style={[styles.check, { backgroundColor: colors.accent }]}
        >
          <Ionicons name="checkmark" size={13} color={colors.onAccent} />
        </Animated.View>
      ) : (
        <View style={[styles.ring, { borderColor: withAlpha(colors.muted, 0.6) }]} />
      )}
      <View style={styles.rowText}>
        <AppText
          numberOfLines={1}
          className="text-sm font-semibold"
          style={{
            color: done ? colors.muted : colors.ink,
            textDecorationLine: done ? "line-through" : "none",
            textAlign,
          }}
        >
          {label}
        </AppText>
        <AppText numberOfLines={1} className="text-[11px]" style={{ color: colors.muted, textAlign }}>
          {meta}
        </AppText>
      </View>
    </View>
  );
}

/**
 * "One more thing…" types itself, lands on the list as a real item ("added by
 * you · just now"), stays a moment, then the loop restarts.
 */
function TypingRow({
  text,
  row,
  textAlign,
  onLanded,
}: {
  text: string;
  row: "row" | "row-reverse";
  textAlign: "left" | "right";
  onLanded?: () => void;
}) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const [count, setCount] = useState(0);
  const [landed, setLanded] = useState(false);
  const caret = useSharedValue(1);
  const landedRef = useRef(onLanded);
  useEffect(() => {
    landedRef.current = onLanded;
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let next = 0;
    const later = (ms: number, fn: () => void) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };
    const type = () => {
      if (next <= text.length) {
        setCount(next);
        next += 1;
        later(TYPE_MS, type);
        return;
      }
      later(LAND_DELAY_MS, () => {
        setLanded(true);
        landedRef.current?.();
        later(LAND_HOLD_MS, () => {
          setLanded(false);
          setCount(0);
          next = 0;
          later(500, type);
        });
      });
    };
    later(900, type);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  useEffect(() => {
    caret.set(
      withRepeat(
        withSequence(
          withTiming(0, { duration: 450, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 450, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [caret]);
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));

  return (
    <View
      style={[
        styles.row,
        {
          flexDirection: row,
          marginBottom: 0,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: landed ? "transparent" : withAlpha(colors.accent, 0.6),
          backgroundColor: landed
            ? dark
              ? withAlpha(colors.white, 0.04)
              : withAlpha("#12141A", 0.03)
            : withAlpha(colors.accent, dark ? 0.12 : 0.07),
        },
      ]}
    >
      <View style={[styles.ring, { borderColor: landed ? withAlpha(colors.muted, 0.6) : ICON_MARK }]} />
      {landed ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.rowText}>
          <AppText numberOfLines={1} className="text-sm font-semibold" style={{ color: colors.ink, textAlign }}>
            {text}
          </AppText>
          <AppText numberOfLines={1} className="text-[11px]" style={{ color: colors.accent, textAlign }}>
            {t("welcomeJustAdded")}
          </AppText>
        </Animated.View>
      ) : (
        <View style={[styles.typing, { flexDirection: row }]}>
          <AppText numberOfLines={1} className="text-sm font-semibold" style={{ color: colors.ink, textAlign }}>
            {text.slice(0, count)}
          </AppText>
          <Animated.View style={[styles.caret, { backgroundColor: colors.accent }, caretStyle]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: 4,
  },
  header: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  brand: {
    alignItems: "center",
    gap: 10,
  },
  tools: {
    gap: 8,
  },
  tool: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  previewSlot: {
    flex: 1,
    minHeight: 0,
  },
  cardWrap: {
    paddingTop: 4,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 22,
  },
  cardHead: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  avatars: {
    alignItems: "center",
  },
  headRight: {
    alignItems: "center",
    gap: 8,
  },
  glow: {
    position: "absolute",
    top: -80,
    left: -40,
    right: -40,
    height: 420,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#173A2A",
    borderWidth: 1,
    borderColor: "#2F7A52",
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: LIVE,
  },
  row: {
    alignItems: "center",
    gap: 12,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 6,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  typing: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  caret: {
    width: 2,
    height: 18,
    borderRadius: 1,
    marginHorizontal: 1,
  },
  copy: {
    marginTop: 20,
    paddingHorizontal: 8,
  },
  steps: {
    marginTop: 18,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "flex-start",
  },
  stepWrap: {
    flex: 1,
    alignItems: "flex-start",
  },
  step: {
    flex: 1,
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 2,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    position: "absolute",
    top: -4,
    end: -6,
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    gap: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  connector: {
    width: 14,
    marginTop: 18,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
  },
  actions: {
    gap: 14,
    marginTop: 18,
    marginBottom: 6,
  },
  buttonPress: {
    alignSelf: "stretch",
  },
  button: {
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
});
