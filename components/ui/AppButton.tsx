import { ActivityIndicator, Pressable } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/providers/ThemeProvider";

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
};

const variants = {
  primary: "bg-cove-accent",
  secondary: "bg-cove-paper border border-cove-line",
  ghost: "bg-transparent",
};

const labelVariants = {
  primary: "text-white",
  secondary: "text-cove-ink",
  ghost: "text-cove-accent",
};

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
}: AppButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`items-center rounded-2xl px-5 py-4 ${variants[variant]} ${
        isDisabled ? "opacity-50" : "active:opacity-80"
      }`}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.white : colors.accent}
        />
      ) : (
        <AppText className={`text-base font-semibold ${labelVariants[variant]}`}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
