import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { withAlpha } from "@/constants/theme";
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
  /** Fold detail pane: always show body, hide accordion chevron. */
  variant?: "accordion" | "detail";
  onToggle: () => void;
  onRename: (name: string) => Promise<string | null>;
  onSwitch: () => void;
  onRemoveMember: (member: HouseholdMember) => void;
  onLeave: () => void;
  onDelete: () => void;
};

export function HomeCard({
  home,
  selected,
  expanded,
  members,
  switching,
  currentUserId,
  variant = "accordion",
  onToggle,
  onRename,
  onSwitch,
  onRemoveMember,
  onLeave,
  onDelete,
}: HomeCardProps) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(home.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [trackedName, setTrackedName] = useState({ name: home.name, editing: false });
  const isHost = home.role === "owner";
  const showBody = variant === "detail" || expanded;
  const detail = variant === "detail";

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

  const peopleLabel =
    members.length > 1 ? t("peopleCount", { count: members.length }) : t("justYou");
  const tileBg = selected ? withAlpha(colors.accent, dark ? 0.2 : 0.12) : withAlpha(colors.muted, 0.14);

  return (
    <View
      className={detail ? "rounded-3xl px-4 py-4" : "px-4 py-3.5"}
      style={detail ? { backgroundColor: colors.paper } : undefined}
    >
      {/* Header: tap anywhere to expand */}
      <Pressable
        onPress={detail ? undefined : onToggle}
        disabled={detail}
        accessibilityRole="button"
        accessibilityState={{ expanded: showBody }}
        accessibilityLabel={home.name}
        className="flex-row items-center gap-3 active:opacity-80"
      >
        <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: tileBg }}>
          <Ionicons
            name={selected ? "home" : "home-outline"}
            size={20}
            color={selected ? colors.accent : colors.muted}
          />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <AppText className="shrink text-base font-semibold text-cove-ink" numberOfLines={1}>
              {home.name}
            </AppText>
            {selected ? (
              <View
                className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
                style={{ backgroundColor: dark ? "rgba(95,208,138,0.16)" : "rgba(31,138,76,0.1)" }}
              >
                <Ionicons name="checkmark" size={11} color={dark ? "#7FDCA0" : "#1F8A4C"} />
                <AppText className="text-[11px] font-semibold" style={{ color: dark ? "#7FDCA0" : "#1F8A4C" }}>
                  {t("currentHome")}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText className="mt-0.5 text-sm text-cove-muted" numberOfLines={1}>
            {isHost ? t("host") : t("partner")} · {peopleLabel}
          </AppText>
        </View>
        {detail ? null : (
          <View
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: withAlpha(colors.muted, 0.12) }}
          >
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.muted}
            />
          </View>
        )}
      </Pressable>

      {isHost && isEditing ? (
        <View className="mt-4 gap-3">
          <AppTextField
            label={t("homeName")}
            value={draft}
            onChangeText={setDraft}
            autoComplete="off"
            userText
          />
          <FormMessage message={nameError} />
          <View className="flex-row gap-2">
            <View className="flex-1">
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
            <View className="flex-1">
              <AppButton
                label={t("saveFamilyName")}
                disabled={!draft.trim()}
                loading={isSaving}
                onPress={() => void saveName()}
              />
            </View>
          </View>
        </View>
      ) : null}

      {showBody && !isEditing ? (
        <View className="mt-4 gap-3">
          <View className="h-px" style={{ backgroundColor: withAlpha(colors.muted, 0.18) }} />
          <AppText className="text-xs font-semibold text-cove-muted">{t("people")}</AppText>
          <View className="gap-2">
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
          </View>

          {!selected ? (
            <AppButton
              label={t("switchToHome")}
              loading={switching}
              disabled={switching}
              onPress={onSwitch}
            />
          ) : null}

          {isHost ? (
            <View className="flex-row gap-2">
              <ActionPill
                icon="pencil-outline"
                label={t("rename")}
                color={colors.accent}
                background={withAlpha(colors.accent, dark ? 0.14 : 0.1)}
                onPress={startEditing}
              />
              <ActionPill
                icon="trash-outline"
                label={t("deleteHome")}
                color="#F07178"
                background={dark ? "rgba(240,113,120,0.14)" : "rgba(194,65,74,0.08)"}
                onPress={onDelete}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ActionPill({
  icon,
  label,
  color,
  background,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  background: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 flex-row items-center gap-1.5 rounded-full px-4 active:opacity-75"
      style={{ backgroundColor: background }}
    >
      <Ionicons name={icon} size={15} color={color} />
      <AppText className="text-sm font-semibold" style={{ color }}>
        {label}
      </AppText>
    </Pressable>
  );
}
