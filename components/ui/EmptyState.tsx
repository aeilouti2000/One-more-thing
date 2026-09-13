import { Text, View } from "react-native";

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View className="items-center rounded-3xl border border-dashed border-cove-line bg-cove-paper px-6 py-10">
      <Text className="text-lg font-semibold text-cove-ink">{title}</Text>
      <Text className="mt-2 text-center text-base leading-6 text-cove-muted">
        {message}
      </Text>
    </View>
  );
}
