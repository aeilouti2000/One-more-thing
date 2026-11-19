import { useState } from "react";
import { View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormMessage } from "@/components/ui/FormMessage";
import { SheetField } from "@/components/ui/SheetField";
import { createSet, SET_ITEM_LIMIT, SET_NAME_MAX } from "@/features/items/api/sets";
import { useUnitLabel } from "@/features/items/components/item-sheet-form";
import type { Purchase } from "@/features/items/types/purchase";
import { useI18n } from "@/providers/LanguageProvider";

/** How many of the selected items the sheet lists before "+N". */
const PREVIEW_ROWS = 6;

type SaveSetSheetProps = {
  visible: boolean;
  homeId: string | null;
  /** The selected items the set is made from. */
  items: Purchase[];
  onClose: () => void;
  onSaved: (name: string) => void;
};

/** Names a new set made from the items selected on the list. */
export function SaveSetSheet({ visible, homeId, items, onClose, onSaved }: SaveSetSheetProps) {
  const { t } = useI18n();
  const unitLabel = useUnitLabel();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setName("");
      setError(null);
    }
  }

  const tooMany = items.length > SET_ITEM_LIMIT;
  const canSave = Boolean(name.trim()) && !busy && !tooMany && items.length > 0;
  const shown = items.slice(0, PREVIEW_ROWS);
  const more = items.length - shown.length;

  async function save() {
    if (!homeId || !canSave) return;
    setBusy(true);
    setError(null);
    const result = await createSet(
      homeId,
      name,
      items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
      })),
    );
    setBusy(false);
    if (result.error || !result.set) {
      setError(result.error ?? t("errorGeneric"));
      return;
    }
    onSaved(result.set.name);
  }

  return (
    <BottomSheet visible={visible} locked={busy} onClose={onClose}>
      <View className="gap-3">
        <AppText className="text-xl font-semibold text-cove-ink">{t("setNew")}</AppText>
        <SheetField
          value={name}
          onChangeText={setName}
          placeholder={t("setNamePlaceholder")}
          icon="albums-outline"
          maxLength={SET_NAME_MAX}
          autoFocus
          editable={!busy}
          onSubmitEditing={() => void save()}
        />
        <View className="rounded-2xl bg-cove-mist px-4 py-1">
          {shown.map((item, index) => (
            <View
              key={item.id}
              className="flex-row items-center justify-between gap-3 py-2.5"
              style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: "rgba(127,127,127,0.14)" }}
            >
              <AppText numberOfLines={1} className="min-w-0 flex-1 text-base text-cove-ink">
                {item.name}
              </AppText>
              <AppText className="text-sm font-semibold text-cove-muted">
                {item.unit ? `${item.quantity} ${unitLabel(item.unit)}` : String(item.quantity)}
              </AppText>
            </View>
          ))}
          {more > 0 ? (
            <AppText className="pb-2.5 text-sm text-cove-muted">{t("setMore", { count: more })}</AppText>
          ) : null}
        </View>
        <FormMessage message={tooMany ? t("setTooMany", { count: SET_ITEM_LIMIT }) : error} />
        <AppButton
          label={t("setSave")}
          onPress={() => void save()}
          loading={busy}
          disabled={!canSave}
        />
      </View>
    </BottomSheet>
  );
}
