import { useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function CreateHomeScreen() {
  const [name, setName] = useState("Our place");

  return (
    <Screen>
      <ScreenHeader
        title="Start a home"
        subtitle="This is the shared space for your list."
        showBack
      />

      <View className="gap-6">
        <AppTextField
          label="Home name"
          value={name}
          onChangeText={setName}
          placeholder="Our place"
        />
        <View className="rounded-3xl bg-cove-paper p-5">
          <Text className="text-base leading-6 text-cove-muted">
            You will get a code next so your partner can join. Saving this will
            be wired up in a later step.
          </Text>
        </View>
        <AppButton
          label="Continue"
          onPress={() => router.replace("/list")}
          disabled={!name.trim()}
        />
      </View>
    </Screen>
  );
}
