import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { FormSheetModal, useFormSheet } from "@/components/ui/FormSheetModal";
import { floatedCardStyle } from "@/constants/theme";
import { currencySymbol, parseCostInput } from "@/lib/currency";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export type CostSheetItem = {
  id: string;
  name: string;
  initialCost?: number | null;
};

type CostEntrySheetProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  currency: string;
  items: CostSheetItem[];
  confirmLabel?: string;
  skipLabel?: string;
  loading?: boolean;
  errorMessage?: string | null;
  onConfirm: (entries: { id: string; cost: number | null }[]) => void;
  onSkip: () => void;
  onClose: () => void;
};

function itemsIdentity(items: CostSheetItem[]) {
  // Ids (+ names) only — do not include initialCost, or a live refresh mid-save
  // will wipe in-progress field values.
  return items.map((item) => `${item.id}:${item.name}`).join("|");
}

export function CostEntrySheet({
  visible,
  title,
  subtitle,
  currency,
  items,
  confirmLabel,
  skipLabel,
  loading = false,
  errorMessage = null,
  onConfirm,
  onSkip,
  onClose,
}: CostEntrySheetProps) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [hideExternalError, setHideExternalError] = useState(false);
  const symbol = currencySymbol(currency);
  const sessionKey = useMemo(() => itemsIdentity(items), [items]);

  // Reset only when the sheet opens or the item set actually changes — not when
  // the parent re-renders with a new items array reference (e.g. trip undo timer).
  useEffect(() => {
    if (!visible) return;
    const next: Record<string, string> = {};
    for (const item of items) {
      next[item.id] =
        item.initialCost === null || item.initialCost === undefined
          ? ""
          : String(item.initialCost);
    }
    setValues(next);
    setError(null);
    setHideExternalError(false);
    // items read from latest render when sessionKey/visible change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sessionKey]);

  function submit() {
    const entries: { id: string; cost: number | null }[] = [];
    for (const item of items) {
      const parsed = parseCostInput(values[item.id] ?? "");
      if (Number.isNaN(parsed)) {
        setError(t("errorInvalidCost"));
        return;
      }
      entries.push({ id: item.id, cost: parsed });
    }
    setError(null);
    onConfirm(entries);
  }

  return (
    <FormSheetModal visible={visible} onClose={onClose}>
      <CostSheetBody
        title={title}
        subtitle={subtitle}
        symbol={symbol}
        items={items}
        values={values}
        error={error ?? (hideExternalError ? null : errorMessage)}
        loading={loading}
        confirmLabel={confirmLabel ?? (items.length > 1 ? t("saveCosts") : t("saveCost"))}
        skipLabel={skipLabel ?? t("skipCostsForNow")}
        onChange={(id, text) => {
          setValues((current) => ({ ...current, [id]: text }));
          setError(null);
          setHideExternalError(true);
        }}
        onConfirm={submit}
        onSkip={onSkip}
      />
    </FormSheetModal>
  );
}

function CostSheetBody({
  title,
  subtitle,
  symbol,
  items,
  values,
  error,
  loading,
  confirmLabel,
  skipLabel,
  onChange,
  onConfirm,
  onSkip,
}: {
  title: string;
  subtitle?: string;
  symbol: string;
  items: CostSheetItem[];
  values: Record<string, string>;
  error: string | null;
  loading: boolean;
  confirmLabel: string;
  skipLabel: string;
  onChange: (id: string, text: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const { scheme } = useTheme();
  const sheet = useFormSheet();
  const single = items.length === 1;

  useEffect(() => {
    if (!single) return;
    const timer = setTimeout(() => sheet?.scrollToStart(), 50);
    return () => clearTimeout(timer);
  }, [sheet, single]);

  return (
    <View
      className="w-full max-w-md overflow-hidden rounded-[28px] px-7 pb-5 pt-8"
      style={floatedCardStyle(scheme)}
    >
      <GlassFill soft />
      <View className="-mx-7 mb-6 border-b border-cove-line px-7 pb-5">
        <AppText className="text-lg font-semibold text-cove-ink">{title}</AppText>
        {subtitle ? (
          <AppText className="mt-1 text-sm text-cove-muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      <View className="gap-4">
        {items.map((item) => (
          <View key={item.id} className="gap-2">
            {!single ? (
              <AppText className="text-sm font-semibold text-cove-ink" numberOfLines={2}>
                {item.name}
              </AppText>
            ) : null}
            <AppTextField
              compact
              glass
              label={single ? `${t("itemCost")} (${symbol})` : symbol}
              value={values[item.id] ?? ""}
              onChangeText={(text) => onChange(item.id, text)}
              placeholder={t("costPlaceholder")}
              keyboardType="decimal-pad"
              onFocus={() => sheet?.scrollToEnd()}
            />
          </View>
        ))}
        <FormMessage message={error} />
      </View>

      <View className="mt-8 gap-3">
        <AppButton compact label={confirmLabel} loading={loading} onPress={onConfirm} />
        <AppButton
          compact
          label={skipLabel}
          variant="ghost"
          disabled={loading}
          onPress={onSkip}
        />
      </View>
    </View>
  );
}
