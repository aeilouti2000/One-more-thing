import { Text, type TextProps } from "react-native";
import { preserveSpaces } from "@/constants/text";
import { useI18n } from "@/providers/LanguageProvider";

function keepSpaces(children: TextProps["children"]): TextProps["children"] {
  if (typeof children === "string") {
    return children.replace(/ /g, "\u00a0");
  }
  if (Array.isArray(children)) {
    return children.map((child) => keepSpaces(child));
  }
  return children;
}

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
      {keepSpaces(children)}
    </Text>
  );
}
