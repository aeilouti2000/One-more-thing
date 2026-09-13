import { Stack } from "expo-router";

export default function ItemLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#E3F2FD" },
      }}
    >
      <Stack.Screen
        name="new"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
