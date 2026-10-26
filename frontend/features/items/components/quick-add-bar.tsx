import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { scaleFontSize } from "@/constants/font";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { radius, tabBar, withAlpha } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

type QuickAddBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onOpenDetails: () => void;
  busy?: boolean;
  inputStyle?: StyleProp<TextStyle>;
  footer?: ReactNode;
};

const TYPE_MS = 55;
const HOLD_MS = 1600;
const DELETE_MS = 28;
const BETWEEN_MS = 420;

export function QuickAddBar({
  value,
  onChangeText,
  onSubmit,
  onOpenDetails,
  busy = false,
  inputStyle,
  footer,
}: QuickAddBarProps) {
  const { colors, scheme } = useTheme();
  const { t, isRTL } = useI18n();
  const { scale } = useFontScale();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const showHint = !value && !focused && !busy;

  const phrases = useMemo(
    () => [
      t("quickAddPlaceholder"),
      ...t("quickAddHints")
        .split("|")
        .map((hint) => hint.trim())
        .filter(Boolean),
    ],
    [t],
  );

  const addEnabled = Boolean(value.trim()) && !busy;
  const caret = useSharedValue(1);
  const shakeX = useSharedValue(0);

  useEffect(() => {
    if (!showHint) {
      cancelAnimation(caret);
      caret.value = 1;
      return;
    }
    caret.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 420 }),
        withTiming(1, { duration: 420 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(caret);
  }, [showHint, caret]);

  const caretStyle = useAnimatedStyle(() => ({
    opacity: caret.value,
  }));

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const dark = scheme === "dark";
  const chipBorder = withAlpha(dark ? colors.muted : colors.accent, 0.34);
  const cardRadius = radius.md;

  function promptForName() {
    inputRef.current?.focus();
    shakeX.value = withSequence(
      withTiming(-6, { duration: 40 }),
      withTiming(6, { duration: 50 }),
      withTiming(-5, { duration: 45 }),
      withTiming(4, { duration: 45 }),
      withTiming(0, { duration: 40 }),
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  function handleAdd() {
    if (busy) return;
    if (!value.trim()) {
      promptForName();
      return;
    }
    onSubmit();
  }

  return (
    <View className="mb-3">
      <Animated.View
        className="overflow-hidden"
        style={[
          {
            backgroundColor: colors.paper,
            borderWidth: tabBar.borderWidth,
            borderColor: chipBorder,
            borderRadius: cardRadius,
          },
          shakeStyle,
        ]}
      >
        <View className="flex-row items-center gap-2 px-3 py-2.5">
          <View className="relative h-12 min-w-0 flex-1 justify-center px-1">
            {showHint ? (
              <View
                pointerEvents="none"
                style={[
                  styles.hintRow,
                  // Root layout already sets direction for Arabic; do not
                  // row-reverse or the hint starts on the left again.
                  { justifyContent: "flex-start" },
                ]}
              >
                <TypewriterText
                  phrases={phrases}
                  active={showHint}
                  color={colors.muted}
                  fontSize={scaleFontSize(15, scale)}
                  isRTL={isRTL}
                />
                <Animated.View
                  style={[
                    styles.caret,
                    {
                      backgroundColor: colors.muted,
                      marginStart: 2,
                    },
                    caretStyle,
                  ]}
                />
              </View>
            ) : null}
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              placeholder={showHint ? "" : t("quickAddPlaceholder")}
              placeholderTextColor={colors.muted}
              onSubmitEditing={handleAdd}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              returnKeyType="done"
              editable={!busy}
              textAlign={isRTL ? "right" : "left"}
              textAlignVertical="center"
              allowFontScaling={false}
              style={[inputStyle, styles.input]}
              className="h-12 min-w-0 flex-1 text-cove-ink"
            />
          </View>

          <Pressable
            onPress={onOpenDetails}
            accessibilityRole="button"
            accessibilityLabel={t("addItemDetails")}
            className="h-12 w-12 items-center justify-center active:opacity-70"
          >
            <View style={styles.detailsGlyph}>
              <Ionicons name="list" size={18} color={colors.accent} />
              <View
                style={[
                  styles.detailsBadge,
                  { backgroundColor: colors.accent },
                ]}
              >
                <Ionicons name="add" size={10} color={colors.onAccent} />
              </View>
            </View>
          </Pressable>

          <Pressable
            disabled={busy}
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel={t("addItem")}
            className={`h-12 flex-row items-center justify-center gap-0.5 ${
              busy ? "" : "active:opacity-80"
            }`}
            style={{
              backgroundColor: addEnabled
                ? colors.accent
                : withAlpha(colors.accent, dark ? 0.38 : 0.42),
              borderRadius: cardRadius,
              // Icon glyph has extra empty space on the start side; bias
              // padding so left/right edges look even.
              paddingStart: 8,
              paddingEnd: 12,
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <>
                <Ionicons
                  name="add"
                  size={22}
                  color={
                    addEnabled
                      ? colors.onAccent
                      : withAlpha(colors.onAccent, 0.72)
                  }
                  style={{ marginStart: -2 }}
                />
                <AppText
                  numberOfLines={1}
                  className="text-[15px] font-bold"
                  style={{
                    color: addEnabled
                      ? colors.onAccent
                      : withAlpha(colors.onAccent, 0.72),
                  }}
                >
                  {t("quickAddAction")}
                </AppText>
              </>
            )}
          </Pressable>
        </View>
      </Animated.View>

      {footer ? <View className="mt-2.5">{footer}</View> : null}
    </View>
  );
}

function TypewriterText({
  phrases,
  active,
  color,
  fontSize,
  isRTL,
}: {
  phrases: string[];
  active: boolean;
  color: string;
  fontSize: number;
  isRTL: boolean;
}) {
  const [display, setDisplay] = useState(phrases[0] ?? "");
  const phrasesKey = phrases.join("\0");
  const phrasesRef = useRef(phrases);

  useEffect(() => {
    phrasesRef.current = phrases;
  });

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let index = 0;
    const list = phrasesRef.current;
    let text = list[0] ?? "";
    setDisplay(text);

    type Phase = "hold" | "delete" | "pause" | "type";
    let phase: Phase = "hold";
    let char = text.length;

    const schedule = (ms: number, next: () => void) => {
      timer = setTimeout(() => {
        if (!cancelled) next();
      }, ms);
    };

    const tick = () => {
      if (cancelled) return;
      const current = phrasesRef.current;
      if (current.length === 0) return;
      index = index % current.length;
      const phrase = current[index] ?? "";

      if (phase === "hold") {
        phase = "delete";
        schedule(HOLD_MS, tick);
        return;
      }

      if (phase === "delete") {
        if (char > 0) {
          char -= 1;
          text = phrase.slice(0, char);
          setDisplay(text);
          schedule(DELETE_MS, tick);
          return;
        }
        phase = "pause";
        schedule(BETWEEN_MS, tick);
        return;
      }

      if (phase === "pause") {
        index = (index + 1) % current.length;
        char = 0;
        text = "";
        setDisplay("");
        phase = "type";
        schedule(TYPE_MS, tick);
        return;
      }

      const nextPhrase = current[index] ?? "";
      if (char < nextPhrase.length) {
        char += 1;
        text = nextPhrase.slice(0, char);
        setDisplay(text);
        schedule(TYPE_MS, tick);
        return;
      }
      phase = "hold";
      schedule(HOLD_MS, tick);
    };

    schedule(HOLD_MS, tick);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, phrasesKey]);

  return (
    <Text
      numberOfLines={1}
      allowFontScaling={false}
      style={{
        color,
        fontSize,
        fontFamily: "ReadexPro_400Regular",
        textAlign: isRTL ? "right" : "left",
        writingDirection: isRTL ? "rtl" : "ltr",
        includeFontPadding: false,
      }}
    >
      {display}
    </Text>
  );
}

const styles = StyleSheet.create({
  hintRow: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    zIndex: 1,
  },
  caret: {
    width: 1.5,
    height: 16,
    borderRadius: 1,
  },
  input: {
    zIndex: 2,
    backgroundColor: "transparent",
  },
  detailsGlyph: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsBadge: {
    position: "absolute",
    right: -5,
    bottom: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
