import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { CategoryField } from "@/components/purchases/CategoryField";
import { StatusBadge, UrgentBadge } from "@/components/purchases/StatusBadge";
import { UrgentToggle } from "@/components/purchases/UrgentToggle";
import { AppButton } from "@/components/ui/AppButton";
import { BlurBackdrop, FrostedFill } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { getCategoryLabel } from "@/constants/categories";
import { useHousehold } from "@/hooks/useHousehold";
import { usePurchases } from "@/hooks/usePurchases";
import { createStaple, deleteStaple, fetchStaples } from "@/lib/staples";
import { parseQuantity } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase, PurchaseCategory } from "@/types/purchase";

type ItemDetailCardProps = {
  purchase: Purchase | null;
  visible: boolean;
  onClose: () => void;
};

export function ItemDetailCard({ purchase, visible, onClose }: ItemDetailCardProps) {
  const { updateItem, markBought } = usePurchases();
  const { household } = useHousehold();
  const { t, locale } = useI18n();
  const { colors, scheme } = useTheme();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<PurchaseCategory>("vegetables");
  const [urgent, setUrgent] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinnedStapleId, setPinnedStapleId] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editable = purchase?.status === "needed";

  function fill(item: Purchase) {
    setName(item.name);
    setQuantity(String(item.quantity));
    setNotes(item.notes ?? "");
    setCategory(item.category);
    setUrgent(item.urgent);
    setPinned(false);
    setPinnedStapleId(null);
    setQuantityError(undefined);
    setError(null);
  }

  async function loadPin(item: Purchase) {
    if (!household || item.status !== "needed") return;
    const existing = await fetchStaples(household.id);
    if (existing.error) return;
    const match = existing.staples.find(
      (staple) => staple.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
    );
    setPinnedStapleId(match?.id ?? null);
    setPinned(Boolean(match));
  }

  function close() {
    if (isSubmitting) return;
    onClose();
  }

  async function onSubmit() {
    if (!purchase || !editable) return;
    const parsedQuantity = parseQuantity(quantity);
    if (!name.trim()) {
      setError(t("errorEnterItemName"));
      return;
    }
    if (parsedQuantity === null) {
      setQuantityError(t("errorQuantityMin"));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setQuantityError(undefined);
    const result = await updateItem(purchase.id, {
      name,
      quantity: parsedQuantity,
      category,
      urgent,
      notes,
    });
    if (result.error) {
      setIsSubmitting(false);
      setError(result.error);
      return;
    }

    if (household) {
      if (pinned && !pinnedStapleId) {
        const pinResult = await createStaple(household.id, {
          name: name.trim(),
          quantity: parsedQuantity,
          category,
          urgent,
          intervalDays: 7,
          addNow: false,
        });
        if (pinResult.error) {
          setIsSubmitting(false);
          setError(pinResult.error);
          return;
        }
      } else if (!pinned && pinnedStapleId) {
        const pinResult = await deleteStaple(pinnedStapleId);
        if (pinResult.error) {
          setIsSubmitting(false);
          setError(pinResult.error);
          return;
        }
      }
    }

    setIsSubmitting(false);
    onClose();
  }

  async function onMarkBought() {
    if (!purchase) return;
    setIsSubmitting(true);
    setError(null);
    const result = await markBought(purchase.id);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal
      visible={visible && purchase !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onShow={() => {
        if (!purchase) return;
        fill(purchase);
        void loadPin(purchase);
      }}
      onRequestClose={close}
    >
      <View className="flex-1 items-center justify-center px-5">
        <BlurBackdrop onPress={close} />
        {purchase && !editable ? (
          <HistoryItemCard purchase={purchase} onClose={close} />
        ) : (
        <View
          className="w-full max-w-md overflow-hidden rounded-[28px] border border-cove-line px-7 pb-5 pt-8"
        >
          <FrostedFill />
          <View className="-mx-7 mb-6 flex-row items-start justify-between gap-4 border-b border-cove-line px-7 pb-5">
            <AppText className="shrink-0 text-lg font-semibold text-cove-ink">{t("editItem")}</AppText>
            {purchase ? (
              <View className="min-w-0 flex-1 items-end">
                <AppText
                  numberOfLines={1}
                  className="text-xs"
                  style={{ color: scheme === "dark" ? "#FFFFFF" : colors.ink }}
                >
                  {t("addedByName", { name: purchase.addedByName })}
                </AppText>
                <AppText
                  numberOfLines={1}
                  className="text-xs"
                  style={{ color: scheme === "dark" ? "#FFFFFF" : colors.ink }}
                >
                  {new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }).format(new Date(purchase.createdAt))}
                </AppText>
              </View>
            ) : null}
          </View>
          {purchase && editable ? (
            <View className="gap-4">
              <View className="flex-row items-stretch gap-3">
                <View className="min-w-0 flex-1">
                  <AppTextField
                    compact
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
              <CategoryField value={category} onChange={setCategory} />
              <View className="flex-row flex-wrap gap-4">
                <UrgentToggle compact value={urgent} onValueChange={setUrgent} />
                <UrgentToggle
                  compact
                  label={t("pinSelected")}
                  value={pinned}
                  onValueChange={setPinned}
                />
              </View>
              <AppTextField
                compact
                label={t("notes")}
                value={notes}
                onChangeText={setNotes}
                placeholder={t("notesPlaceholder")}
                multiline
                userText
              />
              <FormMessage message={error} />
              <View className="mt-6 flex-row items-stretch gap-3">
                <Pressable
                  disabled={isSubmitting || !name.trim()}
                  onPress={() => void onSubmit()}
                  accessibilityRole="button"
                  className={`h-12 min-w-0 flex-1 items-center justify-center rounded-2xl bg-cove-accent px-3 ${
                    isSubmitting || !name.trim() ? "opacity-50" : "active:opacity-80"
                  }`}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <AppText
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      className="text-sm font-semibold text-white"
                    >
                      {t("saveChanges")}
                    </AppText>
                  )}
                </Pressable>
                <Pressable
                  disabled={isSubmitting}
                  onPress={() => void onMarkBought()}
                  accessibilityRole="button"
                  className={`h-12 min-w-0 flex-1 items-center justify-center rounded-2xl px-3 ${
                    isSubmitting ? "opacity-50" : "active:opacity-80"
                  }`}
                  style={{ backgroundColor: colors.mist }}
                >
                  <AppText
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    className="text-sm font-semibold text-cove-accent"
                  >
                    {t("markBought")}
                  </AppText>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
        )}
      </View>
    </Modal>
  );
}

