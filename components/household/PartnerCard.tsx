import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { iconSize } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import type { HouseholdMember } from "@/types/household";

type PartnerCardProps = {
  member: HouseholdMember;
  canRemove?: boolean;
  onRemove?: () => void;
};

export function PartnerCard({
  member,
  canRemove = false,
  onRemove,
}: PartnerCardProps) {
  const { t } = useI18n();
  const initial = member.name.charAt(0).toUpperCase();

  return (
    <View className="flex-row items-center gap-3 rounded-3xl bg-cove-paper px-4 py-4">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-cove-mist">
        <AppText className="text-lg font-semibold text-cove-ink">{initial}</AppText>
      </View>
      <View className="flex-1">
        <AppText className="text-base font-semibold text-cove-ink">
          {member.name}
        </AppText>
        <AppText className="text-sm text-cove-muted">
          {member.role === "owner" ? t("host") : t("partner")}
        </AppText>
      </View>
      {canRemove && onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t("removeMember")}
          className="h-11 w-11 items-center justify-center rounded-full bg-red-50 active:opacity-80"
        >
          <Ionicons name="trash-outline" size={iconSize.sm} color="#DC2626" />
        </Pressable>
      ) : null}
    </View>
  );
}
