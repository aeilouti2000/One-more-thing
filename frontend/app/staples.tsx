import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, View } from "react-native";
import { RequireSession } from "@/components/auth/RequireSession";
import { CategoryChip } from "@/components/purchases/CategoryChip";
import { UrgentToggle } from "@/components/purchases/UrgentToggle";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PURCHASE_CATEGORIES, getCategoryLabel } from "@/constants/categories";
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
      <FormMessage message={error} />

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
                  {quantityLabel} · {getCategoryLabel(staple.category, locale)} · {t(intervalKeys[staple.intervalDays])}
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
                    <AppText className="text-sm font-semibold text-red-600">{t("removeStaple")}</AppText>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {isAdding ? (
      <View className="mt-6 gap-5">
        <SectionHeader title={t("addStaple")} />
        <AppTextField
          label={t("itemNameLabel")}
          value={name}
          onChangeText={setName}
          placeholder={t("itemNamePlaceholder")}
          userText
        />
        <AppTextField
          label={t("quantity")}
          value={quantity}
          onChangeText={(value) => {
            setQuantity(value);
            setQuantityError(undefined);
          }}
          keyboardType="decimal-pad"
          error={quantityError}
        />
        <View>
          <SectionHeader title={t("category")} />
          <View key={locale} className="flex-row flex-wrap gap-2">
            {PURCHASE_CATEGORIES.map((item) => (
              <CategoryChip
                key={`${item.id}-${locale}`}
                category={item.id}
                selected={category === item.id}
                onPress={() => setCategory(item.id)}
              />
            ))}
          </View>
        </View>
        <View>
          <SectionHeader title={t("stapleInterval")} />
          <View className="flex-row flex-wrap gap-2">
            {STAPLE_INTERVALS.map((days) => (
              <CategoryChip
                key={days}
                label={t(intervalKeys[days])}
                selected={intervalDays === days}
                onPress={() => setIntervalDays(days)}
              />
            ))}
          </View>
        </View>
        <UrgentToggle value={urgent} onValueChange={setUrgent} />
        <Pressable onPress={() => setAddNow((value) => !value)} className="flex-row items-center gap-3">
          <View
            className={`h-6 w-6 items-center justify-center rounded-md ${addNow ? "bg-cove-accent" : "bg-cove-line"}`}
          >
            {addNow ? <AppText className="text-xs font-semibold text-white">✓</AppText> : null}
          </View>
          <AppText className="text-base text-cove-ink">{t("addToListNow")}</AppText>
        </Pressable>
        <AppButton
          label={t("addStaple")}
          disabled={!name.trim()}
          loading={isSaving}
          onPress={() => void onSave()}
        />
        <AppButton label={t("cancel")} variant="secondary" onPress={closeForm} />
      </View>
      ) : (
        <View className="mt-6">
          <AppButton label={t("addStaple")} onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  );
}
