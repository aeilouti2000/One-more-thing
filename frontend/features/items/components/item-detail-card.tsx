import { useEffect, useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { CategoryField } from "@/features/items/components/category-field";
import { CostEntrySheet } from "@/features/items/components/cost-entry-sheet";
import { StatusBadge } from "@/features/items/components/status-badge";
import { UrgentToggle } from "@/features/items/components/urgent-toggle";
import { AppButton } from "@/components/ui/AppButton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import {
  FloatedCard,
  FloatedCardActions,
  FloatedCardHeader,
  FloatedCardMeta,
  FloatedCardSection,
} from "@/components/ui/FloatedCard";
import { FormMessage } from "@/components/ui/FormMessage";
import { FormSheetModal, useFormSheet } from "@/components/ui/FormSheetModal";
import { floatedControlRadius, withAlpha } from "@/constants/theme";
import { useCategoryLabel } from "@/features/items/providers/categories-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import { formatMoney } from "@/features/items/utils/currency";
import { createPin, deletePin, fetchPins } from "@/features/items/api/pins";
import { parseQuantity } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase, PurchaseCategory } from "@/features/items/types/purchase";

type ItemDetailCardProps = {
  purchase: Purchase | null;
  visible: boolean;
  onClose: () => void;
  onDelete?: () => Promise<{ error: string | null }>;
  /** Fold detail pane vs phone bottom sheet. */
  presentation?: "sheet" | "pane";
};

