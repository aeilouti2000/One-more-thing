import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { InviteCodeCard } from "@/components/household/InviteCodeCard";
import { PartnerCard } from "@/components/household/PartnerCard";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { iconSize } from "@/constants/theme";
import { useHousehold } from "@/hooks/useHousehold";
import { removeHomeMember, updateHomeName } from "@/lib/homes";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { HouseholdMember } from "@/types/household";

export default function HomeScreen() {
  const { user } = useAuth();
  const { household, isLoading, error, refresh } = useHousehold();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] =
    useState<HouseholdMember | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const isHost = household?.members.some(
    (member) => member.id === user?.id && member.role === "owner",
  );

  async function onRefresh() {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }

  async function saveFamilyName() {
    if (!household) return;

    if (!familyName.trim()) {
      setNameSuccess(null);
      setNameError(t("errorEnterFamilyName"));
      return;
    }

    setIsSavingName(true);
    setNameError(null);
    setNameSuccess(null);
    const result = await updateHomeName(household.id, familyName);

    if (result.error) {
      setIsSavingName(false);
      setNameError(result.error);
      return;
    }

    await refresh();
    setIsSavingName(false);
    setIsEditingName(false);
    setNameSuccess(t("familyNameUpdated"));
  }

  function cancelEditingName() {
    setFamilyName(household?.name ?? "");
    setIsEditingName(false);
    setNameError(null);
  }

  async function removeSelectedMember() {
    if (!household || !memberToRemove) return;

    setIsRemovingMember(true);
    setMemberError(null);
    const result = await removeHomeMember(household.id, memberToRemove.id);

    if (result.error) {
      setIsRemovingMember(false);
      setMemberError(result.error);
      return;
    }

    await refresh();
    setIsRemovingMember(false);
    setMemberToRemove(null);
  }

  if (isLoading && !household && !error) {
    return <LoadingScreen />;
  }

  return (
    <Screen
      tabBarInset
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
    >
      <ScreenHeader title={t("homeTitle")} subtitle={t("homeSubtitle")} />

      <FormMessage message={error} />

      {household ? (
        <View className="gap-6">
          <View>
            <SectionHeader title={t("family")} />
            <View className="rounded-3xl bg-cove-paper p-4">
              {isEditingName ? (
                <View className="gap-4">
                  <AppTextField
                    label={t("familyName")}
                    value={familyName}
                    onChangeText={setFamilyName}
                    autoComplete="off"
                    userText
                  />
                  <FormMessage message={nameError} />
                  <View className="gap-2">
                    <AppButton
                      label={t("saveFamilyName")}
                      disabled={!familyName.trim()}
                      loading={isSavingName}
                      onPress={() => void saveFamilyName()}
                    />
                    <AppButton
                      label={t("cancel")}
                      variant="ghost"
                      disabled={isSavingName}
                      onPress={cancelEditingName}
                    />
                  </View>
                </View>
              ) : (
                <View className="flex-row items-center justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <AppText className="text-sm font-medium text-cove-muted">
                      {t("familyName")}
                    </AppText>
                    <AppText className="mt-1 text-lg font-semibold text-cove-ink">
                      {household.name}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => {
                      setFamilyName(household.name);
                      setIsEditingName(true);
                      setNameSuccess(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("editFamilyName")}
                    className="h-11 w-11 items-center justify-center rounded-full bg-cove-mist active:opacity-80"
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={iconSize.sm}
                      color={colors.ink}
                    />
                  </Pressable>
                </View>
              )}
              {!isEditingName ? (
                <View className="mt-2">
                  <FormMessage message={nameSuccess} tone="success" />
                </View>
              ) : null}
            </View>
          </View>

          <InviteCodeCard code={household.inviteCode} />

          <View>
            <SectionHeader
              title={t("together")}
              meta={t("peopleCount", { count: household.members.length })}
            />
            <View className="gap-3">
              {household.members.map((member) => (
                <PartnerCard
                  key={member.id}
                  member={member}
                  canRemove={
                    Boolean(isHost) &&
                    member.id !== user?.id &&
                    member.role !== "owner"
                  }
                  onRemove={() => {
                    setMemberToRemove(member);
                    setMemberError(null);
                  }}
                />
              ))}
            </View>

          </View>
        </View>
      ) : (
        <EmptyState
          title={t("noHomeYet")}
          message={t("noHomeYetBody")}
        />
      )}

      <ConfirmModal
        visible={memberToRemove !== null}
        title={t("removeMemberTitle", {
          name: memberToRemove?.name ?? "",
        })}
        message={t("removeMemberMessage")}
        confirmLabel={t("remove")}
        cancelLabel={t("cancel")}
        error={memberError}
        loading={isRemovingMember}
        onConfirm={() => void removeSelectedMember()}
        onCancel={() => {
          setMemberToRemove(null);
          setMemberError(null);
        }}
      />
    </Screen>
  );
}
