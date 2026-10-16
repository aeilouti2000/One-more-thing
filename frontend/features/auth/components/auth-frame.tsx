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
  type TextInputProps,
  type ViewStyle,
} from "react-native";
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

/** Unfinished ring on the app mark. Stays orange when the accent changes. */
const MARK = "#F5A623";

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
};

type AuthButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type AuthLinkProps = {
  label: string;
  onPress: () => void;
};

export function AuthFrame({ children }: { children: ReactNode }) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const dark = scheme === "dark";

  return (
    <View style={[styles.root, { backgroundColor: dark ? colors.deep : colors.ice }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <SoftOrb
        color={colors.accent}
        size={340}
        style={{ top: 24, left: -150, opacity: dark ? 0.38 : 0.85 }}
      />
      <SoftOrb
        color={colors.accent}
        size={200}
        style={{ right: -80, bottom: 36, opacity: dark ? 0.22 : 0.4 }}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom, 18),
            },
          ]}
        >
          <View
            style={[
              styles.card,
              dark
                ? {
                    backgroundColor: withAlpha(colors.paper, 0.9),
                    borderColor: withAlpha(colors.white, 0.12),
                    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.35)",
                  }
                : {
                    backgroundColor: withAlpha(colors.paper, 0.9),
                    borderColor: withAlpha(colors.white, 0.96),
                    boxShadow: "0 24px 60px rgba(80, 120, 160, 0.16)",
                  },
            ]}
          >
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthBrand() {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={styles.brand}>
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
      <View style={styles.logoWrap}>
        <View
          pointerEvents="none"
          style={[
            styles.logoHalo,
            { backgroundColor: withAlpha(colors.accent, 0.16) },
            Platform.OS === "web" ? ({ filter: "blur(10px)" } as ViewStyle) : null,
          ]}
        />
        <View
          style={[
            styles.logoDisc,
            { backgroundColor: withAlpha(colors.accent, 0.1) },
          ]}
        >
          <AppLogo size={86} />
        </View>
      </View>
    </View>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
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
}: AuthFieldProps) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const { scale } = useFontScale();
  const inputSize = scaleFontSize(15, scale);
  const dark = scheme === "dark";
  const inputAlign = isRTL ? "right" : "left";
  const messageAlign = !isRTL ? "left" : Platform.OS === "android" ? "left" : "right";

  return (
    <View style={styles.field}>
      <AppText style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
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
            backgroundColor: dark ? withAlpha(colors.white, 0.06) : colors.paper,
            borderColor: error ? "#F87171" : dark ? withAlpha(colors.white, 0.12) : colors.line,
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
      ) : null}
    </View>
  );
}

export function AuthButton({ label, onPress, disabled = false, loading = false }: AuthButtonProps) {
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
        <View
          pointerEvents="none"
          style={[
            styles.mark,
            { backgroundColor: MARK },
            isRTL ? { left: 16 } : { right: 16 },
          ]}
        />
      </LinearGradient>
    </Pressable>
  );
}

export function AuthLink({ label, onPress }: AuthLinkProps) {
  const { colors } = useTheme();

  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.link}>
      <AppText
        style={{
          color: withAlpha(colors.ink, 0.78),
          fontSize: 13,
          lineHeight: 18,
          textAlign: "center",
        }}
      >
        {label}
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
      <Pressable onPress={onPrivacy} accessibilityRole="link">
        <AppText style={legal}>{t("privacyPolicy")}</AppText>
      </Pressable>
      <AppText style={legal}>{t("and")}</AppText>
      <Pressable onPress={onTerms} accessibilityRole="link">
        <AppText style={legal}>{t("terms")}</AppText>
      </Pressable>
    </View>
  );
}

function SoftOrb({
  color,
  size,
  style,
}: {
  color: string;
  size: number;
  style?: ViewStyle;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: withAlpha(color, 0.42),
        },
        Platform.OS === "web" ? ({ filter: "blur(46px)" } as ViewStyle) : null,
        style,
      ]}
    />
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
    boxShadow: "0 24px 60px rgba(120, 160, 200, 0.18)",
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(18px)",
        } as ViewStyle)
      : null),
  },
  brand: {
    alignItems: "center",
    gap: 18,
  },
  logoWrap: {
    width: 118,
    height: 118,
    alignItems: "center",
    justifyContent: "center",
  },
  logoHalo: {
    position: "absolute",
    width: 118,
    height: 118,
    borderRadius: 59,
  },
  logoDisc: {
    width: 104,
    height: 104,
    borderRadius: 52,
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
  mark: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 21,
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
    columnGap: 4,
  },
});
