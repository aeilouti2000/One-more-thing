import { ActivityIndicator, Pressable } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/providers/ThemeProvider";

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
};

const variants = {
  primary: "bg-cove-accent",
  secondary: "bg-cove-paper border border-cove-line",
  ghost: "bg-transparent",
  danger: "bg-cove-paper border border-cove-line",
};

const labelVariants = {
  primary: "text-white",
  secondary: "text-cove-ink",
  ghost: "text-cove-accent",
  danger: "",
};

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  compact = false,
}: AppButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const danger = "#F87171";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={`items-center rounded-2xl px-5 ${compact ? "py-2.5" : "py-4"} ${variants[variant]} ${
        isDisabled ? "opacity-50" : "active:opacity-80"
      }`}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "primary"
              ? colors.white
              : variant === "danger"
                ? danger
                : colors.accent
          }
        />
      ) : (
        <AppText
          className={`font-semibold ${compact ? "text-sm" : "text-base"} ${
            variant === "danger" ? "" : labelVariants[variant]
          }`}
          style={variant === "danger" ? { color: danger } : undefined}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
