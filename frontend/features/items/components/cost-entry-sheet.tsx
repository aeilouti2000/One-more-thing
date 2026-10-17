import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { FormSheetModal, useFormSheet } from "@/components/ui/FormSheetModal";
import { appFont, scaleFontSize, singleLineInput } from "@/constants/font";
import { floatedCardStyle, iconSize, withAlpha } from "@/constants/theme";
import {
  currencySymbol,
  formatCostInput,
  formatMoney,
  parseCostInput,
} from "@/features/items/utils/currency";
import type { ReceiptScan } from "@/features/items/utils/scan-receipt";
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
  scanning?: boolean;
  covered?: boolean;
  onScan?: () => void;
  receipt?: ReceiptScan | null;
  onConfirm: (entries: { id: string; cost: number | null }[]) => void;
  onSkip: () => void;
  onClose: () => void;
};

function itemsIdentity(items: CostSheetItem[]) {
  // Ids (+ names) only — do not include initialCost, or a live refresh mid-save
  // will wipe in-progress field values.
  return items.map((item) => `${item.id}:${item.name}`).join("|");
}

function costValues(items: CostSheetItem[]) {
  const next: Record<string, string> = {};
  for (const item of items) {
    next[item.id] =
      item.initialCost === null || item.initialCost === undefined
        ? ""
        : String(item.initialCost);
  }
  return next;
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
  scanning = false,
  covered = false,
  onScan,
  receipt = null,
  onConfirm,
  onSkip,
  onClose,
}: CostEntrySheetProps) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [hideExternalError, setHideExternalError] = useState(false);
  const [seenError, setSeenError] = useState<string | null>(null);
  const [appliedScanId, setAppliedScanId] = useState(0);
  const [lineByItem, setLineByItem] = useState<Record<string, string>>({});
  const [pendingLineId, setPendingLineId] = useState<string | null>(null);
  const symbol = currencySymbol(currency);
  const sessionKey = useMemo(() => itemsIdentity(items), [items]);
  const [seenSession, setSeenSession] = useState({
    visible: false,
    sessionKey: "",
  });

  // Reset only when the sheet opens or the item set actually changes — not when
  // the parent re-renders with a new items array reference (e.g. trip undo timer).
  const sessionReset =
    visible && (!seenSession.visible || seenSession.sessionKey !== sessionKey);
  let draftValues = values;
  if (sessionReset) {
    setSeenSession({ visible, sessionKey });
    draftValues = costValues(items);
    setValues(draftValues);
    setError(null);
    setHideExternalError(false);
    setAppliedScanId(0);
    setLineByItem({});
    setPendingLineId(null);
  } else if (!visible && seenSession.visible) {
    setSeenSession({ visible, sessionKey });
  }

  if ((errorMessage ?? null) !== seenError) {
    setSeenError(errorMessage ?? null);
    if (errorMessage) setHideExternalError(false);
  }

  const scanAlreadyApplied = sessionReset ? false : receipt?.scanId === appliedScanId;
  if (receipt && !scanAlreadyApplied) {
    const next = { ...draftValues };
    const linked: Record<string, string> = {};
    for (const match of receipt.matches) {
      const line = receipt.lines.find((entry) => entry.id === match.lineId);
      if (!line) continue;
      if (!items.some((item) => item.id === match.itemId)) continue;
      next[match.itemId] = formatCostInput(line.amount, currency);
      linked[match.itemId] = match.lineId;
    }
    setAppliedScanId(receipt.scanId);
    setLineByItem(linked);
    setPendingLineId(null);
    setValues(next);
    setError(null);
  }

  function assignLine(itemId: string, lineId: string) {
    const line = receipt?.lines.find((entry) => entry.id === lineId);
    if (!line) return;
    setLineByItem((current) => {
      const next: Record<string, string> = {};
      for (const [id, existing] of Object.entries(current)) {
        if (existing !== lineId && id !== itemId) next[id] = existing;
      }
      next[itemId] = lineId;
      return next;
    });
    setValues((current) => {
      const next = { ...current, [itemId]: formatCostInput(line.amount, currency) };
      for (const [id, existing] of Object.entries(lineByItem)) {
        if (existing === lineId && id !== itemId) next[id] = "";
      }
      return next;
    });
    setPendingLineId(null);
    setError(null);
    setHideExternalError(true);
  }

  function clearLine(itemId: string) {
    setLineByItem((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setValues((current) => ({ ...current, [itemId]: "" }));
    setError(null);
  }

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
    <FormSheetModal visible={visible} covered={covered || scanning} onClose={onClose}>
      <CostSheetBody
        title={title}
        subtitle={subtitle}
        symbol={symbol}
        items={items}
        values={values}
        error={error ?? (hideExternalError ? null : errorMessage)}
        loading={loading}
        scanning={scanning}
        onScan={onScan}
        receipt={receipt}
        lineByItem={lineByItem}
        pendingLineId={pendingLineId}
        currency={currency}
        confirmLabel={
          confirmLabel ?? (items.length > 1 ? t("saveCosts") : t("saveCost"))
        }
        skipLabel={skipLabel ?? t("skipCostsForNow")}
        onChange={(id, text) => {
          setValues((current) => ({ ...current, [id]: text }));
          setLineByItem((current) => {
            if (!current[id]) return current;
            const next = { ...current };
            delete next[id];
            return next;
          });
          setError(null);
          setHideExternalError(true);
        }}
        onAssign={assignLine}
        onClearLine={clearLine}
        onPickLine={setPendingLineId}
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
            scheme === "dark" ? withAlpha(colors.white, 0.06) : "#F4F5F7",
          borderColor:
            scheme === "dark"
              ? withAlpha(colors.white, 0.12)
              : withAlpha("#12141A", 0.1),
        },
      ]}
    >
      <View
        className={`items-center justify-center rounded-xl ${large ? "h-9 min-w-11 px-2.5" : "h-7 min-w-9 px-2"}`}
        style={{
          backgroundColor: withAlpha(
            colors.accent,
            scheme === "dark" ? 0.18 : 0.12,
          ),
        }}
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

