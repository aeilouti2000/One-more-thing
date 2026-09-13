import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { iconSize } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

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
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();

  return (
    <View
      className={`-mx-5 -mt-2 mb-6 overflow-hidden rounded-b-3xl px-5 pb-7 pt-5 ${
        scheme === "dark" ? "bg-cove-deep" : "bg-cove-accent"
      }`}
    >
      <View
        pointerEvents="none"
        className="absolute -right-10 -top-16 h-40 w-5 rounded-full"
        style={{
          backgroundColor: "rgba(255,255,255,0.18)",
          transform: [{ rotate: "32deg" }],
        }}
      />
      <View
        pointerEvents="none"
        className="absolute right-5 -top-12 h-36 w-2 rounded-full"
        style={{
          backgroundColor: "rgba(255,255,255,0.1)",
          transform: [{ rotate: "32deg" }],
        }}
      />
      <View
        pointerEvents="none"
        className="absolute bottom-0 left-5 right-5 h-px"
        style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
      />

      <View className="relative z-10 flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-start gap-3">
          {showBack ? (
            <Pressable
              onPress={() => router.back()}
              className="mt-0.5 h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={iconSize.sm}
                color={colors.accent}
              />
            </Pressable>
          ) : null}
          <View className="min-w-0 flex-1">
            <AppText className="text-3xl font-semibold tracking-tight text-white">
              {title}
            </AppText>
            {subtitle ? (
              <AppText
                className="mt-1 text-base text-white"
                style={{ opacity: 0.88 }}
              >
                {subtitle}
              </AppText>
            ) : null}
          </View>
        </View>
        {right}
      </View>
    </View>
  );
}
