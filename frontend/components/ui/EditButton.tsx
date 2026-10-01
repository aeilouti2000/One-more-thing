import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { iconSize } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

type EditButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
  variant?: "mist" | "paper";
};

export function EditButton({ onPress, accessibilityLabel, variant = "paper" }: EditButtonProps) {
  const { colors } = useTheme();
  const onPaper = variant === "paper";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`h-11 w-11 items-center justify-center rounded-full active:opacity-80 ${
        onPaper ? "bg-white" : "bg-cove-mist"
      }`}
    >
      <Ionicons
        name="create-outline"
        size={iconSize.sm}
        color={onPaper ? colors.accent : colors.ink}
      />
    </Pressable>
  );
}
