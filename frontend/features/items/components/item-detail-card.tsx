import { useEffect, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, View } from "react-native";
import { ItemSheetForm, ItemSheetToggle } from "@/features/items/components/item-sheet-form";
import { CostEntrySheet } from "@/features/items/components/cost-entry-sheet";
import {
  ItemPhotoField,
  ItemPhotoViewer,
  PhotoSourceSheet,
  itemPhotoUri,
  useItemPhotoChooser,
} from "@/features/items/components/item-photo";
import { StatusBadge } from "@/features/items/components/status-badge";
import { AppButton } from "@/components/ui/AppButton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AppText } from "@/components/ui/AppText";
import {
  FloatedCard,
  FloatedCardActions,
  FloatedCardHeader,
  FloatedCardSection,
} from "@/components/ui/FloatedCard";
import { FormMessage } from "@/components/ui/FormMessage";
import { FormSheetModal } from "@/components/ui/FormSheetModal";
import { withAlpha } from "@/constants/theme";
import { useCategoryLabel } from "@/features/items/providers/categories-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import { formatMoney } from "@/features/items/utils/currency";
import { createPin, deletePin, fetchPins } from "@/features/items/api/pins";
import { parseQuantity } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase, PurchaseCategory } from "@/features/items/types/purchase";
import type { PickedPhoto } from "@/features/items/api/items";

type ItemDetailCardProps = {
  purchase: Purchase | null;
  visible: boolean;
  onClose: () => void;
  onDelete?: () => Promise<{ error: string | null }>;
  /** Fold detail pane vs phone bottom sheet. */
  presentation?: "sheet" | "pane";
};

