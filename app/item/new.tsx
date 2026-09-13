import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { CategoryChip } from "@/components/purchases/CategoryChip";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PURCHASE_CATEGORIES } from "@/constants/categories";
import type { PurchaseCategory } from "@/types/purchase";

export default function NewItemScreen() {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<PurchaseCategory>("groceries");

  return (
    <Screen>
      <ScreenHeader
        title="Add item"
        subtitle="It will show up on the shared list."
        showBack
      />

      <View className="gap-6">
        <AppTextField
          label="What do you need?"
          value={name}
          onChangeText={setName}
          placeholder="Olive oil"
        />
        <AppTextField
          label="Quantity"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="1"
        />

        <View>
          <SectionHeader title="Category" />
          <View className="flex-row flex-wrap gap-2">
            {PURCHASE_CATEGORIES.map((item) => (
              <CategoryChip
                key={item.id}
                label={item.label}
                selected={category === item.id}
                onPress={() => setCategory(item.id)}
              />
            ))}
          </View>
        </View>

        <AppTextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Brand, size, or store"
          multiline
        />

        <AppButton
          label="Save item"
          disabled={!name.trim()}
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}
