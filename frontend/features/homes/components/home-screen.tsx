import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { FoldPaneEmpty, FoldSplit } from "@/components/ui/FoldSplit";
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
import { headerIconFrameStyle, iconSize, withAlpha } from "@/constants/theme";
import { useHousehold } from "@/features/homes/hooks/use-household";
import {
  createHome,
  joinHome,
  deleteHome,
  leaveHome,
  removeHomeMember,
  switchHome,
  updateHomeName,
} from "@/features/homes/api/homes";
import { useAuth } from "@/features/auth/providers/auth-provider";
import {
  SettingsCardCopy,
  SettingsCardIcon,
} from "@/features/settings/components/settings-ui";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { HomeSummary, HouseholdMember } from "@/features/homes/types/household";

type HomeView = "hub" | "homes" | "add";

/**
 * Home tab. On phones it's a hub (current home, invite code, links) with two
 * sub-pages — Your homes and Add a home — reached like the settings pages.
 * Fold keeps the existing master/detail layout for every view.
 */
export default function HomeScreen({ view = "hub" }: { view?: HomeView } = {}) {
  const { user } = useAuth();
  const { household, homes, isLoading, error, refresh, adoptHome } = useHousehold();
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const wide = useWideLayout();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [widePane, setWidePane] = useState<"home" | "add">("home");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<HouseholdMember | null>(null);
  const [memberHomeId, setMemberHomeId] = useState<string | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [newHomeName, setNewHomeName] = useState("");
  const [addMode, setAddMode] = useState<"create" | "join">("create");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveHomeId, setLeaveHomeId] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [deleteHomeId, setDeleteHomeId] = useState<string | null>(null);
  const [isDeletingHome, setIsDeletingHome] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lastHomeAlert, setLastHomeAlert] = useState(false);
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
    if (wide) {
      setExpandedId(homeId);
      setWidePane("home");
      return;
    }
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
    await refresh();
    if (view === "add" && router.canGoBack()) router.back();
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
    if (view === "add" && router.canGoBack()) router.back();
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

  function askDeleteHome(homeId: string) {
    if (homeCards.length <= 1) {
      setLastHomeAlert(true);
      return;
    }
    setDeleteError(null);
    setDeleteHomeId(homeId);
  }

  async function deleteSelectedHome() {
    if (!deleteHomeId) return;
    setIsDeletingHome(true);
    setDeleteError(null);
    const result = await deleteHome(deleteHomeId);
    setIsDeletingHome(false);

    if (result.code === "LAST_HOME") {
      setDeleteHomeId(null);
      setLastHomeAlert(true);
      return;
    }
    if (result.error) {
      setDeleteError(result.error);
      return;
    }

    setDeleteHomeId(null);
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
  const deletingHome = homeCards.find((home) => home.id === deleteHomeId);
  const selectedHome =
    homeCards.find((home) => home.id === expandedId) ?? null;

  if (isLoading && !household && !error) {
    return <LoadingScreen />;
  }

  function homeCardProps(home: HomeSummary, expanded: boolean) {
    return {
      home,
      selected: home.id === household?.id,
      expanded,
      members:
        (home.id === household?.id ? household?.members : home.members) ?? [],
      switching: switchingId === home.id,
      currentUserId: user?.id,
      onToggle: () => toggleHome(home.id),
      onRename: (name: string) => renameHome(home.id, name),
      onSwitch: () => void openHome(home.id),
      onRemoveMember: (member: HouseholdMember) => {
        setMemberHomeId(home.id);
        setMemberToRemove(member);
        setMemberError(null);
      },
      onLeave: () => {
        setLeaveError(null);
        setLeaveHomeId(home.id);
      },
      onDelete: () => askDeleteHome(home.id),
    };
  }

  const creating = addMode === "create";
  const addHomeForms = (
    <View className="gap-4">
      {/* Create / Join switch */}
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          padding: 4,
          borderRadius: 22,
          backgroundColor: scheme === "dark" ? withAlpha(colors.white, 0.05) : colors.mist,
        }}
      >
        {(["create", "join"] as const).map((mode) => {
          const active = addMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setAddMode(mode)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ flex: 1 }}
            >
              <View
                style={{
                  height: 38,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {/* Always mounted with a fixed color: Android drops the
                    radius when a View's background flips from transparent. */}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    borderRadius: 19,
                    overflow: "hidden",
                    opacity: active ? 1 : 0,
                    backgroundColor:
                      scheme === "dark" ? withAlpha(colors.accent, 0.22) : colors.paper,
                  }}
                />
                <Ionicons
                  name={mode === "create" ? "add-circle-outline" : "key-outline"}
                  size={16}
                  color={active ? colors.accent : colors.muted}
                />
                <AppText
                  className="text-sm font-semibold"
                  style={{ color: active ? colors.ink : colors.muted }}
                >
                  {t(mode === "create" ? "addHomeCreateTab" : "addHomeJoinTab")}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View className="gap-5 rounded-3xl bg-cove-paper p-5">
        <View className="items-center gap-3 pt-1">
          <View
            className="h-16 w-16 items-center justify-center rounded-3xl"
            style={{ backgroundColor: withAlpha(colors.accent, 0.12) }}
          >
            <Ionicons
              name={creating ? "home-outline" : "people-outline"}
              size={30}
              color={colors.accent}
            />
          </View>
          <View className="items-center gap-1">
            <AppText className="text-center text-lg font-semibold text-cove-ink">
              {t(creating ? "createAnotherHome" : "joinAnotherHome")}
            </AppText>
            <AppText className="text-center text-sm leading-5 text-cove-muted">
              {t(creating ? "createAnotherHomeHint" : "joinAnotherHomeHint")}
            </AppText>
          </View>
        </View>

        {creating ? (
          <AppTextField
            key="create"
            label={t("homeName")}
            value={newHomeName}
            onChangeText={setNewHomeName}
            placeholder={t("homeNamePlaceholder")}
            userText
          />
        ) : (
          <AppTextField
            key="join"
            label={t("inviteCode")}
            value={inviteCode}
            onChangeText={(value) => setInviteCode(value.toUpperCase())}
            placeholder={t("inviteCodePlaceholder")}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        )}
        <FormMessage message={creating ? createError : joinError} />
        <AppButton
          label={t(creating ? "createAnotherHome" : "joinThisHome")}
          icon={creating ? "add" : "enter-outline"}
          disabled={creating ? !newHomeName.trim() : !inviteCode.trim()}
          loading={creating ? isCreating : isJoining}
          onPress={() => void (creating ? createAnotherHome() : joinAnotherHome())}
        />
      </View>
    </View>
  );

  const header = (
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
  );

  const modals = (
    <>
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
        title={t("leaveHomeTitle", {
          name: leavingHome?.name ?? household?.name ?? "",
        })}
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
      <ConfirmModal
        visible={deleteHomeId !== null}
        title={t("deleteHomeTitle", {
          name: deletingHome?.name ?? household?.name ?? "",
        })}
        message={t("deleteHomeMessage")}
        confirmLabel={t("deleteHome")}
        cancelLabel={t("cancel")}
        icon="trash-outline"
        error={deleteError}
        loading={isDeletingHome}
        onConfirm={() => void deleteSelectedHome()}
        onCancel={() => {
          if (isDeletingHome) return;
          setDeleteHomeId(null);
          setDeleteError(null);
        }}
      />
      <ConfirmModal
        visible={lastHomeAlert}
        alert
        title={t("lastHomeTitle")}
        message={t("lastHomeMessage")}
        confirmLabel={t("close")}
        cancelLabel={t("close")}
        icon="home-outline"
        onConfirm={() => setLastHomeAlert(false)}
        onCancel={() => setLastHomeAlert(false)}
      />
    </>
  );

  if (!wide) {
    const floating = floatMessage ? (
      <FloatMessage message={floatMessage} tone={floatTone} />
    ) : null;

    if (view === "homes") {
      return (
        <Screen
          refreshing={isRefreshing}
          onRefresh={() => void onRefresh()}
          floating={floating}
        >
          <ScreenHeader
            showBack
            title={t("yourHomes")}
            subtitle={t("homesCount", { count: homeCards.length })}
          />
          <FormMessage message={error} />
          <View className="gap-3">
            {homeCards.map((home) => {
              const current = home.id === household?.id;
              return (
                <View
                  key={home.id}
                  className="overflow-hidden rounded-3xl bg-cove-paper"
                  style={{
                    borderWidth: 1,
                    borderColor: current
                      ? withAlpha(colors.accent, scheme === "dark" ? 0.45 : 0.3)
                      : "transparent",
                  }}
                >
                  <HomeCard {...homeCardProps(home, expandedId === home.id)} />
                </View>
              );
            })}
          </View>
          {modals}
        </Screen>
      );
    }

    if (view === "add") {
      return (
        <Screen floating={floating}>
          <ScreenHeader showBack title={t("addAHome")} subtitle={t("addAHomeSummary")} />
          {addHomeForms}
        </Screen>
      );
    }

    return (
      <Screen
        tabBarInset
        refreshing={isRefreshing}
        onRefresh={() => void onRefresh()}
        floating={floating}
      >
        {header}
        <FormMessage message={error} />
        {household ? (
          <View className="gap-5">
            <CurrentHomeCard
              name={household.name}
              role={
                household.members.some(
                  (member) => member.id === user?.id && member.role === "owner",
                )
                  ? "owner"
                  : "partner"
              }
              members={household.members}
              currentUserId={user?.id}
            />
            <InviteCodeCard
              code={household.inviteCode}
              homeName={household.name}
              onCopied={() => {
                setFloatTone("success");
                setFloatMessage(t("inviteCopied"));
              }}
            />
            <View className="gap-3">
              <HubLink
                icon="home-outline"
                title={t("yourHomes")}
                summary={
                  homeCards.length > 1
                    ? `${t("homesCount", { count: homeCards.length })} · ${household.name}`
                    : household.name
                }
                href={"/home/homes" as Href}
              />
              <HubLink
                icon="add-circle-outline"
                title={t("addAHome")}
                summary={t("addAHomeSummary")}
                href={"/home/add" as Href}
              />
            </View>
          </View>
        ) : (
          <View className="gap-4">
            <EmptyState title={t("noHomeYet")} message={t("noHomeYetBody")} />
            <HubLink
              icon="add-circle-outline"
              title={t("addAHome")}
              summary={t("addAHomeSummary")}
              href={"/home/add" as Href}
            />
          </View>
        )}
        {modals}
      </Screen>
    );
  }

  return (
    <FoldSplit
      master={
        <Screen
          tabBarInset
          refreshing={isRefreshing}
          onRefresh={() => void onRefresh()}
          floating={
            floatMessage ? (
              <FloatMessage message={floatMessage} tone={floatTone} />
            ) : null
          }
        >
          {header}
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
                <AppText className="px-1 text-sm font-semibold text-cove-muted">
                  {t("yourHomes")}
                </AppText>
                {homeCards.map((home) => {
                  const active =
                    widePane === "home" && expandedId === home.id;
                  return (
                    <View
                      key={home.id}
                      className="overflow-hidden rounded-3xl"
                      style={{
                        backgroundColor: active
                          ? withAlpha(colors.accent, 0.12)
                          : colors.paper,
                      }}
                    >
                      <HomeCard
                        {...homeCardProps(home, false)}
                        variant="accordion"
                      />
                    </View>
                  );
                })}
                <Pressable
                  onPress={() => {
                    setWidePane("add");
                    setAddMode("create");
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: widePane === "add" }}
                  className="flex-row items-center gap-3 overflow-hidden rounded-3xl px-4 py-4 active:opacity-80"
                  style={{
                    backgroundColor:
                      widePane === "add"
                        ? withAlpha(colors.accent, 0.12)
                        : colors.paper,
                  }}
                >
                  <View
                    className="h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: colors.mist }}
                  >
                    <Ionicons
                      name="add-outline"
                      size={22}
                      color={colors.accent}
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <AppText className="text-base font-semibold text-cove-ink">
                      {t("addAHome")}
                    </AppText>
                    <AppText
                      className="mt-1 text-sm text-cove-muted"
                      numberOfLines={1}
                    >
                      {t("addAHomeSummary")}
                    </AppText>
                  </View>
                  <Ionicons
                    name={isRTL ? "chevron-back" : "chevron-forward"}
                    size={iconSize.sm}
                    color={
                      widePane === "add" ? colors.accent : colors.ink
                    }
                  />
                </Pressable>
              </View>
            </View>
          ) : (
            <EmptyState title={t("noHomeYet")} message={t("noHomeYetBody")} />
          )}
          {modals}
        </Screen>
      }
      detail={
        <Screen scroll={false} tabBarInset>
          {widePane === "add" ? (
            <View className="gap-3 px-0 pt-2">
              <AppText className="text-xl font-semibold text-cove-ink">
                {t("addAHome")}
              </AppText>
              <AppText className="mb-1 text-sm text-cove-muted">
                {t("addAHomeSummary")}
              </AppText>
              {addHomeForms}
            </View>
          ) : selectedHome && household ? (
            <View className="pt-2">
              <HomeCard
                {...homeCardProps(selectedHome, true)}
                variant="detail"
              />
            </View>
          ) : (
            <FoldPaneEmpty
              icon="home-outline"
              title={t("homePickTitle")}
              body={t("homePickBody")}
            />
          )}
        </Screen>
      }
    />
  );
}

