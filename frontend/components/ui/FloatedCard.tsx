import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import { floatedCardStyle, iconSize, withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type FloatedCardProps = {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Soft glass wash on the card surface. */
  glass?: boolean;
  /** Max width utility: `md` (default) or `sm`. */
  size?: "sm" | "md";
};

export function FloatedCard({
  children,
  className = "",
  style,
  glass = true,
  size = "md",
}: FloatedCardProps) {
  const { colors, scheme } = useTheme();

  return (
    <View
      className={`w-full overflow-hidden px-6 pb-5 pt-7 ${
        size === "sm" ? "max-w-sm" : "max-w-md"
      } ${className}`.trim()}
      style={[floatedCardStyle(scheme, colors), style]}
    >
      {glass ? <GlassFill soft neutral /> : null}
      {children}
    </View>
  );
}

type FloatedCardHeaderProps = {
  title: string;
  subtitle?: string;
  /** Thin accent rule under the title block (Option B). */
  accent?: boolean;
  /** Leading icon beside the title (confirm / pickers). */
  icon?: keyof typeof Ionicons.glyphMap;
  iconTone?: "danger" | "accent" | "neutral";
  trailing?: ReactNode;
  className?: string;
};

export function FloatedCardHeader({
  title,
  subtitle,
  accent = true,
  icon,
  iconTone = "accent",
  trailing,
  className = "",
}: FloatedCardHeaderProps) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const danger = scheme === "dark" ? "#F07178" : "#C2414A";
  const iconColor =
    iconTone === "danger"
      ? danger
      : iconTone === "neutral"
        ? colors.muted
        : colors.accent;
  const iconBg =
    iconTone === "danger"
      ? scheme === "dark"
        ? "rgba(240, 113, 120, 0.16)"
        : "rgba(194, 65, 74, 0.1)"
      : withAlpha(colors.accent, scheme === "dark" ? 0.16 : 0.12);

  return (
    <View className={`mb-5 gap-3 ${className}`.trim()}>
      <View
        className="items-start gap-3"
        style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
      >
        {icon ? (
          <View
            className="h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: iconBg }}
          >
            <Ionicons name={icon} size={iconSize.sm} color={iconColor} />
          </View>
        ) : null}
        <View className="min-w-0 flex-1 gap-1">
          <View
            className="items-start gap-3"
            style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
          >
            <AppText
              className="min-w-0 flex-1 text-lg font-semibold text-cove-ink"
              numberOfLines={2}
              style={{ textAlign: isRTL ? "right" : "left" }}
            >
              {title}
            </AppText>
            {trailing ? <View className="shrink-0">{trailing}</View> : null}
          </View>
          {subtitle ? (
            <AppText
              className="text-xs leading-4 text-cove-muted"
              style={{ textAlign: isRTL ? "right" : "left" }}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>
      {accent ? (
        <View
          className="h-0.5 w-10 rounded-full"
          style={{
            backgroundColor: colors.accent,
            alignSelf: isRTL ? "flex-end" : "flex-start",
          }}
        />
      ) : null}
    </View>
  );
}

type FloatedCardSectionProps = {
  title?: string;
  children: ReactNode;
  className?: string;
  /** Optional top divider before this group (flat Option B, no nested boxes). */
  divided?: boolean;
};

/** Labeled field group — spacing + label only, no bordered panel. */
export function FloatedCardSection({
  title,
  children,
  className = "",
  divided = false,
}: FloatedCardSectionProps) {
  const { isRTL } = useI18n();

  return (
    <View className={`gap-3 ${className}`.trim()}>
      {divided ? <FloatedCardDivider /> : null}
      {title ? (
        <AppText
          className="text-[11px] font-semibold uppercase tracking-wide text-cove-muted"
          style={{ textAlign: isRTL ? "right" : "left", letterSpacing: 0.6 }}
        >
          {title}
        </AppText>
      ) : null}
      <View className="gap-3">{children}</View>
    </View>
  );
}

type FloatedCardMetaProps = {
  lines: string[];
};

/** Compact trailing meta (added-by + date) for detail headers. */
export function FloatedCardMeta({ lines }: FloatedCardMetaProps) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();

  return (
    <View className="items-end gap-0.5" style={{ alignItems: isRTL ? "flex-start" : "flex-end" }}>
      {lines.map((line) => (
        <AppText
          key={line}
          numberOfLines={1}
          className="text-[11px] font-medium"
          style={{
            color: scheme === "dark" ? withAlpha(colors.white, 0.72) : colors.muted,
            textAlign: isRTL ? "left" : "right",
          }}
        >
          {line}
        </AppText>
      ))}
    </View>
  );
}

type FloatedCardActionsProps = {
  children: ReactNode;
  className?: string;
};

export function FloatedCardActions({
  children,
  className = "",
}: FloatedCardActionsProps) {
  const { isRTL } = useI18n();

  return (
    <View
      className={`mt-6 gap-3 ${className}`.trim()}
      style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
    >
      {children}
    </View>
  );
}

export function FloatedCardDivider() {
  const { colors, scheme } = useTheme();

  return (
    <View
      className="my-1 h-px w-full"
      style={{
        backgroundColor:
          scheme === "dark"
            ? withAlpha(colors.white, 0.08)
            : withAlpha("#12141A", 0.08),
      }}
    />
  );
}
