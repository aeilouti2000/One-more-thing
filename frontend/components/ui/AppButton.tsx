import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { AppText } from "@/components/ui/AppText";
import { withAlpha } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  /** Size to the label instead of stretching to the parent width. */
  fit?: boolean;
  /** Optional leading icon. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Override the primary fill / label (e.g. previewing a theme color). */
  fill?: { background: string; label: string };
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

const DANGER = "#F87171";
const HEIGHT = 48;
const COMPACT_HEIGHT = 40;

/**
 * App-wide button. Slim (48pt) with a soft radius; a disabled primary turns
 * neutral instead of a washed-out accent block, so empty forms stay calm.
 */
export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  compact = false,
  fit = false,
  icon,
  fill,
  style,
  labelStyle,
}: AppButtonProps) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const inactive = disabled && !loading;
  const neutral = dark ? withAlpha(colors.white, 0.06) : withAlpha("#12141A", 0.05);

  const surface: ViewStyle =
    variant === "primary"
      ? { backgroundColor: inactive ? neutral : (fill?.background ?? colors.accent) }
      : variant === "secondary"
        ? {
            backgroundColor: inactive ? neutral : withAlpha(colors.accent, dark ? 0.16 : 0.1),
          }
        : variant === "danger"
          ? { backgroundColor: inactive ? neutral : withAlpha(DANGER, dark ? 0.14 : 0.1) }
          : { backgroundColor: "transparent" };

  const tint = inactive
    ? withAlpha(colors.muted, 0.8)
    : variant === "primary"
      ? (fill?.label ?? colors.onAccent)
      : variant === "danger"
        ? DANGER
        : colors.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className="active:opacity-80"
      style={[fit ? { alignSelf: "center" } : null, style]}
    >
      {/* Surface on an inner View: NativeWind can drop Pressable styles. */}
      <View
        style={[
          {
            height: compact ? COMPACT_HEIGHT : HEIGHT,
            borderRadius: compact ? 12 : 16,
            paddingHorizontal: compact ? 16 : 22,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          },
          surface,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={tint} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={tint} /> : null}
            <AppText
              numberOfLines={1}
              className={`font-semibold ${compact ? "text-sm" : "text-[15px]"}`}
              style={[{ color: tint }, labelStyle]}
            >
              {label}
            </AppText>
          </>
        )}
      </View>
    </Pressable>
  );
}
