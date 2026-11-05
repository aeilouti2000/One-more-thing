import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";


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
/** Spend chart in the Costs tile (last bar = this month). */
const BAR_HEIGHTS = [10, 16, 8, 20, 13, 24];

/**
 * Welcome: a live shared list where "One more thing" types itself in; when it
 * lands, a notification shows it reaching your partner. Trip and Costs tiles
 * below hint at the rest of the app; sign-up is the main action.
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
  // The partner notification shows while the typed item is on the list.
  const [notified, setNotified] = useState(false);
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
      <AuthFrame scroll={false} dense>
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
            <PartnerNotification visible={notified} item={t("previewOpen")} row={row} textAlign={textAlign} />

            <Animated.View style={bobStyle}>
            <View
              style={[
                styles.card,
                {
                  // Solid surface: a see-through card let Android's elevation
                  // shadow show through as a square behind it.
                  // Solid, and a step off the page card so it reads as its own surface.
                  backgroundColor: dark ? colors.deep : colors.ice,
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
                  onLanded={() => {
                    setBlip((value) => value + 1);
                    setNotified(true);
                  }}
                  onReset={() => setNotified(false)}
                />
              </Animated.View>
            </View>
            </Animated.View>


            <Animated.View
              entering={FadeInDown.delay(380).duration(360)}
              style={[styles.tiles, { flexDirection: row }]}
            >
              <FeatureTile icon="cart-outline" title={t("welcomeTripTitle")} row={row} textAlign={textAlign}>
                <AppText className="text-[22px] font-bold" style={{ color: colors.ink, textAlign }}>
                  7<AppText className="text-sm font-semibold" style={{ color: colors.muted }}>/10</AppText>
                </AppText>
                <View style={[styles.track, { backgroundColor: withAlpha(colors.muted, 0.2) }]}>
                  <View
                    style={[
                      styles.trackFill,
                      { backgroundColor: colors.accent, alignSelf: row === "row" ? "flex-start" : "flex-end" },
                    ]}
                  />
                </View>
                <AppText numberOfLines={1} className="text-[11px]" style={{ color: colors.muted, textAlign }}>
                  {t("welcomeTripBody")}
                </AppText>
              </FeatureTile>
              <FeatureTile icon="receipt-outline" title={t("welcomeCostsTitle")} row={row} textAlign={textAlign}>
                <AppText className="text-[22px] font-bold" style={{ color: colors.ink, textAlign }}>
                  {t("welcomeCostsValue")}
                </AppText>
                <View style={[styles.bars, { flexDirection: row }]}>
                  {BAR_HEIGHTS.map((height, index) => (
                    <View
                      key={index}
                      style={[
                        styles.bar,
                        {
                          height,
                          backgroundColor:
                            index === BAR_HEIGHTS.length - 1 ? colors.accent : withAlpha(colors.muted, 0.25),
                        },
                      ]}
                    />
                  ))}
                </View>
                <AppText numberOfLines={1} className="text-[11px]" style={{ color: colors.muted, textAlign }}>
                  {t("welcomeCostsBody")}
                </AppText>
              </FeatureTile>
            </Animated.View>
          </Animated.View>
          </View>

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
 * What your partner's phone shows when the typed item lands. Space is always
 * reserved so the tiles below never jump; it slides/fades in and out.
 */
function PartnerNotification({
  visible,
  item,
  row,
  textAlign,
}: {
  visible: boolean;
  item: string;
  row: "row" | "row-reverse";
  textAlign: "left" | "right";
}) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(visible ? 1 : 0, {
        duration: visible ? 360 : 220,
        easing: visible ? Easing.out(Easing.back(1.4)) : Easing.in(Easing.quad),
      }),
    );
  }, [shown, visible]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * -10 }, { scale: 0.96 + shown.value * 0.04 }],
  }));
  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[
        styles.notice,
        {
          flexDirection: row,
          backgroundColor: dark ? colors.mist : colors.white,
          borderColor: dark ? withAlpha(colors.white, 0.1) : withAlpha("#12141A", 0.08),
        },
        style,
      ]}
    >
      <AppLogo size={30} />
      <View style={styles.rowText}>
        <View style={[styles.noticeHead, { flexDirection: row }]}>
          <AppText numberOfLines={1} className="flex-1 text-[13px] font-bold" style={{ color: colors.ink, textAlign }}>
            {t("welcomeNotifyTitle")}
          </AppText>
          <AppText className="text-[11px]" style={{ color: colors.muted }}>
            {t("welcomeNow")}
          </AppText>
        </View>
        <AppText numberOfLines={1} className="text-xs" style={{ color: colors.muted, textAlign }}>
          {t("welcomeNotifyBody", { item })}
        </AppText>
      </View>
    </Animated.View>
  );
}

function FeatureTile({
  icon,
  title,
  row,
  textAlign,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  row: "row" | "row-reverse";
  textAlign: "left" | "right";
  children: ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: dark ? colors.deep : colors.ice,
          borderColor: dark ? withAlpha(colors.white, 0.08) : withAlpha("#12141A", 0.08),
        },
      ]}
    >
      <View style={[styles.tileHead, { flexDirection: row }]}>
        <View style={[styles.tileIcon, { backgroundColor: withAlpha(colors.accent, dark ? 0.16 : 0.12) }]}>
          <Ionicons name={icon} size={15} color={colors.accent} />
        </View>
        <AppText numberOfLines={1} className="flex-1 text-[13px] font-semibold" style={{ color: colors.ink, textAlign }}>
          {title}
        </AppText>
      </View>
      {children}
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
  onReset,
}: {
  text: string;
  row: "row" | "row-reverse";
  textAlign: "left" | "right";
  onLanded?: () => void;
  onReset?: () => void;
}) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const [count, setCount] = useState(0);
  const [landed, setLanded] = useState(false);
  const caret = useSharedValue(1);
  const landedRef = useRef(onLanded);
  const resetRef = useRef(onReset);
  useEffect(() => {
    landedRef.current = onLanded;
    resetRef.current = onReset;
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
          resetRef.current?.();
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
  notice: {
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  noticeHead: {
    alignItems: "center",
    gap: 8,
  },
  tiles: {
    gap: 10,
    marginTop: 10,
  },
  tile: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  tileHead: {
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  tileIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  trackFill: {
    width: "70%",
    height: "100%",
    borderRadius: 3,
  },
  bars: {
    alignItems: "flex-end",
    gap: 4,
    height: 24,
  },
  bar: {
    width: 7,
    borderRadius: 2,
  },
  primaryButton: {
    gap: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
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
