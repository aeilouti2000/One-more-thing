import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { HomeCard } from "@/features/homes/components/home-card";
import { InviteCodeCard } from "@/features/homes/components/invite-code-card";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { AppTextField } from "@/components/ui/AppTextField";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { headerIconFrameStyle, iconSize } from "@/constants/theme";
import { useHousehold } from "@/features/homes/hooks/use-household";
import {
  createHome,
  joinHome,
  leaveHome,
  removeHomeMember,
  switchHome,
  updateHomeName,
} from "@/features/homes/api/homes";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { HomeSummary, HouseholdMember } from "@/features/homes/types/household";

export default function HomeScreen() {
  const { user } = useAuth();
  const { household, homes, isLoading, error, refresh, adoptHome } = useHousehold();
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [homesOpen, setHomesOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<HouseholdMember | null>(null);
  const [memberHomeId, setMemberHomeId] = useState<string | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [newHomeName, setNewHomeName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveHomeId, setLeaveHomeId] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [floatMessage, setFloatMessage] = useState<string | null>(null);
  const [floatTone, setFloatTone] = useState<"error" | "success">("success");

  const homeCards: HomeSummary[] =
    homes.length > 0
      ? homes
      : household
        ? [
            {
              id: household.id,
              name: household.name,
              role: household.members.some(
                (member) => member.id === user?.id && member.role === "owner",
              )
                ? "owner"
                : "partner",
              members: household.members,
            },
          ]
        : [];

  async function onRefresh() {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  function toggleHome(homeId: string) {
    setExpandedId((current) => (current === homeId ? null : homeId));
  }

  async function renameHome(homeId: string, name: string) {
    const result = await updateHomeName(homeId, name);
    if (result.error) return result.error;
    await refresh();
    setFloatTone("success");
    setFloatMessage(t("homeNameUpdated"));
    return null;
  }

  async function removeSelectedMember() {
    if (!memberHomeId || !memberToRemove) return;

    setIsRemovingMember(true);
    setMemberError(null);
    const result = await removeHomeMember(memberHomeId, memberToRemove.id);

    if (result.error) {
      setIsRemovingMember(false);
      setMemberError(result.error);
      return;
    }

    await refresh();
    setIsRemovingMember(false);
    setMemberToRemove(null);
    setMemberHomeId(null);
  }

  async function createAnotherHome() {
    const homeName = newHomeName.trim();
    if (!homeName) {
      setCreateError(t("errorEnterHomeName"));
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    const result = await createHome(homeName, t("defaultList"));
    setIsCreating(false);

    if (result.error || !result.home) {
      setCreateError(result.error);
      return;
    }

    adoptHome(result.home);
    setNewHomeName("");
    setIsCreateOpen(false);
    await refresh();
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
    setIsJoinOpen(false);
    await refresh();
  }

  async function openHome(homeId: string) {
    if (!household || homeId === household.id) return;
    setSwitchingId(homeId);
    setFloatMessage(null);
    const result = await switchHome(homeId);
    setSwitchingId(null);
    if (result.error || !result.home) {
      setFloatTone("error");
      setFloatMessage(result.error ?? t("errorGeneric"));
      return;
    }
    adoptHome(result.home);
    setExpandedId(result.home.id);
    await refresh();
  }

  async function leaveSelectedHome() {
    if (!leaveHomeId) return;
    setIsLeaving(true);
    setLeaveError(null);
    const result = await leaveHome(leaveHomeId);
    setIsLeaving(false);

    if (result.error) {
      setLeaveError(result.error);
      return;
    }

    setLeaveHomeId(null);
    if (result.home) {
      adoptHome(result.home);
      setExpandedId(result.home.id);
    }
    await refresh();
  }

  const householdId = household?.id ?? null;
  const [expandedFor, setExpandedFor] = useState<string | null>(householdId);
  if (householdId && householdId !== expandedFor) {
    setExpandedFor(householdId);
    setExpandedId(householdId);
  }

  useEffect(() => {
    if (!floatMessage) return;
    const timer = setTimeout(() => setFloatMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [floatMessage]);

  const leavingHome = homeCards.find((home) => home.id === leaveHomeId);

  if (isLoading && !household && !error) {
    return <LoadingScreen />;
  }

  return (
    <Screen
      tabBarInset
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
      floating={floatMessage ? <FloatMessage message={floatMessage} tone={floatTone} /> : null}
    >
      <ScreenHeader
        title={t("homeTitle")}
        subtitle={t("homeSubtitle")}
        icon={
          <View
            className="items-center justify-center"
            style={headerIconFrameStyle(scheme, colors)}
          >
            <Ionicons
              name="home-outline"
              size={34}
              color={scheme === "dark" ? colors.ink : colors.onAccent}
            />
          </View>
        }
      />

      <FormMessage message={error} />

      {household ? (
        <View className="gap-6">
          <InviteCodeCard
            code={household.inviteCode}
            homeName={household.name}
            onCopied={() => {
              setFloatTone("success");
              setFloatMessage(t("inviteCopied"));
            }}
          />

          <View className="gap-3">
            <SectionCard
              icon="home-outline"
              title={t("yourHomes")}
              summary={household.name}
              open={homesOpen}
              onToggle={() => setHomesOpen((open) => !open)}
              colors={colors}
            >
              {homeCards.map((home) => (
                <HomeCard
                  key={home.id}
                  home={home}
                  selected={home.id === household.id}
                  expanded={expandedId === home.id}
                  members={(home.id === household.id ? household.members : home.members) ?? []}
                  switching={switchingId === home.id}
                  currentUserId={user?.id}
                  onToggle={() => toggleHome(home.id)}
                  onRename={(name) => renameHome(home.id, name)}
                  onSwitch={() => void openHome(home.id)}
                  onRemoveMember={(member) => {
                    setMemberHomeId(home.id);
                    setMemberToRemove(member);
                    setMemberError(null);
                  }}
                  onLeave={() => {
                    setLeaveError(null);
                    setLeaveHomeId(home.id);
                  }}
                />
              ))}
            </SectionCard>

            <SectionCard
              icon="add-outline"
              title={t("addAHome")}
              summary={t("addAHomeSummary")}
              open={addOpen}
              onToggle={() => setAddOpen((open) => !open)}
              colors={colors}
            >
              <View className="rounded-2xl bg-cove-mist px-3.5 py-3.5">
                <Pressable
                  onPress={() => setIsCreateOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isCreateOpen }}
                  className="min-h-11 flex-row items-center justify-between gap-3 active:opacity-80"
                >
                  <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
                    {t("createAnotherHome")}
                  </AppText>
                  <View className="h-11 w-11 items-center justify-center">
                    <Ionicons
                      name={isCreateOpen ? "chevron-up" : "chevron-down"}
                      size={iconSize.sm}
                      color={colors.ink}
                    />
                  </View>
                </Pressable>
                {isCreateOpen ? (
                  <View className="mt-4 gap-4">
                    <AppText className="text-sm text-cove-muted">{t("createAnotherHomeHint")}</AppText>
                    <AppTextField
                      label={t("homeName")}
                      value={newHomeName}
                      onChangeText={setNewHomeName}
                      placeholder={t("homeNamePlaceholder")}
                      userText
                    />
                    <FormMessage message={createError} />
                    <AppButton
                      label={t("createAnotherHome")}
                      disabled={!newHomeName.trim()}
                      loading={isCreating}
                      onPress={() => void createAnotherHome()}
                    />
                  </View>
                ) : null}
              </View>

              <View className="rounded-2xl bg-cove-mist px-3.5 py-3.5">
                <Pressable
                  onPress={() => setIsJoinOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isJoinOpen }}
                  className="min-h-11 flex-row items-center justify-between gap-3 active:opacity-80"
                >
                  <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
                    {t("joinAnotherHome")}
                  </AppText>
                  <View className="h-11 w-11 items-center justify-center">
                    <Ionicons
                      name={isJoinOpen ? "chevron-up" : "chevron-down"}
                      size={iconSize.sm}
                      color={colors.ink}
                    />
                  </View>
                </Pressable>
                {isJoinOpen ? (
                  <View className="mt-4 gap-4">
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
                ) : null}
              </View>
            </SectionCard>
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
        icon="person-remove-outline"
        error={memberError}
        loading={isRemovingMember}
        onConfirm={() => void removeSelectedMember()}
        onCancel={() => {
          setMemberToRemove(null);
          setMemberHomeId(null);
          setMemberError(null);
        }}
      />
      <ConfirmModal
        visible={leaveHomeId !== null}
        title={t("leaveHomeTitle", { name: leavingHome?.name ?? household?.name ?? "" })}
        message={t("leaveHomeMessage")}
        confirmLabel={t("leaveHome")}
        cancelLabel={t("cancel")}
        icon="exit-outline"
        error={leaveError}
        loading={isLeaving}
        onConfirm={() => void leaveSelectedHome()}
        onCancel={() => {
          setLeaveHomeId(null);
          setLeaveError(null);
        }}
      />
    </Screen>
  );
}

function SectionCard({
  icon,
  title,
  summary,
  open,
  onToggle,
  colors,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  colors: { mist: string; accent: string; ink: string };
  children: ReactNode;
}) {
  return (
    <View className="overflow-hidden rounded-3xl bg-cove-paper">
      <View className="flex-row items-center gap-3 px-4 py-4">
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
        >
          <View
            className="h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.mist }}
          >
            <Ionicons name={icon} size={22} color={colors.accent} />
          </View>
          <View className="min-w-0 flex-1">
            <AppText className="text-base font-semibold text-cove-ink">{title}</AppText>
            <AppText className="mt-1 text-sm text-cove-muted" numberOfLines={1}>
              {summary}
            </AppText>
          </View>
        </Pressable>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={title}
          hitSlop={12}
          className="items-center justify-center active:opacity-80"
        >
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={iconSize.sm}
            color={colors.ink}
          />
        </Pressable>
      </View>
      {open ? <View className="gap-2.5 px-3 pb-3">{children}</View> : null}
    </View>
  );
}