function HistoryItemCard({
  purchase,
  onClose,
}: {
  purchase: Purchase;
  onClose: () => void;
}) {
  const { t, locale, isRTL } = useI18n();
  const { colors } = useTheme();
  const quantityLabel = purchase.unit
    ? `${purchase.quantity} ${purchase.unit}`
    : `${purchase.quantity}`;
  const when = purchase.boughtAt ?? purchase.createdAt;
  const dateLabel = when
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(when))
    : null;
  const facts = [
    { label: t("quantity"), value: quantityLabel },
    { label: t("category"), value: getCategoryLabel(purchase.category, locale) },
    { label: t("addedBy"), value: purchase.addedByName },
    purchase.boughtByName ? { label: t("boughtBy"), value: purchase.boughtByName } : null,
    dateLabel
      ? {
          label: purchase.status === "bought" ? t("bought") : t("addedBy"),
          value: dateLabel,
        }
      : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  return (
    <View
      className="w-full max-w-md gap-6 overflow-hidden rounded-[28px] border border-cove-line px-7 pb-5 pt-8"
    >
      <FrostedFill />
      <View className="-mx-7 flex-row items-center gap-3 border-b border-cove-line px-7 pb-5">
        <AppText
          className="min-w-0 flex-1 text-3xl font-semibold tracking-tight text-cove-ink"
          numberOfLines={2}
        >
          {purchase.name}
        </AppText>
        <View className="flex-row items-center gap-2">
          {purchase.urgent ? <UrgentBadge /> : null}
          <StatusBadge status={purchase.status} />
        </View>
      </View>

      <View
        className="overflow-hidden rounded-2xl px-4"
        style={{ backgroundColor: colors.ice }}
      >
        {facts.map((fact, index) => (
          <View
            key={fact.label}
            className="flex-row items-center justify-between gap-4 py-3"
            style={
              index < facts.length - 1
                ? { borderBottomWidth: 1, borderBottomColor: colors.line }
                : undefined
            }
          >
            <AppText className="text-sm text-cove-muted">{fact.label}</AppText>
            <AppText
              className="min-w-0 flex-1 text-base font-semibold text-cove-ink"
              style={{ textAlign: isRTL ? "left" : "right" }}
              numberOfLines={2}
            >
              {fact.value}
            </AppText>
          </View>
        ))}
      </View>

      {purchase.notes ? (
        <View className="gap-1">
          <AppText className="text-sm text-cove-muted">{t("notes")}</AppText>
          <AppText className="text-base font-medium text-cove-ink">{purchase.notes}</AppText>
        </View>
      ) : null}

      <View className="mt-2">
        <AppButton label={t("close")} variant="secondary" onPress={onClose} />
      </View>
    </View>
  );
}
