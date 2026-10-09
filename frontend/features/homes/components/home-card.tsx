import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { EditButton } from "@/components/ui/EditButton";
import { FormMessage } from "@/components/ui/FormMessage";
import { iconSize } from "@/constants/theme";
import { PartnerCard } from "@/features/homes/components/partner-card";
import type { HomeSummary, HouseholdMember } from "@/features/homes/types/household";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type HomeCardProps = {
  home: HomeSummary;
  selected: boolean;
  expanded: boolean;
  members: HouseholdMember[];
  switching: boolean;
  currentUserId?: string;
  onToggle: () => void;
  onRename: (name: string) => Promise<string | null>;
  onSwitch: () => void;
  onRemoveMember: (member: HouseholdMember) => void;
  onLeave: () => void;
};

export function HomeCard({
  home,
  selected,
  expanded,
  members,
  switching,
  currentUserId,
  onToggle,
  onRename,
  onSwitch,
  onRemoveMember,
  onLeave,
}: HomeCardProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(home.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [trackedName, setTrackedName] = useState({ name: home.name, editing: false });
  const isHost = home.role === "owner";

  if (home.name !== trackedName.name || isEditing !== trackedName.editing) {
    setTrackedName({ name: home.name, editing: isEditing });
    if (!isEditing) setDraft(home.name);
  }

  async function saveName() {
    const nextName = draft.trim();
    if (!nextName) {
      setNameError(t("errorEnterHomeName"));
      return;
    }

    setIsSaving(true);
    setNameError(null);
    const error = await onRename(nextName);
    setIsSaving(false);
    if (error) {
      setNameError(error);
      return;
    }
    setIsEditing(false);
  }

  function startEditing() {
    setDraft(home.name);
    setNameError(null);
    setIsEditing(true);
    if (!expanded) onToggle();
  }

  return (
    <View className="rounded-2xl bg-cove-mist px-3.5 py-3.5">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          className="min-w-0 flex-1 active:opacity-80"
        >
          <AppText className="text-base font-semibold text-cove-ink">{home.name}</AppText>
          <AppText className="text-sm text-cove-muted">
            {isHost ? t("host") : t("partner")}
            {selected ? ` · ${t("currentHome")}` : ""}
          </AppText>
        </Pressable>
        {isHost ? (
          <EditButton
            variant="paper"
            accessibilityLabel={t("editHomeName")}
            onPress={startEditing}
          />
        ) : null}
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={home.name}
          accessibilityState={{ expanded }}
          className="h-11 w-11 items-center justify-center active:opacity-80"
        >
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={iconSize.sm}
            color={colors.muted}
          />
        </Pressable>
      </View>

      {isHost && isEditing ? (
        <View className="mt-4 gap-4">
          <AppTextField
            label={t("homeName")}
            value={draft}
            onChangeText={setDraft}
            autoComplete="off"
            userText
          />
          <FormMessage message={nameError} />
          <View className="gap-2">
            <AppButton
              label={t("saveFamilyName")}
              disabled={!draft.trim()}
              loading={isSaving}
              onPress={() => void saveName()}
            />
            <AppButton
              label={t("cancel")}
              variant="ghost"
              disabled={isSaving}
              onPress={() => {
                setDraft(home.name);
                setNameError(null);
                setIsEditing(false);
              }}
            />
          </View>
        </View>
      ) : null}

      {expanded ? (
        <View className="mt-4 gap-2.5">
          {members.map((member) => (
            <PartnerCard
              key={member.id}
              member={member}
              canRemove={isHost && member.id !== currentUserId && member.role !== "owner"}
              onRemove={() => onRemoveMember(member)}
              canLeave={member.id === currentUserId && !isHost}
              onLeave={onLeave}
            />
          ))}
          {!selected ? (
            <AppButton
              label={t("switchToHome")}
              variant="secondary"
              loading={switching}
              disabled={switching}
              onPress={onSwitch}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
