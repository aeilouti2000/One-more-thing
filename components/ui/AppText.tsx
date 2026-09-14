import { Text, type TextProps } from "react-native";
import { preserveSpaces } from "@/constants/text";
import { useI18n } from "@/providers/LanguageProvider";

export function AppText({ style, children, ...props }: TextProps) {
  const { isRTL } = useI18n();

  return (
    <Text
      {...props}
      style={[
        preserveSpaces,
        { writingDirection: isRTL ? "rtl" : "ltr" },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
