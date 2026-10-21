import { Platform, View } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";

export default function SettingsLayout() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.ice }}>
      <Stack
        screenOptions={{
          headerShown: false,
          // ios_from_right avoids the Android native-stack edge/shadow seam on pop.
          animation:
            Platform.OS === "android" ? "ios_from_right" : "slide_from_right",
          contentStyle: { backgroundColor: colors.ice },
          fullScreenGestureShadowEnabled: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="account" />
        <Stack.Screen name="app" />
        <Stack.Screen name="swipe-actions" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="pins" />
        <Stack.Screen name="costs" />
        <Stack.Screen name="language" />
        <Stack.Screen name="appearance" />
      </Stack>
    </View>
  );
}
