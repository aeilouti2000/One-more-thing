import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { iconSize } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

function ThickPencil({ color }: { color: string }) {
  const size = iconSize.sm;
  return (
    <View style={{ width: size, height: size }}>
      {[
        { left: 0, top: 0 },
        { left: 0.7, top: 0 },
        { left: 0, top: 0.7 },
      ].map((offset) => (
        <Ionicons
          key={`${offset.left}-${offset.top}`}
          name="pencil-outline"
          size={size}
          color={color}
          style={{ position: "absolute", left: offset.left, top: offset.top }}
        />
      ))}
    </View>
  );
}

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
      <ThickPencil color={onPaper ? colors.accent : colors.ink} />
    </Pressable>
  );
}
