import { TextInput, View, type TextInputProps } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { appFont } from "@/constants/font";
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
  compact?: boolean;
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
  compact = false,
}: AppTextFieldProps) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();

  return (
    <View className={compact ? "gap-1.5" : "gap-2"}>
      <AppText className={`font-medium text-cove-muted ${compact ? "text-xs" : "text-sm"}`}>
        {label}
      </AppText>
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
        style={[
          preserveSpaces,
          { fontFamily: appFont.regular },
          !multiline && compact
            ? { height: 40, paddingVertical: 0, includeFontPadding: false, fontSize: 16, lineHeight: 40 }
            : null,
        ]}
        className={`rounded-2xl border bg-cove-paper text-cove-ink ${
          compact ? "px-3" : "px-4 text-base"
        } ${error ? "border-cove-ink" : "border-cove-line"} ${
          multiline
            ? compact
              ? "min-h-[52px] py-2 text-sm"
              : "min-h-[96px] py-3"
            : compact
              ? "h-10 py-0"
              : "h-14"
        }`}
      />
      {error ? (
        <AppText className="text-sm text-red-600 dark:text-red-400">{error}</AppText>
      ) : null}
    </View>
  );
}
