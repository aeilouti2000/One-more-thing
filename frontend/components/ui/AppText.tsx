import { StyleSheet, Text, type TextProps } from "react-native";
import { appFontFamily } from "@/constants/font";
import { preserveSpaces } from "@/constants/text";
import { useI18n } from "@/providers/LanguageProvider";

export function AppText({ style, children, ...props }: TextProps) {
  const { isRTL } = useI18n();
  const weight = StyleSheet.flatten(style)?.fontWeight;

  return (
    <Text
      {...props}
      style={[
        preserveSpaces,
        { writingDirection: isRTL ? "rtl" : "ltr" },
        style,
        { fontFamily: appFontFamily(weight), fontWeight: "400" },
      ]}
    >
      {children}
    </Text>
  );
}
