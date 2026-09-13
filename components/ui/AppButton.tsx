import { Pressable, Text } from "react-native";

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
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
}: AppButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`items-center rounded-2xl px-5 py-4 ${variants[variant]} ${
        disabled ? "opacity-50" : "active:opacity-80"
      }`}
    >
      <Text
        className={`text-base font-semibold ${labelVariants[variant]}`}
        style={{ whiteSpace: "pre-wrap" } as object}
      >
        {label}
      </Text>
    </Pressable>
  );
}
