import { Text, View } from "react-native";
import type { HouseholdMember } from "@/types/household";

type PartnerCardProps = {
  member: HouseholdMember;
};

export function PartnerCard({ member }: PartnerCardProps) {
  const initial = member.name.charAt(0).toUpperCase();

  return (
    <View className="flex-row items-center gap-3 rounded-3xl bg-cove-paper px-4 py-4">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-cove-mist">
        <Text className="text-lg font-semibold text-cove-ink">{initial}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-cove-ink">
          {member.name}
        </Text>
        <Text className="text-sm text-cove-muted">
          {member.role === "owner" ? "Host" : "Partner"}
        </Text>
      </View>
    </View>
  );
}
