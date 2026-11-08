import { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { FloatedCard } from "@/components/ui/FloatedCard";
import { FormSheetModal } from "@/components/ui/FormSheetModal";
import {
  ItemSheetForm,
  useAmountLabel,
  type RecentPick,
} from "@/features/items/components/item-sheet-form";
import {
  ItemPhotoField,
  ItemPhotoViewer,
  PhotoSourceSheet,
  useItemPhotoChooser,
} from "@/features/items/components/item-photo";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import type { PickedPhoto } from "@/features/items/api/items";
import { parseQuantity } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";
import type { PurchaseCategory } from "@/features/items/types/purchase";

const RECENT_LIMIT = 6;

type AddItemCardProps = {
  visible: boolean;
  listId: string | null;
  initialCategory?: PurchaseCategory;
  initialName?: string;
  onClose: () => void;
  onSaved?: () => void;
  presentation?: "sheet" | "pane";
};

export function AddItemCard({
  visible,
  listId,
  initialCategory = "vegetables",
  initialName = "",
  onClose,
  onSaved,
  presentation = "sheet",
}: AddItemCardProps) {
  const { addItem, bought, needed } = usePurchases();
  const { t } = useI18n();
  const amountLabel = useAmountLabel();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<PurchaseCategory>(initialCategory);
  const [urgent, setUrgent] = useState(false);
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [viewing, setViewing] = useState(false);
  const chooser = useItemPhotoChooser({
    onPicked: setPhoto,
    onRemove: () => setPhoto(null),
  });

  function reset(nextCategory: PurchaseCategory, nextName = "") {
    setName(nextName);
    setQuantity("1");
    setUnit("");
    setNotes("");
    setCategory(nextCategory);
    setUrgent(false);
    setQuantityError(undefined);
    setError(null);
    setPhoto(null);
    setViewing(false);
    chooser.setError(null);
  }

  function close() {
    if (isSubmitting) return;
    reset(initialCategory);
    onClose();
  }

  async function onSubmit() {
    const parsedQuantity = parseQuantity(quantity);
    if (!name.trim()) {
      setError(t("errorEnterItemName"));
      return;
    }
    if (parsedQuantity === null) {
      setQuantityError(t("errorQuantityMin"));
      return;
    }
    if (!listId) return;

    setQuantityError(undefined);
    setIsSubmitting(true);
    setError(null);
    const result = await addItem({
      name,
      quantity: parsedQuantity,
      category,
      notes,
      unit: unit || undefined,
      urgent,
      listId,
      photo,
    });
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    reset(initialCategory);
    onSaved?.();
    onClose();
  }

  // Fold pane: reset the form whenever it opens (or its prefill changes).
  const paneKey =
    presentation === "pane" && visible ? `${initialCategory}|${initialName.trim()}` : null;
  const [syncedPaneKey, setSyncedPaneKey] = useState<string | null>(null);
  if (paneKey !== syncedPaneKey) {
    setSyncedPaneKey(paneKey);
    if (paneKey !== null) reset(initialCategory, initialName.trim());
  }

  // Recent: newest bought first, unique names, not already on the list.
  const recent = useMemo<RecentPick[]>(() => {
    const onList = new Set(needed.map((item) => item.name.trim().toLowerCase()));
    const seen = new Set<string>();
    const picks: RecentPick[] = [];
    const ordered = [...bought].sort((a, b) =>
      (b.boughtAt ?? b.createdAt).localeCompare(a.boughtAt ?? a.createdAt),
    );
    for (const item of ordered) {
      const key = item.name.trim().toLowerCase();
      if (!key || seen.has(key) || onList.has(key)) continue;
      seen.add(key);
      picks.push({ name: item.name.trim(), category: item.category, unit: item.unit });
      if (picks.length >= RECENT_LIMIT) break;
    }
    return picks;
  }, [bought, needed]);

  const trimmedName = name.trim();
  const form = (
    <FloatedCard>
      <ItemSheetForm
        title={t("addItem")}
        onClose={close}
        name={name}
        onChangeName={(value) => {
          setName(value);
          setError(null);
        }}
        autoFocusName={presentation === "sheet"}
        recent={recent}
        onPickRecent={(pick) => {
          setName(pick.name);
          setCategory(pick.category);
          setUnit(pick.unit ?? "");
          setError(null);
        }}
        quantity={quantity}
        onChangeQuantity={(value) => {
          setQuantity(value);
          setQuantityError(undefined);
        }}
        quantityError={quantityError}
        unit={unit}
        onChangeUnit={setUnit}
        urgent={urgent}
        onChangeUrgent={setUrgent}
        category={category}
        onChangeCategory={setCategory}
        notes={notes}
        onChangeNotes={setNotes}
        photo={
          <ItemPhotoField
            uri={photo?.uri ?? null}
            onAdd={chooser.open}
            onView={() => setViewing(true)}
          />
        }
        error={error ?? chooser.error}
        submitLabel={t("addAmountName", { amount: amountLabel(quantity, unit), name: trimmedName })}
        disabledLabel={t("typeNameToAdd")}
        canSubmit={Boolean(trimmedName) && Boolean(listId)}
        submitting={isSubmitting}
        onSubmit={() => void onSubmit()}
      />
    </FloatedCard>
  );

  const photoLayers = (
    <>
      <PhotoSourceSheet
        visible={chooser.sourceOpen}
        canRemove={photo !== null}
        onChoose={chooser.choose}
        onRemove={chooser.remove}
        onClose={chooser.close}
      />
      <ItemPhotoViewer
        uri={viewing ? (photo?.uri ?? null) : null}
        title={trimmedName || undefined}
        onClose={() => setViewing(false)}
      />
    </>
  );

  if (presentation === "pane") {
    if (!visible) return null;
    return (
      <>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pb-10 pt-2"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {form}
        </ScrollView>
        {photoLayers}
      </>
    );
  }

  return (
    <>
      <FormSheetModal
        visible={visible}
        covered={chooser.covered}
        onClose={close}
        onShow={() => reset(initialCategory, initialName.trim())}
      >
        {form}
      </FormSheetModal>
      {photoLayers}
    </>
  );
}
