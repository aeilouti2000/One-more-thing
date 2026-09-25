import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { InviteCodeCard } from "@/components/household/InviteCodeCard";
import { PartnerCard } from "@/components/household/PartnerCard";
import { AppButton } from "@/components/ui/AppButton";
import { EditButton } from "@/components/ui/EditButton";
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
import { joinHome, leaveHome, removeHomeMember, switchHome, updateHomeName } from "@/lib/homes";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { HouseholdMember } from "@/types/household";

export default function HomeScreen() {
  const { user } = useAuth();
  const { household, homes, isLoading, error, refresh, adoptHome } = useHousehold();
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
  const [inviteCode, setInviteCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isConfirmingLeave, setIsConfirmingLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

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

  async function joinAnotherHome() {
    const code = inviteCode.trim();
    if (!code) {
      setJoinError(t("errorEnterInviteCode"));
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    const result = await joinHome(code);
    setIsJoining(false);

    if (result.error || !result.home) {
      setJoinError(result.error);
      return;
    }

    adoptHome(result.home);
    setInviteCode("");
    await refresh();
  }

  async function openHome(homeId: string) {
    if (!household || homeId === household.id) return;
    setSwitchingId(homeId);
    const result = await switchHome(homeId);
    setSwitchingId(null);
    if (result.home) {
      adoptHome(result.home);
      await refresh();
    }
  }

  async function leaveCurrentHome() {
    if (!household) return;
    setIsLeaving(true);
    setLeaveError(null);
    const result = await leaveHome(household.id);
    setIsLeaving(false);

    if (result.error) {
      setLeaveError(result.error);
      return;
    }

    setIsConfirmingLeave(false);
    if (result.home) adoptHome(result.home);
    await refresh();
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
                  <EditButton
                    variant="mist"
                    accessibilityLabel={t("editFamilyName")}
                    onPress={() => {
                      setFamilyName(household.name);
                      setIsEditingName(true);
                      setNameSuccess(null);
                    }}
                  />
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

          <View>
            <SectionHeader title={t("yourHomes")} />
            <View className="gap-3">
              {homes.map((home) => {
                const selected = home.id === household.id;
                return (
                  <Pressable
                    key={home.id}
                    disabled={selected || switchingId !== null}
                    onPress={() => void openHome(home.id)}
                    className="flex-row items-center justify-between gap-3 rounded-3xl bg-cove-paper px-4 py-4 active:opacity-80"
                  >
                    <View className="min-w-0 flex-1">
                      <AppText className="text-base font-semibold text-cove-ink">{home.name}</AppText>
                      <AppText className="text-sm text-cove-muted">
                        {home.role === "owner" ? t("host") : t("partner")}
                      </AppText>
                    </View>
                    {selected ? (
                      <AppText className="text-sm font-semibold text-cove-accent">{t("currentHome")}</AppText>
                    ) : (
                      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.muted} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <SectionHeader title={t("joinAnotherHome")} />
            <View className="gap-4 rounded-3xl bg-cove-paper p-4">
              <AppText className="text-sm text-cove-muted">{t("joinAnotherHomeHint")}</AppText>
              <AppTextField
                label={t("inviteCode")}
                value={inviteCode}
                onChangeText={(value) => setInviteCode(value.toUpperCase())}
                placeholder={t("inviteCodePlaceholder")}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <FormMessage message={joinError} />
              <AppButton
                label={t("joinThisHome")}
                disabled={!inviteCode.trim()}
                loading={isJoining}
                onPress={() => void joinAnotherHome()}
              />
            </View>
          </View>

          <AppButton
            label={t("leaveHome")}
            variant="secondary"
            onPress={() => {
              setLeaveError(null);
              setIsConfirmingLeave(true);
            }}
          />
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
      <ConfirmModal
        visible={isConfirmingLeave}
        title={t("leaveHomeTitle", { name: household?.name ?? "" })}
        message={t("leaveHomeMessage")}
        confirmLabel={t("leaveHome")}
        cancelLabel={t("cancel")}
        error={leaveError}
        loading={isLeaving}
        onConfirm={() => void leaveCurrentHome()}
        onCancel={() => {
          setIsConfirmingLeave(false);
          setLeaveError(null);
        }}
      />
    </Screen>
  );
}
