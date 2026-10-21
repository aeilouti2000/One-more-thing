import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { iconSize } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

type EditButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
  variant?: "mist" | "paper";
  compact?: boolean;
};

export function EditButton({
  onPress,
  accessibilityLabel,
  variant = "paper",
  compact = false,
}: EditButtonProps) {
  const { colors, scheme } = useTheme();
  const onPaper = variant === "paper";
  const backgroundColor = onPaper
    ? scheme === "dark"
      ? colors.line
      : colors.paper
    : colors.mist;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`items-center justify-center rounded-full active:opacity-80 ${
        compact ? "h-8 w-8" : "h-11 w-11"
      }`}
      style={{ backgroundColor }}
    >
      <Ionicons
        name="pencil"
        size={compact ? 15 : iconSize.sm}
        color={onPaper ? colors.accent : colors.ink}
      />
    </Pressable>
  );
}
