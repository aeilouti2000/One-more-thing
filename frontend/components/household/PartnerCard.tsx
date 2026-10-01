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
  canLeave?: boolean;
  onLeave?: () => void;
};

export function PartnerCard({
  member,
  canRemove = false,
  onRemove,
  canLeave = false,
  onLeave,
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
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: "rgba(248, 113, 113, 0.18)" }}
        >
          <Ionicons name="trash-outline" size={iconSize.sm} color="#F87171" />
        </Pressable>
      ) : null}
      {canLeave && onLeave ? (
        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          accessibilityLabel={t("leaveHome")}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: "rgba(248, 113, 113, 0.18)" }}
        >
          <Ionicons name="exit-outline" size={iconSize.sm} color="#F87171" />
        </Pressable>
      ) : null}
    </View>
  );
}
