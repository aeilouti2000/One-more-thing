import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppLogo } from "@/components/ui/AppLogo";
import { AppText } from "@/components/ui/AppText";
import { scaleFontSize, singleLineInput } from "@/constants/font";
import { hexToHsl, hslToHex, withAlpha } from "@/constants/theme";
import { preserveSpaces } from "@/constants/text";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GOOGLE_G = require("../../../assets/images/google-g.png");

type AuthFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  autoCorrect?: boolean;
  error?: string;
  keyboardType?: TextInputProps["keyboardType"];
  textContentType?: TextInputProps["textContentType"];
  maxLength?: number;
  autoFocus?: boolean;
  /** Small muted line under the field (hidden while an error shows). */
  hint?: string;
};

type AuthButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type AuthLinkProps = {
  prompt: string;
  action: string;
  onPress: () => void;
};

export function AuthFrame({
  children,
  scroll = true,
  dense = false,
}: {
  children: ReactNode;
  /** When false, the auth card fills the viewport without scrolling. */
  scroll?: boolean;
  /** Tighter card padding for content-heavy, non-scrolling pages (welcome). */
  dense?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const dark = scheme === "dark";
  const framePad = {
    paddingTop: Math.max(insets.top, 18),
    paddingBottom: Math.max(insets.bottom, 18),
  };
  const cardStyle = [
    styles.card,
    dense ? styles.cardDense : null,
    dark
      ? {
          backgroundColor: colors.paper,
          borderColor: withAlpha(colors.white, 0.1),
        }
      : {
          backgroundColor: colors.paper,
          borderColor: withAlpha("#12141A", 0.08),
        },
  ];

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: dark ? colors.deep : colors.ice },
      ]}
    >
      <StatusBar style={dark ? "light" : "dark"} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scroll, framePad]}
          >
            <View style={cardStyle}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[styles.scroll, styles.flex, framePad]}>
            <View style={[cardStyle, styles.cardFill]}>{children}</View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthBrand({ showName = true }: { showName?: boolean } = {}) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={styles.brand}>
      {showName ? (
        <AppText
          numberOfLines={1}
          style={{
            color: colors.accent,
            fontWeight: "600",
            fontSize: 11,
            letterSpacing: 2.4,
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {t("appName")}
        </AppText>
      ) : null}
      <View style={styles.logoWrap}>
        <AppLogo size={86} />
      </View>
    </View>
  );
}

export function AuthHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.heading}>
      <AppText
        style={{
          color: colors.ink,
          fontWeight: "600",
          fontSize: 26,
          lineHeight: 32,
          textAlign: "center",
        }}
      >
        {title}
      </AppText>
      <AppText
        style={{
          marginTop: 6,
          color: colors.muted,
          fontSize: 13,
          lineHeight: 18,
          textAlign: "center",
        }}
      >
        {subtitle}
      </AppText>
    </View>
  );
}

export function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  autoCapitalize = "sentences",
  autoComplete,
  autoCorrect,
  error,
  keyboardType,
  textContentType,
  maxLength,
  autoFocus,
  hint,
}: AuthFieldProps) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const { scale } = useFontScale();
  const inputSize = scaleFontSize(15, scale);
  const dark = scheme === "dark";
  const inputAlign = isRTL ? "right" : "left";
  const messageAlign = !isRTL
    ? "left"
    : Platform.OS === "android"
      ? "left"
      : "right";

  return (
    <View style={styles.field}>
      <AppText style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        textContentType={textContentType}
        maxLength={maxLength}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        textAlign={inputAlign}
        textAlignVertical="center"
        allowFontScaling={false}
        placeholderTextColor={withAlpha(colors.muted, 0.45)}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        style={[
          preserveSpaces,
          singleLineInput,
          styles.input,
          {
            fontSize: inputSize,
            color: colors.ink,
            backgroundColor: dark
              ? withAlpha(colors.white, 0.06)
              : colors.paper,
            borderColor: error
              ? "#F87171"
              : dark
                ? withAlpha(colors.white, 0.12)
                : colors.line,
            writingDirection: isRTL ? "rtl" : "ltr",
            ...(Platform.OS === "web" ? { outlineWidth: 0 } : null),
          },
        ]}
      />
      {error ? (
        <AppText
          style={{
            width: "100%",
            color: "#F87171",
            fontSize: 13,
            lineHeight: 18,
            textAlign: messageAlign,
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {error}
        </AppText>
      ) : hint ? (
        <AppText
          style={{
            width: "100%",
            color: withAlpha(colors.muted, 0.85),
            fontSize: 12,
            lineHeight: 16,
            textAlign: messageAlign,
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function AuthButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}: AuthButtonProps) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const isDisabled = disabled || loading;
  const { h, s, l } = hexToHsl(colors.accent);
  const start = hslToHex(h, Math.min(s, 86), Math.min(l + 8, 68));
  const end = hslToHex(h, Math.min(s + 4, 94), Math.max(l - 8, 38));

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.buttonPress,
        { opacity: pressed && !isDisabled ? 0.9 : 1 },
      ]}
    >
      <LinearGradient
        colors={[start, end]}
        start={{ x: isRTL ? 1 : 0, y: 0.5 }}
        end={{ x: isRTL ? 0 : 1, y: 0.5 }}
        style={styles.button}
      >
        {loading ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <AppText
            style={{
              color: colors.onAccent,
              fontWeight: "600",
              fontSize: 16,
              lineHeight: 20,
              textAlign: "center",
            }}
          >
            {label}
          </AppText>
        )}
      </LinearGradient>
    </Pressable>
  );
}

