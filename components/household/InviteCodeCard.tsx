import { Text, View } from "react-native";

type InviteCodeCardProps = {
  code: string;
};

export function InviteCodeCard({ code }: InviteCodeCardProps) {
  return (
    <View className="rounded-3xl bg-cove-ink px-5 py-5">
      <Text className="text-sm font-medium text-cove-line">Invite code</Text>
      <Text className="mt-2 text-2xl font-semibold tracking-widest text-white">
        {code}
      </Text>
      <Text className="mt-2 text-sm leading-5 text-cove-line">
        Share this with your partner so they can join the same list.
      </Text>
    </View>
  );
}
