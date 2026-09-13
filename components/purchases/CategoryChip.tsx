import { Pressable } from "react-native";
import { AppText } from "@/components/ui/AppText";

type CategoryChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function CategoryChip({
  label,
  selected = false,
  onPress,
}: CategoryChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 ${
        selected ? "bg-cove-accent" : "bg-cove-paper"
      }`}
    >
      <AppText
        className={`text-sm font-medium ${
          selected ? "text-white" : "text-cove-ink"
        }`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
