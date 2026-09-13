import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: ReactNode;
};

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  right,
}: ScreenHeaderProps) {
  return (
    <View className="mb-6 flex-row items-start justify-between gap-3">
      <View className="min-w-0 flex-1 flex-row items-start gap-3">
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            className="mt-0.5 h-10 w-10 items-center justify-center rounded-full bg-cove-paper"
          >
            <Ionicons name="chevron-back" size={22} color="#2A241E" />
          </Pressable>
        ) : null}
        <View className="min-w-0 flex-1">
          <Text className="text-3xl font-semibold tracking-tight text-cove-ink">
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-1 text-base text-cove-muted">{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {right}
    </View>
  );
}