function MatchedCaption({
  linked,
  name,
  onClear,
}: {
  linked: boolean;
  name?: string;
  onClear: () => void;
}) {
  const { t, isRTL } = useI18n();
  const { colors } = useTheme();
  if (!linked) return null;
  return (
    <View
      className="items-center justify-between gap-2"
      style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
    >
      <AppText
        className="min-w-0 flex-1 text-xs text-cove-muted"
        numberOfLines={1}
        style={{ textAlign: isRTL ? "right" : "left" }}
      >
        {name ? `${t("receiptMatched")}: ${name}` : t("receiptMatched")}
      </AppText>
      <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={t("receiptClear")}>
        <AppText className="text-xs font-semibold" style={{ color: colors.accent }}>
          {t("receiptClear")}
        </AppText>
      </Pressable>
    </View>
  );
}

function ReceiptSummary({
  receipt,
  values,
  items,
  currency,
  unused,
  pendingLineId,
  onPickLine,
}: {
  receipt: ReceiptScan;
  values: Record<string, string>;
  items: CostSheetItem[];
  currency: string;
  unused: ReceiptScan["lines"];
  pendingLineId: string | null;
  onPickLine: (lineId: string | null) => void;
}) {
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  let placed = 0;
  for (const item of items) {
    const parsed = parseCostInput(values[item.id] ?? "");
    if (typeof parsed === "number" && !Number.isNaN(parsed)) placed += parsed;
  }
  const pending = unused.find((line) => line.id === pendingLineId) ?? null;

  return (
    <View className="mb-4 gap-2">
      {receipt.total !== null ? (
        <AppText className="text-xs font-semibold text-cove-ink" style={{ textAlign: isRTL ? "right" : "left" }}>
          {t("receiptTotalLabel", { total: formatMoney(receipt.total, currency) })}
        </AppText>
      ) : null}
      <AppText className="text-xs text-cove-muted" style={{ textAlign: isRTL ? "right" : "left" }}>
        {t("receiptAssignedSum", { amount: formatMoney(placed, currency) })}
      </AppText>
      {pending ? (
        <AppText className="text-xs font-medium" style={{ color: colors.accent, textAlign: isRTL ? "right" : "left" }}>
          {t("receiptTapItem", { amount: formatMoney(pending.amount, currency) })}
        </AppText>
      ) : null}
      {unused.length > 0 ? (
        <View className="gap-2">
          <AppText className="text-xs font-medium text-cove-muted" style={{ textAlign: isRTL ? "right" : "left" }}>
            {t("receiptLinesTitle")}
          </AppText>
          <View className="flex-row flex-wrap gap-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
            {unused.map((line) => {
              const selected = line.id === pendingLineId;
              return (
                <Pressable
                  key={line.id}
                  onPress={() => onPickLine(selected ? null : line.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="max-w-full rounded-xl px-2.5 py-1.5 active:opacity-80"
                  style={{
                    backgroundColor: selected
                      ? withAlpha(colors.accent, scheme === "dark" ? 0.28 : 0.16)
                      : scheme === "dark"
                        ? withAlpha(colors.white, 0.06)
                        : "#F4F5F7",
                  }}
                >
                  <AppText className="text-xs font-medium text-cove-ink" numberOfLines={1}>
                    {line.name ? `${line.name} · ` : ""}
                    {formatMoney(line.amount, currency)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
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
  scanning,
  onScan,
  receipt,
  lineByItem,
  pendingLineId,
  currency,
  confirmLabel,
  skipLabel,
  onChange,
  onAssign,
  onClearLine,
  onPickLine,
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
  scanning: boolean;
  onScan?: () => void;
  receipt: ReceiptScan | null;
  lineByItem: Record<string, string>;
  pendingLineId: string | null;
  currency: string;
  confirmLabel: string;
  skipLabel: string;
  onChange: (id: string, text: string) => void;
  onAssign: (itemId: string, lineId: string) => void;
  onClearLine: (itemId: string) => void;
  onPickLine: (lineId: string | null) => void;
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
      style={floatedCardStyle(scheme, colors)}
    >
      <GlassFill soft neutral />

      <View
        className="mb-5 items-center gap-3"
        style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: accentSoft }}
        >
          <Ionicons
            name="cash-outline"
            size={iconSize.sm}
            color={colors.accent}
          />
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

      {onScan ? (
        <Pressable
          disabled={loading || scanning}
          onPress={onScan}
          accessibilityRole="button"
          accessibilityLabel={t("scanReceipt")}
          accessibilityState={{ disabled: loading || scanning, busy: scanning }}
          className={`mb-4 items-center justify-center gap-2 rounded-2xl border px-3 py-3 ${
            loading || scanning ? "opacity-50" : "active:opacity-80"
          }`}
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            borderColor:
              scheme === "dark"
                ? withAlpha(colors.white, 0.14)
                : withAlpha("#12141A", 0.1),
            backgroundColor:
              scheme === "dark" ? withAlpha(colors.white, 0.04) : "#F4F5F7",
          }}
        >
          {scanning ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Ionicons name="scan-outline" size={iconSize.sm} color={colors.accent} />
          )}
          <AppText className="text-sm font-semibold text-cove-ink">
            {scanning ? t("scanReceiptWorking") : t("scanReceipt")}
          </AppText>
        </Pressable>
      ) : null}

      {receipt ? (
        <ReceiptSummary
          receipt={receipt}
          values={values}
          items={items}
          currency={currency}
          unused={receipt.lines.filter(
            (line) => !Object.values(lineByItem).includes(line.id),
          )}
          pendingLineId={pendingLineId}
          onPickLine={onPickLine}
        />
      ) : null}

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
            {pendingLineId ? (
              <Pressable
                onPress={() => onAssign(items[0].id, pendingLineId)}
                accessibilityRole="button"
                className="active:opacity-80"
              >
                <AppText className="text-xs font-semibold" style={{ color: colors.accent }}>
                  {t("receiptTapItem", {
                    amount: formatMoney(
                      receipt?.lines.find((line) => line.id === pendingLineId)?.amount,
                      currency,
                    ),
                  })}
                </AppText>
              </Pressable>
            ) : null}
            <MatchedCaption
              linked={Boolean(lineByItem[items[0].id])}
              name={receipt?.lines.find((line) => line.id === lineByItem[items[0].id])?.name}
              onClear={() => onClearLine(items[0].id)}
            />
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
                backgroundColor:
                  scheme === "dark" ? withAlpha(colors.white, 0.04) : "#F4F5F7",
                borderWidth: 1,
                borderColor:
                  scheme === "dark"
                    ? withAlpha(colors.white, 0.1)
                    : withAlpha("#12141A", 0.08),
              }}
            >
              <Pressable
                disabled={!pendingLineId}
                onPress={() => {
                  if (pendingLineId) onAssign(item.id, pendingLineId);
                }}
                accessibilityRole={pendingLineId ? "button" : undefined}
              >
                <AppText
                  className="text-sm font-medium text-cove-ink"
                  numberOfLines={2}
                  style={{ textAlign: isRTL ? "right" : "left" }}
                >
                  {item.name}
                </AppText>
              </Pressable>
              <MatchedCaption
                linked={Boolean(lineByItem[item.id])}
                name={receipt?.lines.find((line) => line.id === lineByItem[item.id])?.name}
                onClear={() => onClearLine(item.id)}
              />
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
          disabled={loading || scanning}
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
          disabled={loading || scanning}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel={skipLabel}
          accessibilityState={{ disabled: loading }}
          className={`items-center rounded-2xl px-3 py-2.5 ${
            loading ? "opacity-45" : "active:opacity-80"
          }`}
          style={{
            backgroundColor: scheme === "dark" ? colors.mist : "#F4F5F7",
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
