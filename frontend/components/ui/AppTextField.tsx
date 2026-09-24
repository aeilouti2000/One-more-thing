import { TextInput, View, type TextInputProps } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { preserveSpaces } from "@/constants/text";

type AppTextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  autoCorrect?: boolean;
  error?: string;
  editable?: boolean;
  userText?: boolean;
};

export function AppTextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize = "sentences",
  autoComplete,
  autoCorrect,
  error,
  editable = true,
  userText = false,
}: AppTextFieldProps) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();

  return (
    <View className="gap-2">
      <AppText className="text-sm font-medium text-cove-muted">{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.line}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        editable={editable}
        textAlign={userText ? undefined : isRTL ? "right" : "left"}
        textAlignVertical={multiline ? "top" : "center"}
        style={preserveSpaces}
        className={`rounded-2xl border bg-cove-paper px-4 text-base text-cove-ink ${
          error ? "border-cove-ink" : "border-cove-line"
        } ${multiline ? "min-h-[96px] py-3" : "h-14"}`}
      />
      {error ? (
        <AppText className="text-sm text-red-600 dark:text-red-400">{error}</AppText>
      ) : null}
    </View>
  );
}
