import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { headerActionStyle, withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export type HistoryMode = "list" | "invoice";

/**
 * The Purchases / Invoices switch, drawn for the coloured header band. The
 * pill moves at once on a tap, while the page slides to the other view.
 */
export function HeaderSwitch({
  value,
  label,
  options,
  onChange,
}: {
  value: HistoryMode;
  label: string;
  options: { id: HistoryMode; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  onChange: (id: HistoryMode) => void;
}) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const chosen = headerActionStyle(scheme, colors);
  const headerFg = scheme === "dark" ? colors.ink : colors.onAccent;
  const [shown, setShown] = useState(value);
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    setShown(value);
  }

  const index = Math.max(0, options.findIndex((option) => option.id === shown));
  // The row is mirrored in Arabic, so the pill's slot is counted from the other end.
  const slot = isRTL ? options.length - 1 - index : index;
  const position = useSharedValue(slot);
  const trackWidth = useSharedValue(0);
  useEffect(() => {
    position.set(withTiming(slot, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [position, slot]);
  const count = options.length;
  const pillStyle = useAnimatedStyle(() => {
    const cell = Math.max(0, trackWidth.value - SWITCH_PAD * 2) / count;
    return { width: cell, left: SWITCH_PAD + position.value * cell };
  });

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(event) => trackWidth.set(event.nativeEvent.layout.width)}
      className="flex-row rounded-full"
      style={{
        padding: SWITCH_PAD,
        backgroundColor:
          scheme === "dark" ? withAlpha(colors.white, 0.08) : withAlpha("#000000", 0.16),
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: SWITCH_PAD,
            bottom: SWITCH_PAD,
            borderRadius: 999,
            backgroundColor: chosen.backgroundColor,
          },
          pillStyle,
        ]}
      />
      {options.map((option) => {
        const selected = option.id === shown;
        return (
          <Pressable
            key={option.id}
            onPress={() => {
              if (selected) return;
              setShown(option.id);
              onChange(option.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            className="h-10 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-full px-3"
          >
            <Ionicons
              name={option.icon}
              size={16}
              color={selected ? chosen.color : headerFg}
              style={{ opacity: selected ? 1 : 0.85 }}
            />
            <AppText
              className="text-sm font-semibold"
              numberOfLines={1}
              style={{ color: selected ? chosen.color : headerFg, opacity: selected ? 1 : 0.85 }}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const SWITCH_PAD = 4;
