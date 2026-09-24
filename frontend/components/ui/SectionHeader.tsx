import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";

type SectionHeaderProps = {
  title: string;
  meta?: string;
};

export function SectionHeader({ title, meta }: SectionHeaderProps) {
  return (
    <View className="mb-3 flex-row items-baseline justify-between">
      <AppText className="text-lg font-semibold text-cove-ink">{title}</AppText>
      {meta ? (
        <AppText className="text-sm text-cove-muted">{meta}</AppText>
      ) : null}
    </View>
  );
}
