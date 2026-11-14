import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { appFont, scaleFontSize, singleLineInput } from "@/constants/font";
import { caretColors, caretGap } from "@/constants/text";
import { floatedControlRadius, withAlpha } from "@/constants/theme";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type SheetFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Short text in the leading chip, e.g. a currency symbol. */
  chip?: string;
  /** Icon in the leading chip, when there's no text for it. */
  icon?: keyof typeof Ionicons.glyphMap;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  returnKeyType?: TextInputProps["returnKeyType"];
  maxLength?: number;
  autoFocus?: boolean;
  editable?: boolean;
  onFocus?: () => void;
  onSubmitEditing?: () => void;
  autoCorrect?: boolean;
  /** Shown after the text, e.g. a paste button. */
  trailing?: ReactNode;
  /** A code: always left to right, spaced out, bold. */
  code?: boolean;
};

/**
 * The large single-line field used inside bottom sheets (price, budget, trip
 * name): a soft filled box with a tinted chip in front of the text.
 */
export function SheetField({
  value,
  onChangeText,
  placeholder,
  chip,
  icon,
  keyboardType,
  autoCapitalize = "sentences",
  returnKeyType = "done",
  maxLength,
  autoFocus,
  editable = true,
  onFocus,
  onSubmitEditing,
  autoCorrect,
  trailing,
  code = false,
}: SheetFieldProps) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const { scale } = useFontScale();
  const numeric = keyboardType === "decimal-pad" || keyboardType === "number-pad";
  const bold = numeric || code;

  return (
    <View
      className="h-14 flex-row items-center border px-3.5"
      style={{
        borderRadius: floatedControlRadius,
        ...(code ? { direction: "ltr" as const, flexDirection: "row" as const } : {
          flexDirection: isRTL ? ("row-reverse" as const) : ("row" as const),
        }),
        backgroundColor: scheme === "dark" ? withAlpha(colors.white, 0.06) : "#F4F5F7",
        borderColor:
          scheme === "dark" ? withAlpha(colors.white, 0.12) : withAlpha("#12141A", 0.1),
      }}
    >
      {chip || icon ? (
        <View
          className="h-9 min-w-11 items-center justify-center rounded-xl px-2.5"
          style={{ backgroundColor: withAlpha(colors.accent, scheme === "dark" ? 0.18 : 0.12) }}
        >
          {chip ? (
            <AppText className="text-sm font-semibold" style={{ color: colors.accent }}>
              {chip}
            </AppText>
          ) : icon ? (
            <Ionicons name={icon} size={18} color={colors.accent} />
          ) : null}
        </View>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={caretGap(placeholder)}
        {...caretColors(colors.accent)}
        placeholderTextColor={withAlpha(colors.muted, 0.55)}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        returnKeyType={returnKeyType}
        maxLength={maxLength}
        autoFocus={autoFocus}
        editable={editable}
        onFocus={onFocus}
        onSubmitEditing={onSubmitEditing}
        autoCorrect={autoCorrect}
        textAlign={code ? "left" : isRTL ? "right" : "left"}
        textAlignVertical="center"
        allowFontScaling={false}
        style={[
          singleLineInput,
          {
            flex: 1,
            marginStart: chip || icon ? 10 : 0,
            fontFamily: bold ? appFont.semibold : appFont.medium,
            fontSize: scaleFontSize(numeric ? 22 : code ? 19 : 17, scale),
            color: colors.ink,
          },
          code ? { letterSpacing: 2, writingDirection: "ltr" } : null,
        ]}
      />
      {trailing}
    </View>
  );
}
