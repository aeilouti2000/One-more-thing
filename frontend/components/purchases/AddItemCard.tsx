import { useState } from "react";
import { View } from "react-native";
import { CategoryField } from "@/components/purchases/CategoryField";
import { UrgentToggle } from "@/components/purchases/UrgentToggle";
import { AppButton } from "@/components/ui/AppButton";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { FormSheetModal, useFormSheet } from "@/components/ui/FormSheetModal";
import { usePurchases } from "@/hooks/usePurchases";
import { parseQuantity } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";
import type { PurchaseCategory } from "@/types/purchase";

type AddItemCardProps = {
  visible: boolean;
  listId: string | null;
  initialCategory?: PurchaseCategory;
  onClose: () => void;
};

export function AddItemCard({
  visible,
  listId,
  initialCategory = "vegetables",
  onClose,
}: AddItemCardProps) {
  const { addItem } = usePurchases();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<PurchaseCategory>(initialCategory);
  const [urgent, setUrgent] = useState(false);
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function reset(nextCategory: PurchaseCategory) {
    setName("");
    setQuantity("1");
    setNotes("");
    setCategory(nextCategory);
    setUrgent(false);
    setQuantityError(undefined);
    setError(null);
  }

  function close() {
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
      urgent,
      listId,
    });
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    reset(initialCategory);
    onClose();
  }

  return (
    <FormSheetModal
      visible={visible}
      onClose={close}
      onShow={() => reset(initialCategory)}
    >
      <AddItemForm
        name={name}
        quantity={quantity}
        notes={notes}
        category={category}
        urgent={urgent}
        quantityError={quantityError}
        error={error}
        isSubmitting={isSubmitting}
        listId={listId}
        onChangeName={setName}
        onChangeQuantity={(value) => {
          setQuantity(value);
          setQuantityError(undefined);
        }}
        onChangeNotes={setNotes}
        onChangeCategory={setCategory}
        onChangeUrgent={setUrgent}
        onSubmit={() => void onSubmit()}
        onCancel={close}
      />
    </FormSheetModal>
  );
}

function AddItemForm({
  name,
  quantity,
  notes,
  category,
  urgent,
  quantityError,
  error,
  isSubmitting,
  listId,
  onChangeName,
  onChangeQuantity,
  onChangeNotes,
  onChangeCategory,
  onChangeUrgent,
  onSubmit,
  onCancel,
}: {
  name: string;
  quantity: string;
  notes: string;
  category: PurchaseCategory;
  urgent: boolean;
  quantityError?: string;
  error: string | null;
  isSubmitting: boolean;
  listId: string | null;
  onChangeName: (value: string) => void;
  onChangeQuantity: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onChangeCategory: (value: PurchaseCategory) => void;
  onChangeUrgent: (value: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const formSheet = useFormSheet();

  return (
    <View className="w-full max-w-md overflow-hidden rounded-[28px] border border-cove-line px-7 pb-5 pt-8">
      <GlassFill soft />
      <View className="-mx-7 mb-6 border-b border-cove-line px-7 pb-5">
        <AppText className="text-lg font-semibold text-cove-ink">{t("addItem")}</AppText>
      </View>
      <View className="gap-4">
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
        <UrgentToggle compact value={urgent} onValueChange={onChangeUrgent} />
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
        <FormMessage message={error} />
      </View>
      <View className="mt-8 gap-3">
        <AppButton
          compact
          label={t("saveItem")}
          disabled={!name.trim() || !listId}
          loading={isSubmitting}
          onPress={onSubmit}
        />
        <AppButton compact label={t("cancel")} variant="ghost" disabled={isSubmitting} onPress={onCancel} />
      </View>
    </View>
  );
}
