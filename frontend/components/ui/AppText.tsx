import { StyleSheet, Text, type TextProps, type TextStyle } from "react-native";
import { appFontFamily, scaleFontSize, textSizes } from "@/constants/font";
import { preserveSpaces } from "@/constants/text";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";

function sizeFromClass(className?: string) {
  if (!className) return null;
  const matches = className.match(/\btext-(4xl|3xl|2xl|xl|lg|base|sm|xs)\b/g);
  const token = matches?.[matches.length - 1]?.slice("text-".length);
  if (!token || !(token in textSizes)) return null;
  return textSizes[token as keyof typeof textSizes];
}

export function AppText({
  style,
  className,
  children,
  ...props
}: TextProps & { className?: string }) {
  const { isRTL } = useI18n();
  const { scale } = useFontScale();
  const flat = StyleSheet.flatten(style);
  const fromClass = sizeFromClass(className);
  const fontSize = typeof flat?.fontSize === "number" ? flat.fontSize : fromClass?.fontSize;
  const lineHeight = typeof flat?.lineHeight === "number" ? flat.lineHeight : fromClass?.lineHeight;
  const scaledSize = fontSize ? scaleFontSize(fontSize, scale) : undefined;
  const scaledLine = lineHeight ? scaleFontSize(lineHeight, scale) : undefined;
  const scaled: TextStyle | null = scaledSize
    ? {
        fontSize: scaledSize,
        lineHeight: isRTL
          ? Math.max(scaledLine ?? 0, Math.round(scaledSize * 1.8))
          : scaledLine,
      }
    : null;

  return (
    <Text
      {...props}
      className={className}
      allowFontScaling={props.allowFontScaling ?? false}
      style={[
        preserveSpaces,
        {
          writingDirection: isRTL ? "rtl" : "ltr",
          includeFontPadding: isRTL,
          textAlignVertical: "center",
        },
        style,
        scaled,
        { fontFamily: appFontFamily(flat?.fontWeight), fontWeight: "400" },
      ]}
    >
      {children}
    </Text>
  );
}
