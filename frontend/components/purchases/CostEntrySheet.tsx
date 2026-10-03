import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { FormSheetModal, useFormSheet } from "@/components/ui/FormSheetModal";
import { appFont, scaleFontSize, singleLineInput } from "@/constants/font";
import { floatedCardStyle, iconSize, withAlpha } from "@/constants/theme";
import { currencySymbol, parseCostInput } from "@/lib/currency";
import { useFontScale } from "@/providers/FontScaleProvider";
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

function CostField({
  symbol,
  value,
  onChangeText,
  placeholder,
  onFocus,
  large = false,
}: {
  symbol: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onFocus?: () => void;
  large?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const { scale } = useFontScale();
  const inputSize = scaleFontSize(large ? 22 : 16, scale);

  return (
    <View
      className={`flex-row items-center rounded-2xl border ${large ? "h-14 px-3.5" : "h-11 px-3"}`}
      style={[
        {
          flexDirection: isRTL ? "row-reverse" : "row",
          backgroundColor:
            scheme === "dark"
              ? withAlpha(colors.ice, 0.78)
              : withAlpha(colors.white, 0.94),
          borderColor:
            scheme === "dark"
              ? withAlpha(colors.accent, 0.3)
              : withAlpha(colors.accent, 0.22),
        },
      ]}
    >
      <View
        className={`items-center justify-center rounded-xl ${large ? "h-9 min-w-11 px-2.5" : "h-7 min-w-9 px-2"}`}
        style={{ backgroundColor: withAlpha(colors.accent, scheme === "dark" ? 0.18 : 0.12) }}
      >
        <AppText
          className={`font-semibold ${large ? "text-sm" : "text-xs"}`}
          style={{ color: colors.accent }}
        >
          {symbol}
        </AppText>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={withAlpha(colors.muted, 0.55)}
        keyboardType="decimal-pad"
        onFocus={onFocus}
        textAlign={isRTL ? "right" : "left"}
        textAlignVertical="center"
        allowFontScaling={false}
        style={[
          singleLineInput,
          {
            flex: 1,
            marginStart: 10,
            fontFamily: large ? appFont.semibold : appFont.medium,
            fontSize: inputSize,
            color: colors.ink,
          },
        ]}
      />
    </View>
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
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const sheet = useFormSheet();
  const single = items.length === 1;
  const accentSoft = withAlpha(colors.accent, scheme === "dark" ? 0.16 : 0.12);

  useEffect(() => {
    if (!single) return;
    const timer = setTimeout(() => sheet?.scrollToStart(), 50);
    return () => clearTimeout(timer);
  }, [sheet, single]);

  return (
    <View
      className="w-full max-w-sm overflow-hidden rounded-3xl p-5"
      style={[
        floatedCardStyle(scheme, colors),
        {
          borderColor: withAlpha(colors.accent, scheme === "dark" ? 0.26 : 0.18),
          shadowColor: colors.deep,
          shadowOpacity: scheme === "dark" ? 0.35 : 0.1,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
          elevation: 10,
        },
      ]}
    >
      <GlassFill soft />

      <View
        className="mb-5 items-center gap-3"
        style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: accentSoft }}
        >
          <Ionicons name="cash-outline" size={iconSize.sm} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <AppText
            className="text-lg font-semibold text-cove-ink"
            style={{ textAlign: isRTL ? "right" : "left" }}
          >
            {title}
          </AppText>
          {subtitle || (single && items[0]?.name) ? (
            <AppText
              className="text-xs leading-4 text-cove-muted"
              numberOfLines={2}
              style={{ textAlign: isRTL ? "right" : "left" }}
            >
              {subtitle ?? items[0]?.name}
            </AppText>
          ) : null}
        </View>
      </View>

      <View className="gap-3">
        {single ? (
          <View className="gap-2">
            <AppText
              className="text-xs font-medium"
              style={{
                color: colors.muted,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t("itemCost")}
            </AppText>
            <CostField
              large
              symbol={symbol}
              value={values[items[0].id] ?? ""}
              onChangeText={(text) => onChange(items[0].id, text)}
              placeholder={t("costPlaceholder")}
              onFocus={() => sheet?.scrollToEnd()}
            />
          </View>
        ) : (
          items.map((item) => (
            <View
              key={item.id}
              className="gap-2 rounded-2xl px-3 py-3"
              style={{
                backgroundColor: withAlpha(colors.mist, scheme === "dark" ? 0.55 : 0.7),
                borderWidth: 1,
                borderColor: withAlpha(colors.line, scheme === "dark" ? 0.45 : 0.55),
              }}
            >
              <AppText
                className="text-sm font-medium text-cove-ink"
                numberOfLines={2}
                style={{ textAlign: isRTL ? "right" : "left" }}
              >
                {item.name}
              </AppText>
              <CostField
                symbol={symbol}
                value={values[item.id] ?? ""}
                onChangeText={(text) => onChange(item.id, text)}
                placeholder={t("costPlaceholder")}
                onFocus={() => sheet?.scrollToEnd()}
              />
            </View>
          ))
        )}
        <FormMessage message={error} />
      </View>

      <View className="mt-5 gap-2">
        <Pressable
          disabled={loading}
          onPress={onConfirm}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: loading, busy: loading }}
          className={`items-center rounded-2xl px-4 py-3 ${
            loading ? "opacity-50" : "active:opacity-80"
          }`}
          style={{ backgroundColor: colors.accent }}
        >
          {loading ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <AppText
              className="text-sm font-semibold"
              style={{ color: colors.onAccent }}
            >
              {confirmLabel}
            </AppText>
          )}
        </Pressable>
        <Pressable
          disabled={loading}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel={skipLabel}
          accessibilityState={{ disabled: loading }}
          className={`items-center rounded-2xl px-3 py-2.5 ${
            loading ? "opacity-45" : "active:opacity-80"
          }`}
          style={{
            backgroundColor: withAlpha(colors.mist, scheme === "dark" ? 0.7 : 0.9),
          }}
        >
          <AppText className="text-xs font-semibold text-cove-ink">
            {skipLabel}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
