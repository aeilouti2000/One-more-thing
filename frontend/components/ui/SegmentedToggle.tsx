import { useEffect } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { radius } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

export type SegmentedOption<T extends string> = {
  id: T;
  label: string;
};

type SegmentedToggleProps<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (id: T) => void;
  accessibilityLabel: string;
  size?: "regular" | "compact";
};

const TRACK_PAD = 4;

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
  size = "regular",
}: SegmentedToggleProps<T>) {
  const { colors } = useTheme();
  const compact = size === "compact";
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value));
  const progress = useSharedValue(selectedIndex);
  const trackWidth = useSharedValue(0);
  const count = Math.max(options.length, 1);

  useEffect(() => {
    progress.value = withTiming(selectedIndex, { duration: 240 });
  }, [progress, selectedIndex]);

  const thumbStyle = useAnimatedStyle(() => {
    const inner = Math.max(0, trackWidth.value - TRACK_PAD * 2);
    const cell = inner / count;
    return {
      width: cell,
      left: TRACK_PAD + progress.value * cell,
    };
  });

  function select(id: T) {
    if (id === value) return;
    void Haptics.selectionAsync();
    onChange(id);
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => {
        trackWidth.value = event.nativeEvent.layout.width;
      }}
      style={{
        direction: "ltr",
        flexDirection: "row",
        alignItems: "center",
        height: compact ? 42 : 58,
        padding: TRACK_PAD,
        borderRadius: radius.md,
        backgroundColor: colors.mist,
        alignSelf: compact ? "center" : "stretch",
        minWidth: compact ? 196 : undefined,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: TRACK_PAD,
            bottom: TRACK_PAD,
            left: 0,
            borderRadius: radius.md - TRACK_PAD,
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
            shadowOpacity: 0.28,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3,
          },
          thumbStyle,
        ]}
      />
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => select(option.id)}
            className="z-[1] min-w-0 flex-1 items-center justify-center active:opacity-90"
            style={{ paddingHorizontal: compact ? 8 : 10 }}
          >
            <AppText
              numberOfLines={1}
              allowFontScaling={false}
              className="font-semibold"
              style={{
                color: selected ? colors.onAccent : colors.ink,
                fontSize: compact ? 13 : 15,
                lineHeight: compact ? 18 : 20,
              }}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
