import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { CategoryChip } from "@/components/purchases/CategoryChip";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PURCHASE_CATEGORIES, getCategoryLabel } from "@/constants/categories";
import { usePurchases } from "@/hooks/usePurchases";
import { parseQuantity } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";
import type { PurchaseCategory } from "@/types/purchase";

export default function NewItemScreen() {
  const { addItem } = usePurchases();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<PurchaseCategory>("vegetables");
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setQuantityError(undefined);
    setIsSubmitting(true);
    setError(null);
    const result = await addItem({
      name,
      quantity: parsedQuantity,
      category,
      notes,
    });
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.back();
  }

  return (
    <Screen>
      <ScreenHeader
        title={t("addItem")}
        subtitle={t("addItemSubtitle")}
        showBack
      />

      <View className="gap-6">
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
          <View className="flex-row flex-wrap gap-2">
            {PURCHASE_CATEGORIES.map((item) => (
              <CategoryChip
                key={item.id}
                label={getCategoryLabel(item.id)}
                selected={category === item.id}
                onPress={() => setCategory(item.id)}
              />
            ))}
          </View>
        </View>

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
          disabled={!name.trim()}
          loading={isSubmitting}
          onPress={() => void onSubmit()}
        />
      </View>
    </Screen>
  );
}
