import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { CategoryChip } from "@/components/purchases/CategoryChip";
import { UrgentToggle } from "@/components/purchases/UrgentToggle";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PURCHASE_CATEGORIES } from "@/constants/categories";
import { usePurchases } from "@/hooks/usePurchases";
import { parseQuantity } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
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
  const { t, locale } = useI18n();
  const { colors } = useTheme();
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
        <Pressable
          onPress={close}
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        />
        <ScrollView
          className="w-full max-w-md"
          style={{ maxHeight: "82%", backgroundColor: colors.paper, borderRadius: 28 }}
          contentContainerClassName="gap-5 p-5"
          keyboardShouldPersistTaps="handled"
        >
          <AppText className="text-xl font-semibold text-cove-ink">{t("addItem")}</AppText>
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
            placeholder="1"
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
          <UrgentToggle value={urgent} onValueChange={setUrgent} />
          <AppTextField
            label={t("notes")}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("notesPlaceholder")}
            multiline
            userText
          />
          <FormMessage message={error} />
          <AppButton
            label={t("saveItem")}
            disabled={!name.trim() || !listId}
            loading={isSubmitting}
            onPress={() => void onSubmit()}
          />
          <AppButton label={t("cancel")} variant="ghost" disabled={isSubmitting} onPress={close} />
        </ScrollView>
      </View>
    </Modal>
  );
}
