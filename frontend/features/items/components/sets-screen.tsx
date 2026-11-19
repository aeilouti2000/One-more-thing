import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
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
import { readCachedLists } from "@/features/offline/profile-cache";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Item names shown on a card before "+N". */
const CHIPS_SHOWN = 5;

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
  const homeId = household?.id ?? null;

  const [sets, setSets] = useState<ItemSet[]>(() => (homeId ? (cachedSets(homeId) ?? []) : []));
  const [isLoading, setIsLoading] = useState(() => !homeId || cachedSets(homeId) === null);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<HomeList[]>(() =>
    homeId ? (readCachedLists<HomeList>(homeId) ?? []) : [],
  );
  const [addingId, setAddingId] = useState<string | null>(null);
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
        <Animated.View entering={FadeIn.duration(220)}>
          <EmptyState title={t("setsEmpty")} message={t("setsEmptyBody")} />
        </Animated.View>
      ) : (
        <View className="gap-3">
          {sets.map((set) => (
            <SetCard
              key={set.id}
              set={set}
              estimate={estimate(set)}
              adding={addingId === set.id}
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
  set,
  estimate,
  adding,
  disabled,
  onOpen,
  onAdd,
}: {
  set: ItemSet;
  estimate: string | null;
  adding: boolean;
  disabled: boolean;
  onOpen: (set: ItemSet) => void;
  onAdd: (set: ItemSet) => void;
}) {
  const { t } = useI18n();
  const meta = estimate
    ? t("setItemsAbout", { count: set.items.length, amount: estimate })
    : t("setItemsCount", { count: set.items.length });
  const shown = set.items.slice(0, CHIPS_SHOWN);
  const more = set.items.length - shown.length;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition.duration(200)}
      className="rounded-3xl bg-cove-paper px-4 py-4"
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => onOpen(set)}
          accessibilityRole="button"
          accessibilityLabel={`${set.name}, ${meta}. ${t("setEdit")}`}
          className="min-w-0 flex-1 active:opacity-80"
        >
          <AppText numberOfLines={1} className="text-base font-semibold text-cove-ink">
            {set.name}
          </AppText>
          <AppText numberOfLines={1} className="mt-0.5 text-sm text-cove-muted">
            {meta}
          </AppText>
        </Pressable>
        <AppButton
          label={t("setAddAll")}
          onPress={() => onAdd(set)}
          loading={adding}
          disabled={disabled}
          compact
          fit
        />
      </View>
      <Pressable
        onPress={() => onOpen(set)}
        accessible={false}
        className="mt-3 flex-row flex-wrap gap-1.5 active:opacity-80"
      >
        {shown.map((item) => (
          <View key={item.name} className="max-w-full rounded-full bg-cove-mist px-2.5 py-1">
            <AppText numberOfLines={1} className="text-xs font-semibold text-cove-accent-text">
              {item.name}
            </AppText>
          </View>
        ))}
        {more > 0 ? (
          <View className="rounded-full bg-cove-mist px-2.5 py-1">
            <AppText className="text-xs font-semibold text-cove-accent-text">
              {t("setMore", { count: more })}
            </AppText>
          </View>
        ) : null}
      </Pressable>
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
