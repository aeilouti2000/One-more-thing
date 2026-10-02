import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { FrostedFill } from "@/components/ui/BlurBackdrop";
import { scaleFontSize } from "@/constants/font";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type QuickAddBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onOpenDetails: () => void;
  busy?: boolean;
  inputStyle?: StyleProp<TextStyle>;
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
}: QuickAddBarProps) {
  const { colors, scheme } = useTheme();
  const { t, isRTL } = useI18n();
  const { scale } = useFontScale();
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
  const pulse = useSharedValue(1);
  const caret = useSharedValue(1);

  useEffect(() => {
    if (!showHint || addEnabled) {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 160 });
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [showHint, addEnabled, pulse]);

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

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const caretStyle = useAnimatedStyle(() => ({
    opacity: caret.value,
  }));

  return (
    <View className="mb-3 overflow-hidden rounded-3xl border border-cove-line">
      <FrostedFill />
      <View className="flex-row items-center gap-2 px-4 py-2">
        <View className="relative h-11 min-w-0 flex-1 justify-center">
          {showHint ? (
            <View
              pointerEvents="none"
              style={[
                styles.hintRow,
                { flexDirection: isRTL ? "row-reverse" : "row" },
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
                    marginLeft: isRTL ? 0 : 2,
                    marginRight: isRTL ? 2 : 0,
                  },
                  caretStyle,
                ]}
              />
            </View>
          ) : null}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={showHint ? "" : t("quickAddPlaceholder")}
            placeholderTextColor={colors.muted}
            onSubmitEditing={onSubmit}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            returnKeyType="done"
            editable={!busy}
            textAlign={isRTL ? "right" : "left"}
            textAlignVertical="center"
            allowFontScaling={false}
            style={[inputStyle, styles.input]}
            className="h-11 min-w-0 flex-1 text-cove-ink"
          />
        </View>
        <Pressable
          onPress={onOpenDetails}
          accessibilityRole="button"
          accessibilityLabel={t("addItemDetails")}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: scheme === "dark" ? colors.paper : colors.mist }}
        >
          <Ionicons name="create-outline" size={18} color={colors.accent} />
        </Pressable>
        <Animated.View style={pulseStyle}>
          <Pressable
            disabled={!addEnabled}
            onPress={onSubmit}
            accessibilityRole="button"
            accessibilityLabel={t("addItem")}
            className={`h-9 w-9 items-center justify-center rounded-full ${
              addEnabled ? "active:opacity-80" : ""
            }`}
            style={{
              backgroundColor:
                scheme === "dark" && !addEnabled
                  ? "rgba(66, 165, 245, 0.45)"
                  : colors.accent,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="add" size={20} color="#FFFFFF" />
            )}
          </Pressable>
        </Animated.View>
      </View>
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
  phrasesRef.current = phrases;

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
});
