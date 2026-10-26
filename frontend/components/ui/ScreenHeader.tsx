import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import { headerActionStyle, iconSize, spacing } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Matches the settings icon frame so split panes share one header height. */
const SPLIT_HEADER_BODY = 56;
/** Cover pane hairline + antialias gap between fold headers. */
const SPLIT_COVER = StyleSheet.hairlineWidth + 1;

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
  /**
   * Fold master–detail: which horizontal edge meets the other pane.
   * Locks height and paints over the divider so headers read as one band.
   */
  splitJoin?: "start" | "end";
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
  splitJoin,
}: ScreenHeaderProps) {
  const { colors, scheme } = useTheme();
  const { isRTL, t } = useI18n();
  const insets = useSafeAreaInsets();
  const headerFg = scheme === "dark" ? colors.ink : colors.onAccent;
  const backAction = headerActionStyle(scheme, colors);
  const padTop = (compact ? spacing.lg : spacing.xl) + insets.top;
  const padBottom = compact ? spacing.lg : 28;
  const split = Boolean(splitJoin);

  return (
    <View
      className={`overflow-hidden px-4 ${
        compact ? "pb-4" : "mb-6 pb-7"
      } ${scheme === "dark" ? "bg-cove-deep" : "bg-cove-accent"}`}
      style={{
        paddingTop: padTop,
        ...(flush ? { marginTop: -spacing.sm } : null),
        ...(flush || split
          ? {
              marginLeft: -(
                (flush ? spacing.screen : 0) +
                (splitJoin === "start" ? SPLIT_COVER : 0)
              ),
              marginRight: -(
                (flush ? spacing.screen : 0) +
                (splitJoin === "end" ? SPLIT_COVER : 0)
              ),
            }
          : null),
        ...(split
          ? {
              minHeight: padTop + SPLIT_HEADER_BODY + padBottom,
              zIndex: 2,
            }
          : null),
      }}
    >
      {/* Header sits on accent/deep — keep status icons light. */}
      <StatusBar style="light" />

      <View
        className={`flex-row justify-between gap-3 ${
          children || icon || split ? "items-center" : "items-start"
        }`}
        style={split ? { minHeight: SPLIT_HEADER_BODY } : undefined}
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          {showBack ? (
            <Pressable
              onPress={() => (onBack ? onBack() : router.back())}
              accessibilityRole="button"
              accessibilityLabel={t("back")}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-80"
              style={{ backgroundColor: backAction.backgroundColor }}
            >
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={iconSize.sm}
                color={backAction.color}
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
                  <AppText
                    className="text-3xl font-semibold tracking-tight"
                    style={{ color: headerFg }}
                  >
                    {title}
                  </AppText>
                ) : null}
                {subtitle ? (
                  <AppText
                    className="mt-1 text-base"
                    style={{ color: headerFg, opacity: 0.88 }}
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
      {footer ? <View className="mt-4">{footer}</View> : null}
    </View>
  );
}
