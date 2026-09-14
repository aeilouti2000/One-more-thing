import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View className="items-center rounded-3xl border border-dashed border-cove-line bg-cove-paper px-6 py-10">
      <AppText className="text-lg font-semibold text-cove-ink">{title}</AppText>
      <AppText className="mt-2 text-center text-base leading-6 text-cove-muted">
        {message}
      </AppText>
    </View>
  );
}
