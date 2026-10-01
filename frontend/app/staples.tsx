import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Modal, Pressable, View } from "react-native";
import { RequireSession } from "@/components/auth/RequireSession";
import { CategoryField } from "@/components/purchases/CategoryField";
import { UrgentToggle } from "@/components/purchases/UrgentToggle";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { BlurBackdrop, GlassFill } from "@/components/ui/BlurBackdrop";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { getCategoryLabel } from "@/constants/categories";
import { useCategories } from "@/providers/CategoriesProvider";
import { useHousehold } from "@/hooks/useHousehold";
import { addItem, fetchHomeItems, updateItemDetails } from "@/lib/items";
import { emitListChanged } from "@/lib/list-sync";
import { parseQuantity } from "@/lib/validation";
import {
  createStaple,
  deleteStaple,
  fetchStaples,
  STAPLE_INTERVALS,
  type Staple,
  type StapleInterval,
} from "@/lib/staples";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { TranslationKey } from "@/constants/i18n";
import type { PurchaseCategory } from "@/types/purchase";

const intervalKeys: Record<StapleInterval, TranslationKey> = {
  1: "intervalDay",
  7: "intervalWeek",
  14: "intervalTwoWeeks",
  30: "intervalMonth",
};

export default function StaplesScreen() {
  return (
    <RequireSession requireHome>
      <StaplesBody />
    </RequireSession>
  );
}

