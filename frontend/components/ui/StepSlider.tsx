import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const THUMB = 26;
const TRACK = 6;

type StepSliderProps = {
  /** The chosen step, from 0 to `steps - 1`. */
  value: number;
  /** How many positions the slider has (at least 2). */
  steps: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  /** What a screen reader says the current step is. */
  valueLabel: string;
  /** Small pictures of the lowest and highest setting; tapping one moves a step. */
  start?: ReactNode;
  end?: ReactNode;
};

/**
 * A slider with a few fixed positions. Tap a dot to jump to it, or an end to
 * move one step. Looks and moves like the text size slider (FontSizeBar).
 */
export function StepSlider({
  value,
  steps,
  onChange,
  accessibilityLabel,
  valueLabel,
  start,
  end,
}: StepSliderProps) {
  const { isRTL } = useI18n();
  const { colors } = useTheme();
  const last = Math.max(1, steps - 1);
  const index = Math.min(last, Math.max(0, value));
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(index);

  useEffect(() => {
    progress.set(withTiming(index, { duration: 220 }));
  }, [progress, index]);

  // Usable span: the thumb's centre travels between the two ends.
  const span = Math.max(0, width - THUMB);
  const thumbStyle = useAnimatedStyle(() => {
    const x = (progress.value / last) * span;
    return { transform: [{ translateX: isRTL ? span - x : x }] };
  });
  const fillStyle = useAnimatedStyle(() => ({
    width: (progress.value / last) * span,
  }));

  function select(next: number) {
    const clamped = Math.min(last, Math.max(0, next));
    if (clamped === index) return;
    void Haptics.selectionAsync();
    onChange(clamped);
  }

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: valueLabel }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) =>
        select(index + (event.nativeEvent.actionName === "increment" ? 1 : -1))
      }
      className="flex-row items-center gap-3"
    >
      {start ? (
        <Pressable onPress={() => select(index - 1)} hitSlop={10} accessibilityElementsHidden>
          {start}
        </Pressable>
      ) : null}

      <View
        style={{ flex: 1, height: THUMB, justifyContent: "center", direction: "ltr" }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        <View
          style={{
            position: "absolute",
            left: THUMB / 2,
            right: THUMB / 2,
            height: TRACK,
            borderRadius: TRACK / 2,
            backgroundColor: withAlpha(colors.muted, 0.22),
          }}
        />
        <Animated.View
          style={[
            {
              position: "absolute",
              [isRTL ? "right" : "left"]: THUMB / 2,
              height: TRACK,
              borderRadius: TRACK / 2,
              backgroundColor: colors.accent,
            },
            fillStyle,
          ]}
        />
        {/* Step dots, each a tap target */}
        {Array.from({ length: last + 1 }, (_, step) => {
          const x = (step / last) * span;
          return (
            <Pressable
              key={step}
              onPress={() => select(step)}
              accessibilityElementsHidden
              style={{
                position: "absolute",
                left: isRTL ? span - x : x,
                width: THUMB,
                height: THUMB,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    step <= index ? colors.onAccent : withAlpha(colors.muted, 0.45),
                }}
              />
            </Pressable>
          );
        })}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: colors.white,
              borderWidth: 3,
              borderColor: colors.accentText,
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            },
            thumbStyle,
          ]}
        />
      </View>

      {end ? (
        <Pressable onPress={() => select(index + 1)} hitSlop={10} accessibilityElementsHidden>
          {end}
        </Pressable>
      ) : null}
    </View>
  );
}
