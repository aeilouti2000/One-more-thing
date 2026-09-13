import { Text, View } from "react-native";

type SectionHeaderProps = {
  title: string;
  meta?: string;
};

export function SectionHeader({ title, meta }: SectionHeaderProps) {
  return (
    <View className="mb-3 flex-row items-baseline justify-between">
      <Text className="text-lg font-semibold text-cove-ink">{title}</Text>
      {meta ? (
        <Text className="text-sm text-cove-muted">{meta}</Text>
      ) : null}
    </View>
  );
}
