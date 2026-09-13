import { useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function JoinHomeScreen() {
  const [code, setCode] = useState("");

  return (
    <Screen>
      <ScreenHeader
        title="Join a home"
        subtitle="Enter the code your partner shared."
        showBack
      />

      <View className="gap-6">
        <AppTextField
          label="Invite code"
          value={code}
          onChangeText={setCode}
          placeholder="OMT-0000"
        />
        <View className="rounded-3xl bg-cove-paper p-5">
          <Text className="text-base leading-6 text-cove-muted">
            After you join, you will see the same list and can add or mark
            items as bought.
          </Text>
        </View>
        <AppButton
          label="Join this home"
          onPress={() => router.replace("/list")}
          disabled={!code.trim()}
        />
      </View>
    </Screen>
  );
}
