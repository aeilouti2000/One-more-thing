import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, View } from "react-native";
import { CategoryChip } from "@/components/purchases/CategoryChip";
import { StatusBadge } from "@/components/purchases/StatusBadge";
import { AppText } from "@/components/ui/AppText";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PURCHASE_CATEGORIES, getCategoryLabel } from "@/constants/categories";
import { iconSize } from "@/constants/theme";
import { usePurchases } from "@/hooks/usePurchases";
import { parseQuantity } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { PurchaseCategory } from "@/types/purchase";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById, isLoading, markBought, updateItem } = usePurchases();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editQuantity, setEditQuantity] = useState("1");
  const [editCategory, setEditCategory] =
    useState<PurchaseCategory>("vegetables");
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const purchase = getById(id ?? "");

  if (isLoading && !purchase) {
    return <LoadingScreen />;
  }

  if (!purchase) {
    return (
      <Screen>
        <ScreenHeader title={t("item")} showBack />
        <AppText className="text-base text-cove-muted">
          {t("itemMissing")}
        </AppText>
      </Screen>
    );
  }

  const item = purchase;
  const quantityLabel = item.unit
    ? `${item.quantity} ${item.unit}`
    : `${item.quantity}`;

  async function onMarkBought() {
    setIsSaving(true);
    setError(null);
    const result = await markBought(item.id);
    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.back();
  }

  async function onSaveChanges() {
    const quantity = parseQuantity(editQuantity);

    if (!editTitle.trim()) {
      setError(t("errorEnterItemName"));
      return;
    }

    if (quantity === null) {
      setQuantityError(t("errorQuantityMin"));
      return;
    }

    setIsSaving(true);
    setError(null);
    setQuantityError(undefined);
    const result = await updateItem(item.id, {
      name: editTitle,
      quantity,
      category: editCategory,
    });
    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setIsEditing(false);
  }

  function cancelEditing() {
    setEditTitle(item.name);
    setEditQuantity(String(item.quantity));
    setEditCategory(item.category);
    setQuantityError(undefined);
    setError(null);
    setIsEditing(false);
  }

  return (
    <Screen>
      <ScreenHeader
        title={isEditing ? t("editItem") : item.name}
        showBack
        right={
          !isEditing ? (
            <Pressable
              onPress={() => {
                setEditTitle(item.name);
                setEditQuantity(String(item.quantity));
                setEditCategory(item.category);
                setError(null);
                setIsEditing(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("editItemLabel")}
              className="h-11 w-11 items-center justify-center rounded-full bg-white active:opacity-80"
            >
              <Ionicons
                name="pencil-outline"
                size={iconSize.sm}
                color={colors.accent}
              />
            </Pressable>
          ) : null
        }
      />

      <View className="gap-4">
        <View className="flex-row items-center justify-between rounded-3xl bg-cove-paper px-5 py-4">
          <AppText className="text-base text-cove-muted">{t("status")}</AppText>
          <StatusBadge status={item.status} />
        </View>

        {isEditing ? (
          <View className="gap-5 rounded-3xl bg-cove-paper px-5 py-5">
            <AppTextField
              label={t("itemTitle")}
              value={editTitle}
              onChangeText={setEditTitle}
              userText
            />
            <AppTextField
              label={t("quantity")}
              value={editQuantity}
              onChangeText={(value) => {
                setEditQuantity(value);
                setQuantityError(undefined);
              }}
              keyboardType="decimal-pad"
              error={quantityError}
            />
            <View>
              <SectionHeader title={t("category")} />
              <View key={locale} className="flex-row flex-wrap gap-2">
                {PURCHASE_CATEGORIES.map((category) => (
                  <CategoryChip
                    key={`${category.id}-${locale}`}
                    category={category.id}
                    selected={editCategory === category.id}
                    onPress={() => setEditCategory(category.id)}
                  />
                ))}
              </View>
            </View>
            <FormMessage message={error} />
            <View className="gap-2">
              <AppButton
                label={t("saveChanges")}
                disabled={!editTitle.trim()}
                loading={isSaving}
                onPress={() => void onSaveChanges()}
              />
              <AppButton
                label={t("cancel")}
                variant="ghost"
                disabled={isSaving}
                onPress={cancelEditing}
              />
            </View>
          </View>
        ) : (
          <>
            <View className="gap-4 rounded-3xl bg-cove-paper px-5 py-5">
              <DetailRow label={t("quantity")} value={quantityLabel} />
              <DetailRow
                label={t("category")}
                value={getCategoryLabel(item.category, locale)}
              />
              <DetailRow label={t("addedBy")} value={item.addedByName} />
              {item.boughtByName ? (
                <DetailRow label={t("boughtBy")} value={item.boughtByName} />
              ) : null}
              {item.notes ? (
                <DetailRow label={t("notes")} value={item.notes} />
              ) : null}
            </View>

            <FormMessage message={error} />

            {item.status === "needed" ? (
              <AppButton
                label={t("markBought")}
                loading={isSaving}
                onPress={() => void onMarkBought()}
              />
            ) : (
              <AppButton
                label={t("backToHistory")}
                variant="secondary"
                onPress={() => router.back()}
              />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText className="text-sm text-cove-muted">{label}</AppText>
      <AppText className="mt-1 text-base font-medium text-cove-ink">{value}</AppText>
    </View>
  );
}