export function ItemDetailCard({
  purchase: purchaseProp,
  visible,
  onClose,
  onDelete,
  presentation = "sheet",
}: ItemDetailCardProps) {
  const { updateItem, updateCost, markBought, setItemPhoto } = usePurchases();
  // Keep showing the last item while the sheet slides closed; otherwise the
  // body flips to the empty edit form for a frame when the parent clears it.
  const [lastPurchase, setLastPurchase] = useState<Purchase | null>(purchaseProp);
  if (purchaseProp && purchaseProp !== lastPurchase) setLastPurchase(purchaseProp);
  const purchase = purchaseProp ?? lastPurchase;
  const { household } = useHousehold();
  const { t, isRTL } = useI18n();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<PurchaseCategory>("vegetables");
  const [urgent, setUrgent] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinBaseline, setPinBaseline] = useState(false);
  const [pinnedPinId, setPinnedPinId] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [costPromptOpen, setCostPromptOpen] = useState(false);
  const [editCostOpen, setEditCostOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const editable = purchase?.status === "needed";
  const [viewingPhoto, setViewingPhoto] = useState(false);
  // On an editable item a new or removed photo is a draft: it counts as a
  // change (shows "Save changes") and is only sent when the user saves.
  // undefined = untouched, null = remove, object = new photo.
  const [photoDraft, setPhotoDraft] = useState<PickedPhoto | null | undefined>(undefined);
  const photoChanged = editable && photoDraft !== undefined;
  const savedPhotoUri = itemPhotoUri(purchase);
  const photoUri = photoChanged ? (photoDraft?.uri ?? null) : savedPhotoUri;
  const photoTarget = purchase && !purchase.id.startsWith("temp-") ? purchase.id : null;
  const chooser = useItemPhotoChooser({
    onPicked: (photo) => {
      if (!photoTarget) return;
      if (editable) {
        setPhotoDraft(photo);
        return;
      }
      void setItemPhoto(photoTarget, photo).then((result) => {
        if (result.error) setError(result.error);
      });
    },
    onRemove: () => {
      if (!photoTarget) return;
      if (editable) {
        // Removing a photo that was never saved just drops the draft.
        setPhotoDraft(savedPhotoUri ? null : undefined);
        return;
      }
      void setItemPhoto(photoTarget, null).then((result) => {
        if (result.error) setError(result.error);
      });
    },
  });
  const photoField = photoTarget ? (
    <ItemPhotoField
      uri={photoUri}
      uploading={!photoChanged && purchase?.photoUploading === true}
      onAdd={chooser.open}
      onView={() => setViewingPhoto(true)}
    />
  ) : null;
  const askSingleCost =
    household?.costsEnabled === true && household.askCostOnSingleBuy !== false;

  function fill(item: Purchase) {
    setName(item.name);
    setQuantity(String(item.quantity));
    setUnit(item.unit ?? "");
    setNotes(item.notes ?? "");
    setCategory(item.category);
    setUrgent(item.urgent);
    setPinned(false);
    setPinBaseline(false);
    setPinnedPinId(null);
    setQuantityError(undefined);
    setViewingPhoto(false);
    setPhotoDraft(undefined);
    chooser.setError(null);
  }

  async function loadPin(item: Purchase) {
    if (!household || item.status !== "needed") return;
    const existing = await fetchPins(household.id);
    if (existing.error) return;
    // Pins belong to a list now: only a pin for this item's list counts.
    const match = existing.pins.find(
      (pin) =>
        pin.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
        (!pin.listId || !item.listId || pin.listId === item.listId),
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
      unit,
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
          unit: unit || undefined,
          category,
          urgent,
          intervalDays: 7,
          addNow: false,
          listId: purchase.listId,
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

    if (photoChanged && photoTarget) {
      // Upload in the background; the row shows a spinner until it lands.
      void setItemPhoto(photoTarget, photoDraft ?? null);
    }
    setPhotoDraft(undefined);

    setIsSubmitting(false);
    onClose();
  }

  async function completeBought(cost: number | null) {
    if (!purchase) return;
    setIsSubmitting(true);
    setError(null);
    const result = await markBought(purchase.id, cost, { joinInvoice: true });
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

  // Fold pane: re-fill the form when a different item opens (during render),
  // then look up its pin (network) in an effect.
  const paneItemId = presentation === "pane" && visible && purchase ? purchase.id : null;
  const [syncedPaneItemId, setSyncedPaneItemId] = useState<string | null>(null);
  if (paneItemId !== syncedPaneItemId) {
    setSyncedPaneItemId(paneItemId);
    if (purchase && paneItemId) {
      fill(purchase);
      setError(null);
      setCostPromptOpen(false);
      setEditCostOpen(false);
      setDeleteOpen(false);
      setDeleteError(null);
    }
  }
  useEffect(() => {
    if (!paneItemId || !purchase) return;
    // Async lookup: state is only set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPin(purchase);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the open item changes
  }, [paneItemId]);

  const detailBody =
    purchase && !editable ? (
      <HistoryItemCard
        purchase={purchase}
        currency={household?.currency ?? "JOD"}
        costsEnabled={household?.costsEnabled === true}
        error={error ?? chooser.error}
        photo={photoField}
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
        unit={unit}
        notes={notes}
        category={category}
        urgent={urgent}
        pinned={pinned}
        pinBaseline={pinBaseline}
        photoChanged={photoChanged}
        quantityError={quantityError}
        error={error ?? chooser.error}
        photo={photoField}
        isSubmitting={isSubmitting}
        onClose={presentation === "sheet" ? close : undefined}
        onChangeUnit={setUnit}
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

  const photoLayers = (
    <>
      <PhotoSourceSheet
        visible={chooser.sourceOpen}
        canRemove={Boolean(photoUri)}
        onChoose={chooser.choose}
        onRemove={chooser.remove}
        onClose={chooser.close}
      />
      <ItemPhotoViewer
        uri={viewingPhoto ? photoUri : null}
        title={purchase?.name}
        onClose={() => setViewingPhoto(false)}
      />
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
        {photoLayers}
      </>
    );
  }

  return (
    <>
      <FormSheetModal
        visible={visible && purchase !== null && !costPromptOpen && !editCostOpen && !deleteOpen}
        covered={chooser.covered}
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
      {photoLayers}
    </>
  );
}

function EditItemForm({
  purchase,
  name,
  quantity,
  unit,
  notes,
  category,
  urgent,
  pinned,
  pinBaseline,
  photoChanged,
  quantityError,
  error,
  photo,
  isSubmitting,
  onClose,
  onChangeName,
  onChangeQuantity,
  onChangeUnit,
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
  unit: string;
  notes: string;
  category: PurchaseCategory;
  urgent: boolean;
  pinned: boolean;
  pinBaseline: boolean;
  photoChanged: boolean;
  quantityError?: string;
  error: string | null;
  photo: ReactNode;
  isSubmitting: boolean;
  onClose?: () => void;
  onChangeName: (value: string) => void;
  onChangeQuantity: (value: string) => void;
  onChangeUnit: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onChangeCategory: (value: PurchaseCategory) => void;
  onChangeUrgent: (value: boolean) => void;
  onChangePinned: (value: boolean) => void;
  onSubmit: () => void;
  onMarkBought: () => void;
}) {
  const { t, locale } = useI18n();
  const parsedQuantity = parseQuantity(quantity);
  const hasChanges = Boolean(
    purchase &&
      (name.trim() !== purchase.name.trim() ||
        (parsedQuantity === null
          ? quantity.trim() !== String(purchase.quantity)
          : parsedQuantity !== purchase.quantity) ||
        unit.trim() !== (purchase.unit ?? "").trim() ||
        notes.trim() !== (purchase.notes ?? "").trim() ||
        category !== purchase.category ||
        urgent !== purchase.urgent ||
        pinned !== pinBaseline ||
        photoChanged),
  );

  const dateLabel = purchase
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
        month: "short",
        day: "numeric",
      }).format(new Date(purchase.createdAt))
    : null;
  const subtitle = purchase
    ? [t("addedByName", { name: purchase.addedByName }), dateLabel].filter(Boolean).join(" · ")
    : undefined;

  return (
    <FloatedCard>
      <ItemSheetForm
        title={t("editItem")}
        subtitle={subtitle}
        onClose={onClose}
        name={name}
        onChangeName={onChangeName}
        quantity={quantity}
        onChangeQuantity={onChangeQuantity}
        quantityError={quantityError}
        unit={unit}
        onChangeUnit={onChangeUnit}
        urgent={urgent}
        onChangeUrgent={onChangeUrgent}
        category={category}
        onChangeCategory={onChangeCategory}
        notes={notes}
        onChangeNotes={onChangeNotes}
        photo={photo}
        extra={
          <ItemSheetToggle
            label={t("pinSelected")}
            icon="pin"
            value={pinned}
            onChange={onChangePinned}
          />
        }
        error={error}
        // One button: "Mark as bought" until something changes, then "Save changes".
        submitLabel={hasChanges ? t("saveChanges") : t("markBought")}
        canSubmit={hasChanges ? Boolean(name.trim()) : true}
        submitting={isSubmitting}
        onSubmit={hasChanges ? onSubmit : onMarkBought}
      />
    </FloatedCard>
  );
}

function HistoryItemCard({
  purchase,
  currency,
  costsEnabled,
  error,
  photo,
  showClose = true,
  onEditCost,
  onAskDelete,
  onClose,
}: {
  purchase: Purchase;
  currency: string;
  costsEnabled: boolean;
  error: string | null;
  photo: ReactNode;
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

        {photo}

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