function StaplesBody() {
  const { user } = useAuth();
  const { household } = useHousehold();
  const { t, locale } = useI18n();
  const { categories } = useCategories();
  function categoryName(id: string) {
    const match = categories.find((item) => item.id === id);
    if (match && !match.builtin && match.name) return match.name;
    return getCategoryLabel(id, locale);
  }
  const { colors } = useTheme();
  const [staples, setStaples] = useState<Staple[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState<PurchaseCategory>("supermarket");
  const [urgent, setUrgent] = useState(false);
  const [intervalDays, setIntervalDays] = useState<StapleInterval>(7);
  const [addNow, setAddNow] = useState(true);
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [listCounts, setListCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!household) {
      setStaples([]);
      setIsLoading(false);
      return;
    }
    const result = await fetchStaples(household.id);
    setStaples(result.staples);
    setError(result.error);
    setIsLoading(false);
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onSave() {
    if (!household) return;
    const parsed = parseQuantity(quantity);
    if (!name.trim()) {
      setError(t("errorEnterItemName"));
      return;
    }
    if (parsed === null) {
      setQuantityError(t("errorQuantityMin"));
      return;
    }

    setIsSaving(true);
    setError(null);
    const result = await createStaple(household.id, {
      name: name.trim(),
      quantity: parsed,
      category,
      urgent,
      intervalDays,
      addNow,
    });
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setName("");
    setQuantity("1");
    setUrgent(false);
    setIsAdding(false);
    await load();
  }

  function closeForm() {
    setIsAdding(false);
    setError(null);
    setQuantityError(undefined);
  }

  async function onAddToList(staple: Staple) {
    if (!household || !user || addingId) return;
    setAddingId(staple.id);
    setError(null);
    const listed = await fetchHomeItems(household.id);
    if (listed.error) {
      setAddingId(null);
      setError(listed.error);
      return;
    }

    const match = listed.items.find(
      (item) =>
        item.status === "needed" &&
        item.name.trim().toLowerCase() === staple.name.trim().toLowerCase(),
    );
    const nextQuantity = match ? match.quantity + staple.quantity : staple.quantity;
    const result = match
      ? await updateItemDetails(match.id, {
          name: match.name,
          quantity: nextQuantity,
          category: match.category,
          urgent: match.urgent,
        })
      : await addItem({
          homeId: household.id,
          userId: user.id,
          name: staple.name,
          quantity: staple.quantity,
          category: staple.category,
          unit: staple.unit,
          urgent: staple.urgent,
        });

    setAddingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }

    const copies = Math.max(1, Math.round(nextQuantity / staple.quantity));
    setListCounts((current) => ({ ...current, [staple.id]: copies }));
    emitListChanged();
  }

  async function onRemove(id: string) {
    setRemovingId(id);
    setError(null);
    const result = await deleteStaple(id);
    setRemovingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (isLoading && staples.length === 0 && !error) {
    return <LoadingScreen />;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleStaples = normalizedQuery
    ? staples.filter((staple) => staple.name.toLowerCase().includes(normalizedQuery))
    : staples;

  return (
    <Screen>
      <ScreenHeader title={t("staplesTitle")} subtitle={t("staplesSubtitle")} showBack />
      {isAdding ? null : <FormMessage message={error} />}

      {staples.length > 0 ? (
        <View className="mb-4">
          <AppTextField
            label={t("searchPinned")}
            value={query}
            onChangeText={setQuery}
            placeholder={t("searchPinnedPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            userText
          />
        </View>
      ) : null}

      {staples.length === 0 ? (
        <EmptyState title={t("staplesEmpty")} message={t("staplesEmptyBody")} />
      ) : visibleStaples.length === 0 ? (
        <View className="mb-8">
          <EmptyState title={t("searchPinnedEmpty")} message={t("searchPinnedEmptyBody")} />
        </View>
      ) : (
        <View className="mb-8 gap-3">
          {visibleStaples.map((staple) => {
            const quantityLabel = staple.unit ? `${staple.quantity} ${staple.unit}` : `x${staple.quantity}`;
            const due = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
              month: "short",
              day: "numeric",
            }).format(new Date(staple.nextDueAt));
            return (
              <View key={staple.id} className="rounded-3xl bg-cove-paper px-4 py-4">
                <AppText className="text-base font-semibold text-cove-ink">{staple.name}</AppText>
                <AppText className="mt-1 text-sm text-cove-muted">
                  {quantityLabel} · {categoryName(staple.category)} · {t(intervalKeys[staple.intervalDays])}
                </AppText>
                <AppText className="mt-1 text-sm text-cove-muted">{t("nextDue", { date: due })}</AppText>
                {listCounts[staple.id] ? (
                  <AppText className="mt-2 text-sm font-semibold text-cove-accent">
                    {t("pinnedOnList", { count: listCounts[staple.id] })}
                  </AppText>
                ) : null}
                <View className="mt-3 flex-row items-center gap-5">
                  <Pressable
                    disabled={addingId === staple.id}
                    onPress={() => void onAddToList(staple)}
                    accessibilityRole="button"
                    accessibilityLabel={t("addPinnedToList")}
                    className={addingId === staple.id ? "opacity-40" : "active:opacity-80"}
                  >
                    <AppText className="text-sm font-semibold text-cove-accent">
                      {t("addPinnedToList")}
                    </AppText>
                  </Pressable>
                  <Pressable
                    disabled={removingId === staple.id}
                    onPress={() => void onRemove(staple.id)}
                    className="active:opacity-80"
                  >
                    <AppText className="text-sm font-semibold" style={{ color: "#F87171" }}>{t("removeStaple")}</AppText>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View className="mt-6">
        <AppButton
          label={t("addStaple")}
          onPress={() => {
            setError(null);
            setQuantityError(undefined);
            setIsAdding(true);
          }}
        />
      </View>

      <Modal
        visible={isAdding}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!isSaving) closeForm();
        }}
      >
        <View className="flex-1 items-center justify-center px-5">
          <BlurBackdrop onPress={closeForm} disabled={isSaving} />
          <View
            className="w-full max-w-md overflow-hidden rounded-[28px] border border-cove-line px-7 pb-5 pt-8"
          >
            <GlassFill soft />
            <View className="-mx-7 mb-6 border-b border-cove-line px-7 pb-5">
              <AppText className="text-lg font-semibold text-cove-ink">{t("addStaple")}</AppText>
            </View>
            <View className="gap-4">
            <View className="flex-row items-stretch gap-3">
                  <View className="min-w-0 flex-1">
                    <AppTextField
                      compact
                      glass
                      label={t("itemNameLabel")}
                      value={name}
                      onChangeText={setName}
                      placeholder={t("itemNamePlaceholder")}
                      userText
                    />
                  </View>
                  <View className="w-20">
                    <AppTextField
                      compact
                      glass
                      label={t("quantity")}
                      value={quantity}
                      onChangeText={(value) => {
                        setQuantity(value);
                        setQuantityError(undefined);
                      }}
                      placeholder="1"
                      keyboardType="decimal-pad"
                      error={quantityError}
                    />
                  </View>
                </View>
                <CategoryField glass value={category} onChange={setCategory} />
                <View className="gap-1.5">
                  <AppText className="text-xs font-medium text-cove-muted">{t("stapleInterval")}</AppText>
                  <View className="flex-row flex-wrap gap-2">
                    {STAPLE_INTERVALS.map((days) => {
                      const selected = intervalDays === days;
                      return (
                        <Pressable
                          key={days}
                          onPress={() => setIntervalDays(days)}
                          accessibilityRole="button"
                          className="rounded-full px-3 py-1.5 active:opacity-80"
                          style={{ backgroundColor: selected ? colors.accent : colors.mist }}
                        >
                          <AppText
                            className="text-xs font-medium"
                            style={{ color: selected ? colors.white : colors.ink }}
                          >
                            {t(intervalKeys[days])}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <UrgentToggle compact value={urgent} onValueChange={setUrgent} />
                <Pressable
                  onPress={() => setAddNow((value) => !value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: addNow }}
                  className="flex-row items-center gap-3"
                >
                  <View
                    className={`h-6 w-6 items-center justify-center rounded-md ${addNow ? "bg-cove-accent" : "bg-cove-line"}`}
                  >
                    {addNow ? <AppText className="text-xs font-semibold text-white">✓</AppText> : null}
                  </View>
                  <AppText className="text-base text-cove-ink">{t("addToListNow")}</AppText>
                </Pressable>
            <FormMessage message={error} />
            </View>
            <View className="mt-8 gap-3">
              <AppButton
                compact
                label={t("addStaple")}
                disabled={!name.trim()}
                loading={isSaving}
                onPress={() => void onSave()}
              />
              <AppButton
                compact
                label={t("cancel")}
                variant="ghost"
                disabled={isSaving}
                onPress={closeForm}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
