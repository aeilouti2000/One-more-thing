import { Stack } from "expo-router";
import { Stack as JsStack } from "expo-router/js-stack";
import { Platform, View } from "react-native";
import { INSTANT_STACK_TRANSITION } from "@/lib/motion";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

const SCREENS = ["index", "homes", "add"];

/**
 * Home hub + sub-pages (Your homes, Add a home). Going deeper slides in from
 * the side, like Settings. Android uses the JS stack so push and pop animate the same way
 * (see the settings layout for why the native stack is avoided there).
 */
export default function HomeLayout() {
  const { colors } = useTheme();
  const motionOff = useMotionOff();

  const stack =
    Platform.OS === "android" ? (
      <JsStack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          // Only with animations off; otherwise the key is absent, as it always was.
          ...(motionOff ? { transitionSpec: INSTANT_STACK_TRANSITION } : null),
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
          animation: motionOff ? "none" : "slide_from_right",
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
