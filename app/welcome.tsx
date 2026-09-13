import { router } from "expo-router";
import { Image, Text, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { Screen } from "@/components/ui/Screen";
import { APP_NAME, APP_TAGLINE } from "@/constants/app";

export default function WelcomeScreen() {
  return (
    <Screen>
      <View className="flex-1 justify-between pt-8">
        <View className="mt-10">
          <View className="flex-row items-center gap-4 mb-6">
            <Image
              source={require("../assets/images/icon.png")}
              resizeMode="cover"
              style={{ width: 64, height: 64, borderRadius: 16 }}
            />
            <Text
              className="flex-1 text-3xl font-semibold text-cove-ink"
              style={{ whiteSpace: "pre-wrap" } as object}
            >
              {APP_NAME}
            </Text>
          </View>
          <Text
            className="mt-4 max-w-[320px] text-lg leading-7 text-cove-muted"
            style={{ whiteSpace: "pre-wrap" } as object}
          >
            {APP_TAGLINE} Keep one shared list so nothing gets bought twice.
          </Text>
        </View>

        <View className="mt-16 gap-6">
          <View className="gap-3 rounded-3xl bg-cove-paper p-5">
            <Text
              className="text-base font-semibold text-cove-ink"
              style={{ whiteSpace: "pre-wrap" } as object}
            >
              How it works
            </Text>
            <Text
              className="text-base leading-6 text-cove-muted"
              style={{ whiteSpace: "pre-wrap" } as object}
            >
              Start a home, invite your partner, add what you need, and mark
              things bought when you pick them up.
            </Text>
          </View>

          <View className="gap-3">
            <AppButton
              label="Start a home"
              onPress={() => router.push("/create-home")}
            />
            <AppButton
              label="Join with a code"
              variant="secondary"
              onPress={() => router.push("/join-home")}
            />
            <AppButton
              label="Preview the app"
              variant="ghost"
              onPress={() => router.replace("/list")}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}
