import { TextInput, View, type TextInputProps } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { appFont, scaleFontSize, singleLineInput } from "@/constants/font";
import { glassFieldStyle } from "@/constants/theme";
import { useFontScale } from "@/providers/FontScaleProvider";
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
  glass?: boolean;
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
  glass = false,
}: AppTextFieldProps) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const { scale } = useFontScale();
  const inputSize = scaleFontSize(Number(singleLineInput.fontSize), scale);

  return (
    <View className={compact ? "gap-1.5" : "gap-2"}>
      <AppText className={`font-medium text-cove-muted ${compact ? "text-xs" : "text-sm"}`}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={glass && scheme === "dark" ? "rgba(144, 202, 249, 0.62)" : colors.line}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        editable={editable}
        textAlign={userText ? undefined : isRTL ? "right" : "left"}
        textAlignVertical={multiline ? "top" : "center"}
        allowFontScaling={false}
        style={[
          preserveSpaces,
          multiline
            ? { fontFamily: appFont.regular, fontSize: inputSize, includeFontPadding: false }
            : { ...singleLineInput, fontSize: inputSize },
          glass ? glassFieldStyle(scheme) : null,
          error ? { borderColor: colors.ink } : null,
        ]}
        className={`rounded-2xl border text-cove-ink ${
          glass ? "" : "bg-cove-paper"
        } ${compact ? "px-3" : "px-4"} ${
          error ? "border-cove-ink" : glass ? "" : "border-cove-line"
        } ${
          multiline
            ? compact
              ? "min-h-[52px] py-2"
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
