import { Stack } from "expo-router";
import { Stack as JsStack } from "expo-router/js-stack";
import { Platform, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

const SCREENS = ["index", "homes", "add"];

/**
 * Home hub + sub-pages (Your homes, Add a home). Pages cross-fade instead of
 * sliding. Android uses the JS stack so push and pop animate the same way
 * (see the settings layout for why the native stack is avoided there).
 */
export default function HomeLayout() {
  const { colors } = useTheme();

  const stack =
    Platform.OS === "android" ? (
      <JsStack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          cardStyle: { backgroundColor: colors.ice },
        }}
      >
        {SCREENS.map((name) => (
          <JsStack.Screen key={name} name={name} />
        ))}
      </JsStack>
    ) : (
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: colors.ice },
        }}
      >
        {SCREENS.map((name) => (
          <Stack.Screen key={name} name={name} />
        ))}
      </Stack>
    );

  return <View style={{ flex: 1, backgroundColor: colors.ice }}>{stack}</View>;
}