/** Hub row that opens a Home sub-page (same look as the settings hub). */
function HubLink({
  icon,
  title,
  summary,
  href,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  href: Href;
}) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row items-center gap-3 overflow-hidden rounded-3xl bg-cove-paper px-4 py-4 active:opacity-80"
    >
      <SettingsCardIcon icon={icon} colors={colors} />
      <SettingsCardCopy title={title} body={summary} bodyLines={1} />
      <Ionicons
        name={isRTL ? "chevron-back" : "chevron-forward"}
        size={iconSize.sm}
        color={colors.ink}
      />
    </Pressable>
  );
}

const AVATAR_COLORS = ["#2E8AE6", "#E0A64A", "#58C27D", "#B07CE8", "#E07A5F"];

/** The home you're in: name, your role, and who shares it. */
function CurrentHomeCard({
  name,
  role,
  members,
  currentUserId,
}: {
  name: string;
  role: "owner" | "partner";
  members: HouseholdMember[];
  currentUserId?: string;
}) {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dark = scheme === "dark";
  const ordered = [...members].sort((a, b) =>
    a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : 0,
  );
  const names = ordered.map((member) =>
    member.id === currentUserId ? t("you") : member.name,
  );

  return (
    <View
      className="overflow-hidden rounded-3xl px-4 py-4"
      style={{
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: withAlpha(colors.accent, dark ? 0.35 : 0.25),
      }}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withAlpha(colors.accent, dark ? 0.18 : 0.12) }}
        >
          <Ionicons name="home" size={22} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <AppText className="text-xs font-semibold text-cove-muted">{t("currentHome")}</AppText>
          <AppText className="text-xl font-semibold text-cove-ink" numberOfLines={1}>
            {name}
          </AppText>
        </View>
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: withAlpha(colors.accent, dark ? 0.16 : 0.1) }}
        >
          <AppText className="text-xs font-semibold" style={{ color: colors.accent }}>
            {role === "owner" ? t("host") : t("partner")}
          </AppText>
        </View>
      </View>

      <View className="mt-4 flex-row items-center gap-3">
        <View className="flex-row">
          {ordered.slice(0, 4).map((member, index) => (
            <View
              key={member.id}
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{
                backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
                borderWidth: 2,
                borderColor: colors.paper,
                marginStart: index === 0 ? 0 : -8,
              }}
            >
              <AppText className="text-xs font-bold" style={{ color: "#FFFFFF" }}>
                {(member.id === currentUserId ? t("you") : member.name).trim().charAt(0).toUpperCase()}
              </AppText>
            </View>
          ))}
        </View>
        <View className="min-w-0 flex-1">
          <AppText className="text-sm font-semibold text-cove-ink" numberOfLines={1}>
            {names.join(", ")}
          </AppText>
          <AppText className="text-xs text-cove-muted">
            {members.length > 1 ? t("membersCount", { count: members.length }) : t("inviteToShare")}
          </AppText>
        </View>
      </View>
    </View>
  );
}
