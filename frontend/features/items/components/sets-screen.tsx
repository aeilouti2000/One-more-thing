import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { cardLift } from "@/constants/theme";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SheetField } from "@/components/ui/SheetField";
import { RequireSession } from "@/features/auth/components/require-session";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { fetchLists, listLabel, type HomeList } from "@/features/items/api/lists";
import {
  addSetToList,
  cachedSets,
  deleteSet,
  fetchSets,
  SET_NAME_MAX,
  updateSet,
  type ItemSet,
  type SetItem,
} from "@/features/items/api/sets";
import { useUnitLabel } from "@/features/items/components/item-sheet-form";
import { usePurchasesData } from "@/features/items/hooks/use-purchases";
import { formatMoney } from "@/features/items/utils/currency";
import { readStoredListId } from "@/features/items/utils/list-storage";
import { lastPrices, priceOf } from "@/features/items/utils/trip-helpers";
import { readCachedLists } from "@/features/offline/saved";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { useMotionOff } from "@/providers/MotionProvider";

/** How long "Added" stays on a card's button. */
const ADDED_MS = 1800;

export default function SetsScreen() {
  return (
    <RequireSession requireHome>
      <SetsBody />
    </RequireSession>
  );
}

function SetsBody() {
  const { household } = useHousehold();
  const { bought } = usePurchasesData();
  const { t } = useI18n();
  const motionOff = useMotionOff();
  const homeId = household?.id ?? null;

  const [sets, setSets] = useState<ItemSet[]>(() => (homeId ? (cachedSets(homeId) ?? []) : []));
  const [isLoading, setIsLoading] = useState(() => !homeId || cachedSets(homeId) === null);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<HomeList[]>(() =>
    homeId ? (readCachedLists<HomeList>(homeId) ?? []) : [],
  );
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  // Cards slide in one after another on first open, like the Pins page.
  const [revealing, setRevealing] = useState(() => !homeId || cachedSets(homeId) === null);
  const [editing, setEditing] = useState<ItemSet | null>(null);
  const [float, setFloat] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    if (!homeId) return;
    void fetchLists(homeId).then((result) => {
      if (!result.error) setLists(result.lists);
    });
    const result = await fetchSets(homeId);
    setIsLoading(false);
    if (result.sets) {
      setSets(result.sets);
      setError(null);
    } else {
      // Keep what is on screen; a failed reload must not look like "no sets".
      setError(result.error);
    }
  }, [homeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const waitingForSets = isLoading && sets.length === 0 && !error;
  if (waitingForSets && !revealing) setRevealing(true);
  useEffect(() => {
    if (waitingForSets || !revealing) return;
    // Once the first cards have mounted, sets saved or edited later don't animate.
    const timer = setTimeout(() => setRevealing(false), 600);
    return () => clearTimeout(timer);
  }, [waitingForSets, revealing]);

  useEffect(() => {
    if (!addedId) return;
    const timer = setTimeout(() => setAddedId(null), ADDED_MS);
    return () => clearTimeout(timer);
  }, [addedId]);

  useEffect(() => {
    if (!float) return;
    const timer = setTimeout(() => setFloat(null), 2800);
    return () => clearTimeout(timer);
  }, [float]);

  // Sets go to the list the Items tab is showing.
  const target = useMemo(() => {
    if (!homeId || lists.length === 0) return null;
    const stored = readStoredListId(homeId);
    return lists.find((list) => list.id === stored) ?? lists[0];
  }, [homeId, lists]);

  const costs = household?.costsEnabled === true;
  const currency = household?.currency ?? "JOD";
  const prices = useMemo(() => (costs ? lastPrices(bought) : null), [bought, costs]);
  const estimate = useCallback(
    (set: ItemSet) => {
      if (!prices) return null;
      let total = 0;
      let priced = 0;
      for (const item of set.items) {
        const amount = priceOf(prices, item.name, item);
        if (amount === null) continue;
        total += amount;
        priced += 1;
      }
      return priced > 0 ? formatMoney(Math.round(total * 1000) / 1000, currency) : null;
    },
    [currency, prices],
  );

  const addAll = useCallback(
    async (set: ItemSet) => {
      if (addingId) return;
      setAddingId(set.id);
      const result = await addSetToList(set.id, target?.id ?? null);
      setAddingId(null);
      if (result.error) {
        setFloat({ message: result.error, tone: "error" });
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddedId(set.id);
      // Everything went in: the button says so. Partial results still explain.
      if (result.added > 0 && result.skipped === 0) return;
      setFloat({
        message:
          result.added === 0
            ? t("setAllOnList")
            : result.skipped > 0
              ? t("setAddedSkipped", { count: result.added, skipped: result.skipped })
              : t("setAdded", { count: result.added }),
        tone: "success",
      });
    },
    [addingId, t, target?.id],
  );

  const openSet = useCallback((set: ItemSet) => setEditing(set), []);

  return (
    <Screen floating={float ? <FloatMessage message={float.message} tone={float.tone} /> : null}>
      <ScreenHeader
        title={t("setsTitle")}
        subtitle={
          target && lists.length > 1
            ? t("setsAddsTo", { list: listLabel(target.name, t("defaultList")) })
            : t("setsSubtitle")
        }
        showBack
      />

      <FormMessage message={error} />

      {isLoading && sets.length === 0 ? (
        <View className="gap-3">
          {/* Card-sized placeholders, so the first sets don't push the page down. */}
          <View className="h-[104px] rounded-3xl bg-cove-paper opacity-60" />
          <View className="h-[104px] rounded-3xl bg-cove-paper opacity-40" />
        </View>
      ) : sets.length === 0 ? (
        <Animated.View entering={motionOff ? undefined : FadeIn.duration(220)}>
          <EmptyState title={t("setsEmpty")} message={t("setsEmptyBody")} />
        </Animated.View>
      ) : (
        <View className="gap-3">
          {sets.map((set, index) => (
            <SetCard
              key={set.id}
              index={index}
              reveal={revealing}
              set={set}
              estimate={estimate(set)}
              adding={addingId === set.id}
              added={addedId === set.id}
              disabled={addingId !== null}
              onOpen={openSet}
              onAdd={addAll}
            />
          ))}
        </View>
      )}

      <EditSetSheet
        homeId={homeId}
        set={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setSets((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
          setEditing(null);
        }}
        onDeleted={(id) => {
          setSets((current) => current.filter((entry) => entry.id !== id));
          setEditing(null);
        }}
      />
    </Screen>
  );
}

const SetCard = memo(function SetCard({
  index,
  reveal,
  set,
  estimate,
  adding,
  added,
  disabled,
  onOpen,
  onAdd,
}: {
  index: number;
  reveal: boolean;
  set: ItemSet;
  estimate: string | null;
  adding: boolean;
  added: boolean;
  disabled: boolean;
  onOpen: (set: ItemSet) => void;
  onAdd: (set: ItemSet) => void;
}) {
  const { t, isRTL } = useI18n();
  const { colors, glass, scheme } = useTheme();
  const motionOff = useMotionOff();
  const count = t("setItemsCount", { count: set.items.length });
  const meta = estimate ? `${count} · ${t("setAbout")} ${estimate}` : count;
  const addLabel =
    set.items.length === 1 ? t("setAddOne") : t("setAddItems", { count: set.items.length });

  return (
    <Animated.View
      entering={
        motionOff
          ? undefined
          : reveal
          ? FadeInDown.delay(Math.min(index, 8) * 30)
              .duration(420)
              .easing(Easing.out(Easing.cubic))
          : FadeIn.duration(200)
      }
      exiting={motionOff ? undefined : FadeOut.duration(150)}
      layout={motionOff ? undefined : LinearTransition.duration(200)}
    >
      <View
        className="rounded-3xl bg-cove-paper px-4 py-4"
        style={{
          shadowColor: scheme === "dark" ? "#000000" : colors.ink,
          shadowOpacity: scheme === "dark" ? 0.28 : 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          ...cardLift(glass, 2),
        }}
      >
        <Pressable
          onPress={() => onOpen(set)}
          accessibilityRole="button"
          accessibilityLabel={`${set.name}, ${meta}. ${t("setEdit")}`}
          className="flex-row items-center gap-3 active:opacity-80"
        >
          <View className="min-w-0 flex-1">
            <AppText numberOfLines={1} className="text-base font-semibold text-cove-ink">
              {set.name}
            </AppText>
            <AppText numberOfLines={1} className="mt-0.5 text-sm text-cove-muted">
              {count}
              {estimate ? (
                <>
                  {` · ${t("setAbout")} `}
                  <AppText className="text-sm font-semibold text-cove-muted">{estimate}</AppText>
                </>
              ) : null}
            </AppText>
          </View>
          <Ionicons
            name={isRTL ? "chevron-back" : "chevron-forward"}
            size={18}
            color={colors.muted}
            style={{ opacity: 0.5 }}
          />
        </Pressable>

        {/* One line of items, swiped sideways like the add sheet's chips. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerClassName="gap-1.5"
        >
          {set.items.map((item) => (
            <Pressable
              key={item.name}
              onPress={() => onOpen(set)}
              accessible={false}
              className="flex-row items-center rounded-full bg-cove-mist px-2.5 py-1 active:opacity-80"
            >
              <AppText numberOfLines={1} className="text-xs font-semibold text-cove-accent-text">
                {item.name}
              </AppText>
              {item.quantity > 1 ? (
                <AppText className="ms-1 text-xs font-semibold text-cove-accent-text opacity-60">
                  ×{item.quantity}
                </AppText>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>

        <View
          className="mt-3 pt-3"
          style={{ borderTopWidth: 1, borderTopColor: "rgba(127,127,127,0.14)" }}
        >
          <AppButton
            label={added ? t("setAddDone") : addLabel}
            icon={added ? "checkmark" : "cart-outline"}
            variant={added ? "primary" : "secondary"}
            onPress={() => onAdd(set)}
            loading={adding}
            disabled={disabled && !added}
            compact
          />
        </View>
      </View>
    </Animated.View>
  );
});

/** Rename a set, take items out of it, or delete it. */
function EditSetSheet({
  homeId,
  set,
  onClose,
  onSaved,
  onDeleted,
}: {
  homeId: string | null;
  set: ItemSet | null;
  onClose: () => void;
  onSaved: (set: ItemSet) => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const unitLabel = useUnitLabel();
  const [name, setName] = useState("");
  const [items, setItems] = useState<SetItem[]>([]);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The sheet keeps showing the set while it slides away. Every opening
  // starts from the saved set: edits abandoned last time are not kept.
  const [shown, setShown] = useState<ItemSet | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  const isOpen = set !== null;
  if (isOpen !== wasOpen || (set && set !== shown)) {
    setWasOpen(isOpen);
    if (set) {
      setShown(set);
      setName(set.name);
      setItems(set.items);
      setError(null);
      setConfirmingDelete(false);
    }
  }

  const changed =
    shown !== null && (name.trim() !== shown.name || items.length !== shown.items.length);
  const canSave = changed && Boolean(name.trim()) && busy === null;

  async function save() {
    if (!shown || !homeId || !canSave) return;
    setBusy("save");
    setError(null);
    const result = await updateSet(homeId, shown.id, {
      ...(name.trim() !== shown.name ? { name } : {}),
      ...(items.length !== shown.items.length ? { items } : {}),
    });
    setBusy(null);
    if (result.error || !result.set) {
      setError(result.error ?? t("errorGeneric"));
      return;
    }
    onSaved(result.set);
  }

  async function remove() {
    if (!shown || !homeId) return;
    setBusy("delete");
    setError(null);
    const result = await deleteSet(homeId, shown.id);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirmingDelete(false);
    onDeleted(shown.id);
  }

  return (
    <>
      <BottomSheet visible={set !== null && !confirmingDelete} locked={busy !== null} onClose={onClose}>
        <View className="gap-3">
          <AppText className="text-xl font-semibold text-cove-ink">{t("setEdit")}</AppText>
          <SheetField
            value={name}
            onChangeText={setName}
            placeholder={t("setNamePlaceholder")}
            icon="albums-outline"
            maxLength={SET_NAME_MAX}
            editable={busy === null}
          />
          <View className="rounded-2xl bg-cove-mist ps-4 pe-1.5">
            {items.map((item, index) => (
              <View
                key={item.name}
                className="flex-row items-center gap-3 py-1.5"
                style={
                  index === 0
                    ? undefined
                    : { borderTopWidth: 1, borderTopColor: "rgba(127,127,127,0.14)" }
                }
              >
                <AppText numberOfLines={1} className="min-w-0 flex-1 text-base text-cove-ink">
                  {item.name}
                </AppText>
                <AppText className="text-sm font-semibold text-cove-muted">
                  {item.unit ? `${item.quantity} ${unitLabel(item.unit)}` : String(item.quantity)}
                </AppText>
                <Pressable
                  onPress={() => {
                    if (items.length <= 1) {
                      setError(t("setKeepOne"));
                      return;
                    }
                    void Haptics.selectionAsync();
                    setError(null);
                    setItems((current) => current.filter((entry) => entry.name !== item.name));
                  }}
                  disabled={busy !== null}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={t("setRemoveItem", { name: item.name })}
                  className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
                >
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
          <FormMessage message={error} />
          <AppButton
            label={t("saveChanges")}
            onPress={() => void save()}
            loading={busy === "save"}
            disabled={!canSave}
          />
          <AppButton
            label={t("setDelete")}
            variant="danger"
            icon="trash-outline"
            onPress={() => setConfirmingDelete(true)}
            disabled={busy !== null}
          />
        </View>
      </BottomSheet>
      <ConfirmModal
        visible={confirmingDelete}
        title={t("setDeleteTitle")}
        message={t("setDeleteMessage", { name: shown?.name ?? "" })}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        icon="trash-outline"
        error={error}
        loading={busy === "delete"}
        onConfirm={() => void remove()}
        onCancel={() => {
          setConfirmingDelete(false);
          setError(null);
        }}
      />
    </>
  );
}