/** "Continue with Google": neutral surface + the standard multicolor G. */
const GOOGLE_LIGHT = { fill: "#FFFFFF", border: "#747775", text: "#1F1F1F" };
const GOOGLE_DARK = { fill: "#131314", border: "#8E918F", text: "#E3E3E3" };

export function AuthGoogleButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Size overrides so the button can match the screen's other buttons. */
  style?: StyleProp<ViewStyle>;
}) {
  const { scheme } = useTheme();
  // Google's branding colors: a white button in light mode, near-black in dark.
  const palette = scheme === "dark" ? GOOGLE_DARK : GOOGLE_LIGHT;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => ({
        opacity:
          pressed && !isDisabled ? 0.85 : isDisabled && !loading ? 0.6 : 1,
      })}
    >
      <View
        style={[
          styles.googleButton,
          { backgroundColor: palette.fill, borderColor: palette.border },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={palette.text} />
        ) : (
          <>
            <Image
              source={GOOGLE_G}
              style={{ width: 20, height: 20 }}
              contentFit="contain"
            />
            <AppText
              style={{
                color: palette.text,
                fontWeight: "600",
                fontSize: 15,
                lineHeight: 20,
              }}
            >
              {label}
            </AppText>
          </>
        )}
      </View>
    </Pressable>
  );
}

export function AuthDivider({ label }: { label: string }) {
  const { colors, scheme } = useTheme();
  const line = scheme === "dark" ? withAlpha(colors.white, 0.12) : colors.line;

  return (
    <View
      style={styles.divider}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.dividerLine, { backgroundColor: line }]} />
      <AppText style={{ color: colors.muted, fontSize: 12, lineHeight: 16 }}>
        {label}
      </AppText>
      <View style={[styles.dividerLine, { backgroundColor: line }]} />
    </View>
  );
}

/** A small accent text button, e.g. "Forgot password?". */
export function AuthTextAction({
  label,
  onPress,
  align = "end",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  align?: "start" | "center" | "end";
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const alignSelf =
    align === "start"
      ? "flex-start"
      : align === "center"
        ? "center"
        : "flex-end";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ alignSelf, paddingVertical: 2, opacity: disabled ? 0.5 : 1 }}
    >
      <AppText
        style={{
          color: disabled ? colors.muted : colors.accent,
          fontWeight: "600",
          fontSize: 13,
          lineHeight: 18,
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function AuthLink({ prompt, action, onPress }: AuthLinkProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${prompt} ${action}`}
      style={styles.link}
    >
      <AppText
        style={{
          color: withAlpha(colors.ink, 0.78),
          fontSize: 13,
          lineHeight: 18,
          textAlign: "center",
        }}
      >
        {prompt}{" "}
        <AppText
          style={{
            color: colors.accent,
            fontWeight: "600",
            fontSize: 13,
            lineHeight: 18,
          }}
        >
          {action}
        </AppText>
      </AppText>
    </Pressable>
  );
}

export function AuthLegal({
  onPrivacy,
  onTerms,
}: {
  onPrivacy: () => void;
  onTerms: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const legal = {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center" as const,
  };

  return (
    <View style={styles.legal}>
      <Pressable
        onPress={onPrivacy}
        accessibilityRole="link"
        accessibilityLabel={t("privacyPolicy")}
        hitSlop={8}
        style={styles.legalLink}
      >
        <AppText style={legal}>{t("privacyPolicy")}</AppText>
      </Pressable>
      <Pressable
        onPress={onTerms}
        accessibilityRole="link"
        accessibilityLabel={t("terms")}
        hitSlop={8}
        style={styles.legalLink}
      >
        <AppText style={legal}>{t("terms")}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 430,
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 26,
    paddingTop: 32,
    paddingBottom: 28,
    overflow: "hidden",
  },
  cardFill: {
    flex: 1,
    minHeight: 0,
  },
  cardDense: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
  },
  brand: {
    alignItems: "center",
    gap: 14,
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    marginTop: 22,
    paddingHorizontal: 8,
  },
  field: {
    gap: 6,
  },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  buttonPress: {
    marginTop: 6,
    borderRadius: 12,
  },
  button: {
    height: 50,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  googleButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
  },
  link: {
    alignItems: "center",
    paddingVertical: 2,
    marginTop: 14,
  },
  legal: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 22,
  },
  legalLink: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
});
