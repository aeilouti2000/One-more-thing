import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { iconSize, spacing } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type ScreenHeaderProps = {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  icon?: ReactNode;
  right?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
  compact?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  icon,
  right,
  footer,
  children,
  flush = true,
  compact = false,
}: ScreenHeaderProps) {
  const { colors, scheme } = useTheme();
  const { isRTL, t } = useI18n();

  return (
    <View
      className={`overflow-hidden rounded-b-3xl px-5 ${
        compact ? "pb-4 pt-4" : "mb-6 pb-7 pt-5"
      } ${scheme === "dark" ? "bg-cove-deep" : "bg-cove-accent"}`}
      style={
        flush
          ? { marginHorizontal: -spacing.screen, marginTop: -spacing.sm }
          : undefined
      }
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
        className={`relative z-10 flex-row justify-between gap-3 ${
          children || icon ? "items-center" : "items-start"
        }`}
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          {showBack ? (
            <Pressable
              onPress={() => (onBack ? onBack() : router.back())}
              accessibilityRole="button"
              accessibilityLabel={t("back")}
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={iconSize.sm}
                color={colors.accent}
              />
            </Pressable>
          ) : null}
          {icon ? (
            <View className="shrink-0" style={{ alignSelf: "center" }}>
              {icon}
            </View>
          ) : null}
          <View className="min-w-0 flex-1">
            {children ?? (
              <>
                {title ? (
                  <AppText className="text-3xl font-semibold tracking-tight text-white">
                    {title}
                  </AppText>
                ) : null}
                {subtitle ? (
                  <AppText
                    className="mt-1 text-base text-white"
                    style={{ opacity: 0.88 }}
                  >
                    {subtitle}
                  </AppText>
                ) : null}
              </>
            )}
          </View>
        </View>
        {right}
      </View>
      {footer ? <View className="relative z-10 mt-4">{footer}</View> : null}
    </View>
  );
}
