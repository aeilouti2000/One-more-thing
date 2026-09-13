import { View } from "react-native";
import { InviteCodeCard } from "@/components/household/InviteCodeCard";
import { PartnerCard } from "@/components/household/PartnerCard";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useHousehold } from "@/hooks/useHousehold";

export default function HomeScreen() {
  const { household } = useHousehold();

  return (
    <Screen tabBarInset>
      <ScreenHeader title="Home" subtitle="The people on this list" />

      {household ? (
        <View className="gap-6">
          <InviteCodeCard code={household.inviteCode} />

          <View>
            <SectionHeader
              title="Together"
              meta={`${household.members.length} people`}
            />
            <View className="gap-3">
              {household.members.map((member) => (
                <PartnerCard key={member.id} member={member} />
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
