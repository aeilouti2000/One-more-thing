import { Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { Stack as JsStack } from "expo-router/js-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SettingsMasterPane } from "@/features/settings/components/settings-master-pane";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { SETTINGS_MASTER_WIDTH } from "@/lib/layout";
import { spacing } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Keep in sync with ScreenHeader split minHeight body + bottom pad. */
const SPLIT_HEADER_BODY = 56;
const SPLIT_HEADER_PAD_BOTTOM = 28;

export default function SettingsLayout() {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const wide = useWideLayout();
  const headerBandHeight =
    insets.top + spacing.xl + SPLIT_HEADER_BODY + SPLIT_HEADER_PAD_BOTTOM;

  const screens = [
    "index",
    "account",
    "account-name",
    "account-username",
    "account-password",
    "account-email",
    "app",
    "swipe-actions",
    "categories",
    "pins",
    "notifications",
    "permissions",
    "costs",
    "language",
    "appearance",
  ];

  // Android: JS stack. With the native stack, Android's back gesture (forced
  // on in Expo Go / Android 16 predictive back) drops the leaving page without
  // its slide-out, so "back" looked broken. The JS stack animates push and pop
  // the same way. iOS keeps the native stack and its swipe-back.
  const stack =
    Platform.OS === "android" ? (
      <JsStack
        screenOptions={{
          headerShown: false,
          animation: wide ? "fade" : "slide_from_right",
          cardStyle: { backgroundColor: colors.ice },
        }}
      >
        {screens.map((name) => (
          <JsStack.Screen key={name} name={name} />
        ))}
      </JsStack>
    ) : (
      <Stack
        screenOptions={{
          headerShown: false,
          animation: wide ? "fade" : "slide_from_right",
          contentStyle: { backgroundColor: colors.ice },
          fullScreenGestureShadowEnabled: false,
        }}
      >
        {screens.map((name) => (
          <Stack.Screen key={name} name={name} />
        ))}
      </Stack>
    );

  if (!wide) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ice }}>{stack}</View>
    );
  }

  return (
    <View style={[styles.wideRoot, { backgroundColor: colors.ice }]}>
      <View
        style={[
          styles.wideRow,
          { flexDirection: isRTL ? "row-reverse" : "row" },
        ]}
      >
        <View style={[styles.master, { width: SETTINGS_MASTER_WIDTH }]}>
          <SettingsMasterPane />
        </View>
        <View style={styles.detail}>{stack}</View>
      </View>
      {/* Divider only below the header band — avoids a light seam through the blue. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: headerBandHeight,
          bottom: 0,
          ...(isRTL
            ? { right: SETTINGS_MASTER_WIDTH }
            : { left: SETTINGS_MASTER_WIDTH }),
          width: StyleSheet.hairlineWidth,
          backgroundColor: colors.line,
          zIndex: 2,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wideRoot: {
    flex: 1,
  },
  wideRow: {
    flex: 1,
  },
  master: {},
  detail: {
    flex: 1,
    minWidth: 0,
  },
});
