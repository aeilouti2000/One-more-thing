import { useState } from "react";
import { Modal, View } from "react-native";
import { CategoryField } from "@/components/purchases/CategoryField";
import { UrgentToggle } from "@/components/purchases/UrgentToggle";
import { AppButton } from "@/components/ui/AppButton";
import { BlurBackdrop, FrostedFill } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onShow={() => reset(initialCategory)}
      onRequestClose={close}
    >
      <View className="flex-1 items-center justify-center px-5">
        <BlurBackdrop onPress={close} />
        <View
          className="w-full max-w-md overflow-hidden rounded-[28px] border border-cove-line px-7 pb-5 pt-8"
        >
          <FrostedFill />
          <View className="-mx-7 mb-6 border-b border-cove-line px-7 pb-5">
            <AppText className="text-lg font-semibold text-cove-ink">{t("addItem")}</AppText>
          </View>
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
          <UrgentToggle compact value={urgent} onValueChange={setUrgent} />
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
          </View>
          <View className="mt-8 gap-3">
            <AppButton
              compact
              label={t("saveItem")}
              disabled={!name.trim() || !listId}
              loading={isSubmitting}
              onPress={() => void onSubmit()}
            />
            <AppButton compact label={t("cancel")} variant="ghost" disabled={isSubmitting} onPress={close} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
