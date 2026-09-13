import "./global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#E3F2FD" },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="create-home" />
        <Stack.Screen name="join-home" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="item" />
      </Stack>
    </>
  );
}