export function ItemDetailCard({
  purchase,
  visible,
  onClose,
  onDelete,
  presentation = "sheet",
}: ItemDetailCardProps) {
  const { updateItem, updateCost, markBought } = usePurchases();
  const { household } = useHousehold();
  const { t, isRTL } = useI18n();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<PurchaseCategory>("vegetables");
  const [urgent, setUrgent] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinBaseline, setPinBaseline] = useState(false);
  const [pinnedPinId, setPinnedPinId] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingOpen, setEditingOpen] = useState(false);
  const [costPromptOpen, setCostPromptOpen] = useState(false);
  const [editCostOpen, setEditCostOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const editable = purchase?.status === "needed";
  const askSingleCost =
    household?.costsEnabled === true && household.askCostOnSingleBuy !== false;

  function fill(item: Purchase) {
    setName(item.name);
    setQuantity(String(item.quantity));
    setNotes(item.notes ?? "");
    setCategory(item.category);
    setUrgent(item.urgent);
    setPinned(false);
    setPinBaseline(false);
    setPinnedPinId(null);
    setQuantityError(undefined);
    setEditingOpen(false);
  }

  async function loadPin(item: Purchase) {
    if (!household || item.status !== "needed") return;
    const existing = await fetchPins(household.id);
    if (existing.error) return;
    const match = existing.pins.find(
      (pin) => pin.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
    );
    const isPinned = Boolean(match);
    setPinnedPinId(match?.id ?? null);
    setPinned(isPinned);
    setPinBaseline(isPinned);
  }

  function close() {
    if (isSubmitting || deleteBusy) return;
    setDeleteOpen(false);
    onClose();
  }

  async function confirmDelete() {
    if (!onDelete || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const result = await onDelete();
    setDeleteBusy(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleteOpen(false);
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
      if (pinned && !pinnedPinId) {
        const pinResult = await createPin(household.id, {
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
      } else if (!pinned && pinnedPinId) {
        const pinResult = await deletePin(pinnedPinId);
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

  async function completeBought(cost: number | null) {
    if (!purchase) return;
    setIsSubmitting(true);
    setError(null);
    const result = await markBought(purchase.id, cost);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCostPromptOpen(false);
    onClose();
  }

  function onMarkBought() {
    if (!purchase) return;
    if (askSingleCost) {
      setError(null);
      setCostPromptOpen(true);
      return;
    }
    void completeBought(null);
  }

  async function onSaveEditedCost(cost: number | null) {
    if (!purchase) return;
    setIsSubmitting(true);
    setError(null);
    const result = await updateCost(purchase.id, cost);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditCostOpen(false);
    // Sheet: dismiss entirely. Pane: stay on the item after saving cost.
    if (presentation === "sheet") onClose();
  }

  function syncFromPurchase(item: Purchase) {
    fill(item);
    setError(null);
    setCostPromptOpen(false);
    setEditCostOpen(false);
    setDeleteOpen(false);
    setDeleteError(null);
    void loadPin(item);
  }

  useEffect(() => {
    if (presentation !== "pane" || !visible || !purchase) return;
    syncFromPurchase(purchase);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when the open item changes
  }, [presentation, visible, purchase?.id]);

  const detailBody =
    purchase && !editable ? (
      <HistoryItemCard
        purchase={purchase}
        currency={household?.currency ?? "JOD"}
        costsEnabled={household?.costsEnabled === true}
        error={error}
        showClose={presentation === "sheet"}
        onEditCost={() => setEditCostOpen(true)}
        onAskDelete={onDelete ? () => setDeleteOpen(true) : undefined}
        onClose={close}
      />
    ) : (
      <EditItemForm
        purchase={purchase}
        name={name}
        quantity={quantity}
        notes={notes}
        category={category}
        urgent={urgent}
        pinned={pinned}
        pinBaseline={pinBaseline}
        quantityError={quantityError}
        error={error}
        isSubmitting={isSubmitting}
        editingOpen={editingOpen}
        onToggleEditing={() => setEditingOpen((open) => !open)}
        onChangeName={setName}
        onChangeQuantity={(value) => {
          setQuantity(value);
          setQuantityError(undefined);
        }}
        onChangeNotes={setNotes}
        onChangeCategory={setCategory}
        onChangeUrgent={setUrgent}
        onChangePinned={setPinned}
        onSubmit={() => void onSubmit()}
        onMarkBought={() => onMarkBought()}
      />
    );

  const costSheets = (
    <>
      {purchase ? (
        <CostEntrySheet
          presentation={presentation}
          visible={costPromptOpen}
          title={t("enterCost")}
          subtitle={purchase.name}
          currency={household?.currency ?? "JOD"}
          items={[{ id: purchase.id, name: purchase.name }]}
          loading={isSubmitting}
          errorMessage={costPromptOpen ? error : null}
          skipLabel={t("skipCost")}
          onConfirm={(entries) => void completeBought(entries[0]?.cost ?? null)}
          onSkip={() => void completeBought(null)}
          onClose={() => {
            if (!isSubmitting) {
              setCostPromptOpen(false);
              setError(null);
            }
          }}
        />
      ) : null}

      {purchase && household?.costsEnabled ? (
        <CostEntrySheet
          presentation={presentation}
          visible={editCostOpen}
          title={t("editCost")}
          subtitle={purchase.name}
          currency={household.currency}
          items={[
            {
              id: purchase.id,
              name: purchase.name,
              initialCost: purchase.cost,
            },
          ]}
          loading={isSubmitting}
          errorMessage={editCostOpen ? error : null}
          skipLabel={t("clearCost")}
          onConfirm={(entries) => void onSaveEditedCost(entries[0]?.cost ?? null)}
          onSkip={() => void onSaveEditedCost(null)}
          onClose={() => {
            if (!isSubmitting) {
              setEditCostOpen(false);
              setError(null);
            }
          }}
        />
      ) : null}
    </>
  );

  const deleteConfirm = (
    <ConfirmModal
      visible={deleteOpen && purchase !== null}
      title={t("deleteHistoryTitle")}
      message={t("deleteHistoryMessage")}
      confirmLabel={t("delete")}
      cancelLabel={t("cancel")}
      icon="trash-outline"
      error={deleteError}
      loading={deleteBusy}
      onConfirm={() => void confirmDelete()}
      onCancel={() => {
        if (deleteBusy) return;
        setDeleteOpen(false);
        setDeleteError(null);
      }}
    />
  );

  if (presentation === "pane") {
    if (!visible || !purchase) return null;
    const costOpen = costPromptOpen || editCostOpen;
    return (
      <>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pb-10 pt-2"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {costOpen ? (
            <View className="gap-3">
              <Pressable
                onPress={() => {
                  if (isSubmitting) return;
                  setCostPromptOpen(false);
                  setEditCostOpen(false);
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={t("back")}
                className="flex-row items-center gap-1 self-start active:opacity-80"
              >
                <Ionicons
                  name={isRTL ? "chevron-forward" : "chevron-back"}
                  size={18}
                  color={colors.accent}
                />
                <AppText className="text-sm font-semibold text-cove-accent">
                  {t("back")}
                </AppText>
              </Pressable>
              {costSheets}
            </View>
          ) : (
            detailBody
          )}
        </ScrollView>
        {deleteConfirm}
      </>
    );
  }

  return (
    <>
      <FormSheetModal
        visible={visible && purchase !== null && !costPromptOpen && !editCostOpen && !deleteOpen}
        onClose={close}
        onShow={() => {
          if (!purchase) return;
          syncFromPurchase(purchase);
        }}
      >
        {detailBody}
      </FormSheetModal>
      {costSheets}
      {deleteConfirm}
    </>
  );
}

function EditItemForm({
  purchase,
  name,
  quantity,
  notes,
  category,
  urgent,
  pinned,
  pinBaseline,
  quantityError,
  error,
  isSubmitting,
  editingOpen,
  onToggleEditing,
  onChangeName,
  onChangeQuantity,
  onChangeNotes,
  onChangeCategory,
  onChangeUrgent,
  onChangePinned,
  onSubmit,
  onMarkBought,
}: {
  purchase: Purchase | null;
  name: string;
  quantity: string;
  notes: string;
  category: PurchaseCategory;
  urgent: boolean;
  pinned: boolean;
  pinBaseline: boolean;
  quantityError?: string;
  error: string | null;
  isSubmitting: boolean;
  editingOpen: boolean;
  onToggleEditing: () => void;
  onChangeName: (value: string) => void;
  onChangeQuantity: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onChangeCategory: (value: PurchaseCategory) => void;
  onChangeUrgent: (value: boolean) => void;
  onChangePinned: (value: boolean) => void;
  onSubmit: () => void;
  onMarkBought: () => void;
}) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const formSheet = useFormSheet();
  const categoryLabel = useCategoryLabel(category);
  const quantityLabel = purchase?.unit
    ? `${quantity} ${purchase.unit}`
    : quantity;
  const parsedQuantity = parseQuantity(quantity);
  const hasChanges = Boolean(
    purchase &&
      (name.trim() !== purchase.name.trim() ||
        (parsedQuantity === null
          ? quantity.trim() !== String(purchase.quantity)
          : parsedQuantity !== purchase.quantity) ||
        notes.trim() !== (purchase.notes ?? "").trim() ||
        category !== purchase.category ||
        urgent !== purchase.urgent ||
        pinned !== pinBaseline),
  );

  useEffect(() => {
    if (editingOpen) {
      formSheet?.scrollToEnd();
    }
  }, [editingOpen, formSheet]);

  const dateLabel = purchase
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(purchase.createdAt))
    : null;

  return (
    <FloatedCard>
      <View className="mb-5 gap-3">
        <View className="flex-row items-start gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <AppText className="text-lg font-semibold text-cove-ink" numberOfLines={2}>
              {name.trim() || purchase?.name || t("item")}
            </AppText>
            {purchase?.urgent && purchase.status !== "bought" ? (
              <AppText className="text-xs font-semibold" style={{ color: "#F87171" }}>
                {t("urgent")}
              </AppText>
            ) : null}
          </View>
          {purchase ? (
            <FloatedCardMeta
              lines={[
                t("addedByName", { name: purchase.addedByName }),
                ...(dateLabel ? [dateLabel] : []),
              ]}
            />
          ) : null}
        </View>
        <View
          className="h-0.5 w-10 rounded-full"
          style={{ backgroundColor: colors.accent }}
        />
      </View>

      {purchase ? (
        <View className="gap-4">
          {!editingOpen ? (
            <View className="gap-3">
              <View className="flex-row flex-wrap items-center gap-2">
                <SummaryChip label={`${t("quantity")}: ${quantityLabel}`} />
                <SummaryChip label={categoryLabel} />
                {pinned ? <SummaryChip label={t("pinSelected")} /> : null}
              </View>
              {notes.trim() ? (
                <AppText className="text-sm text-cove-muted" numberOfLines={3}>
                  {notes}
                </AppText>
              ) : null}
            </View>
          ) : null}

          <Pressable
            onPress={onToggleEditing}
            accessibilityRole="button"
            accessibilityState={{ expanded: editingOpen }}
            className="flex-row items-center justify-between py-1 active:opacity-80"
          >
            <AppText className="text-sm font-semibold text-cove-ink">{t("editItem")}</AppText>
            <Ionicons
              name={editingOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.muted}
            />
          </Pressable>

          {editingOpen ? (
            <View className="gap-4">
              <FloatedCardSection title={t("formEssentials")}>
                <View className="flex-row items-stretch gap-3">
                  <View className="min-w-0 flex-1">
                    <AppTextField
                      compact
                      glass
                      label={t("itemNameLabel")}
                      value={name}
                      onChangeText={onChangeName}
                      placeholder={t("itemNamePlaceholder")}
                      userText
                      onFocus={() => formSheet?.scrollToStart()}
                    />
                  </View>
                  <View className="w-20">
                    <AppTextField
                      compact
                      glass
                      label={t("quantity")}
                      value={quantity}
                      onChangeText={onChangeQuantity}
                      placeholder="1"
                      keyboardType="decimal-pad"
                      error={quantityError}
                      onFocus={() => formSheet?.scrollToStart()}
                    />
                  </View>
                </View>
                <CategoryField glass value={category} onChange={onChangeCategory} />
              </FloatedCardSection>

              <FloatedCardSection title={t("formExtra")} divided>
                <View className="flex-row flex-wrap gap-4">
                  <UrgentToggle compact value={urgent} onValueChange={onChangeUrgent} />
                  <UrgentToggle
                    compact
                    label={t("pinSelected")}
                    value={pinned}
                    onValueChange={onChangePinned}
                  />
                </View>
                <AppTextField
                  compact
                  glass
                  label={t("notes")}
                  value={notes}
                  onChangeText={onChangeNotes}
                  placeholder={t("notesPlaceholder")}
                  multiline
                  userText
                  onFocus={() => formSheet?.scrollToEnd()}
                />
              </FloatedCardSection>
            </View>
          ) : null}

          <FormMessage message={error} />

          <FloatedCardActions className="mt-2">
            <Pressable
              disabled={isSubmitting || (hasChanges && !name.trim())}
              onPress={hasChanges ? onSubmit : onMarkBought}
              accessibilityRole="button"
              className={`h-12 flex-1 flex-row items-center justify-center gap-2 bg-cove-accent px-4 ${
                isSubmitting || (hasChanges && !name.trim())
                  ? "opacity-50"
                  : "active:opacity-80"
              }`}
              style={{ borderRadius: floatedControlRadius }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : hasChanges ? (
                <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                  {t("saveChanges")}
                </AppText>
              ) : (
                <>
                  <MaterialCommunityIcons name="cart-check" size={18} color={colors.onAccent} />
                  <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                    {t("markBought")}
                  </AppText>
                </>
              )}
            </Pressable>
          </FloatedCardActions>
        </View>
      ) : null}
    </FloatedCard>
  );
}

function SummaryChip({ label }: { label: string }) {
  const { colors, scheme } = useTheme();

  return (
    <View
      className="px-3 py-1"
      style={{
        borderRadius: floatedControlRadius,
        backgroundColor: scheme === "dark" ? colors.mist : colors.soft,
      }}
    >
      <AppText className="text-xs font-medium text-cove-ink">{label}</AppText>
    </View>
  );
}

function HistoryItemCard({
  purchase,
  currency,
  costsEnabled,
  error,
  showClose = true,
  onEditCost,
  onAskDelete,
  onClose,
}: {
  purchase: Purchase;
  currency: string;
  costsEnabled: boolean;
  error: string | null;
  showClose?: boolean;
  onEditCost: () => void;
  onAskDelete?: () => void;
  onClose: () => void;
}) {
  const { t, locale, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const categoryLabel = useCategoryLabel(purchase.category);
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
  const costLabel = costsEnabled
    ? formatMoney(purchase.cost, currency, t("noPrice"))
    : null;
  const facts = [
    { label: t("quantity"), value: quantityLabel },
    { label: t("category"), value: categoryLabel },
    costLabel ? { label: t("itemCost"), value: costLabel } : null,
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
    <FloatedCard>
      <FloatedCardHeader
        title={purchase.name}
        trailing={
          <View className="flex-row items-center gap-2">
            {onAskDelete ? (
              <Pressable
                onPress={onAskDelete}
                accessibilityRole="button"
                accessibilityLabel={t("delete")}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full active:opacity-80"
                style={{
                  backgroundColor:
                    scheme === "dark"
                      ? "rgba(240, 113, 120, 0.16)"
                      : "rgba(194, 65, 74, 0.1)",
                }}
              >
                <Ionicons
                  name="trash-outline"
                  size={16}
                  color={scheme === "dark" ? "#F07178" : "#C2414A"}
                />
              </Pressable>
            ) : null}
            <StatusBadge status={purchase.status} />
          </View>
        }
      />

      <View className="gap-3">
        <FloatedCardSection title={t("formEssentials")}>
          {facts.map((fact, index) => (
            <View
              key={`${fact.label}-${fact.value}`}
              className="flex-row items-center justify-between gap-4 py-1"
              style={
                index < facts.length - 1
                  ? {
                      borderBottomWidth: 1,
                      borderBottomColor:
                        scheme === "dark"
                          ? withAlpha(colors.white, 0.08)
                          : withAlpha("#12141A", 0.08),
                      paddingBottom: 10,
                      marginBottom: 2,
                    }
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
        </FloatedCardSection>

        {purchase.notes ? (
          <FloatedCardSection title={t("notes")} divided>
            <AppText className="text-base font-medium text-cove-ink">{purchase.notes}</AppText>
          </FloatedCardSection>
        ) : null}

        <FormMessage message={error} />
      </View>

      {costsEnabled || showClose || onAskDelete ? (
        <FloatedCardActions>
          {costsEnabled ? (
            <AppButton
              compact
              label={t("editCost")}
              variant="secondary"
              onPress={onEditCost}
              style={{ flex: 1 }}
            />
          ) : null}
          {showClose ? (
            <AppButton
              compact
              label={t("close")}
              variant={costsEnabled ? "primary" : "secondary"}
              onPress={onClose}
              style={{ flex: 1 }}
            />
          ) : null}
        </FloatedCardActions>
      ) : null}
    </FloatedCard>
  );
}
