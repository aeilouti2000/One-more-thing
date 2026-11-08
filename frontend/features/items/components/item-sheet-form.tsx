import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { getCategoryLabel } from "@/constants/categories";
import { type TranslationKey } from "@/constants/i18n";
import { withAlpha } from "@/constants/theme";
import type { PinInterval } from "@/features/items/api/pins";
import { useCategories } from "@/features/items/providers/categories-provider";
import type { PurchaseCategory } from "@/features/items/types/purchase";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Units offered as chips. Stored as these codes; "" = pieces (no unit). */
export const ITEM_UNITS = ["", "kg", "g", "L", "ml", "pack"] as const;
const UNIT_LABEL_KEYS: Record<string, TranslationKey> = {
  "": "unitPcs",
  kg: "unitKg",
  g: "unitG",
  L: "unitL",
  ml: "unitMl",
  pack: "unitPack",
};

const PIN_INTERVAL_OPTIONS: PinInterval[] = [0, 1, 7, 14, 30];
export const PIN_INTERVAL_KEYS: Record<PinInterval, TranslationKey> = {
  0: "intervalOnce",
  1: "intervalDay",
  7: "intervalWeek",
  14: "intervalTwoWeeks",
  30: "intervalMonth",
};

const FIELD_RADIUS = 21;
const BUTTON_HEIGHT = 54;

export type RecentPick = { name: string; category: PurchaseCategory; unit?: string };

/** Human label for a stored unit ("" → pcs, known codes localized, custom as-is). */
export function useUnitLabel() {
  const { t } = useI18n();
  return (unit: string | undefined | null) => {
    const value = unit ?? "";
    const key = UNIT_LABEL_KEYS[value];
    return key ? t(key) : value;
  };
}

/** "2 L" / "2" — quantity plus unit for button labels. */
export function useAmountLabel() {
  const unitLabel = useUnitLabel();
  return (quantity: string, unit: string) => {
    const amount = quantity.trim() || "1";
    return unit ? `${amount} ${unitLabel(unit)}` : amount;
  };
}

type ItemSheetFormProps = {
  title: string;
  titleIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  subtitle?: string;
  onClose?: () => void;
  onDelete?: () => void;

  name: string;
  onChangeName: (value: string) => void;
  autoFocusName?: boolean;
  /** Shown while the name is empty; tapping fills name/category/unit. */
  recent?: RecentPick[];
  onPickRecent?: (pick: RecentPick) => void;

  quantity: string;
  onChangeQuantity: (value: string) => void;
  quantityError?: string;
  unit: string;
  onChangeUnit: (value: string) => void;
  urgent: boolean;
  onChangeUrgent: (value: boolean) => void;
  category: PurchaseCategory;
  onChangeCategory: (value: PurchaseCategory) => void;
  /** Leave out (with onChangeNotes) to hide the note, e.g. for pins. */
  notes?: string;
  onChangeNotes?: (value: string) => void;

  /** Pins: repeat interval chips above quantity. */
  repeat?: { value: PinInterval; onChange: (value: PinInterval) => void };
  /** Small extra controls under the note (e.g. pin / add-now toggles). */
  extra?: ReactNode;
  /** Photo row under the note (see ItemPhotoField). */
  photo?: ReactNode;

  error?: string | null;
  submitLabel: string;
  /** Label while the button can't be used yet (e.g. "Type a name to add"). */
  disabledLabel?: string;
  canSubmit: boolean;
  submitting?: boolean;
  onSubmit: () => void;
  /** Second action beside the main button (e.g. "Bought"). */
  secondary?: ReactNode;
};

/**
 * Focus-first item sheet body shared by Add item, Add/Edit pin and Edit item:
 * big name, one row for quantity + unit + urgent, category chips, note on
 * demand, and one button that names the action.
 */
export function ItemSheetForm(props: ItemSheetFormProps) {
  const {
    title,
    titleIcon,
    subtitle,
    onClose,
    onDelete,
    name,
    onChangeName,
    autoFocusName = false,
    recent,
    onPickRecent,
    quantity,
    onChangeQuantity,
    quantityError,
    unit,
    onChangeUnit,
    urgent,
    onChangeUrgent,
    category,
    onChangeCategory,
    notes = "",
    onChangeNotes,
    repeat,
    extra,
    photo,
    error,
    submitLabel,
    disabledLabel,
    canSubmit,
    submitting = false,
    onSubmit,
    secondary,
  } = props;
  const { t, isRTL, locale } = useI18n();
  const { colors, scheme } = useTheme();
  const { categories } = useCategories();
  const unitLabel = useUnitLabel();
  const dark = scheme === "dark";
  const [nameFocused, setNameFocused] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [customUnitOpen, setCustomUnitOpen] = useState(
    () => unit !== "" && !(ITEM_UNITS as readonly string[]).includes(unit),
  );
  const [noteOpen, setNoteOpen] = useState(false);
  const showNote = noteOpen || notes.trim().length > 0;
  const textAlign = isRTL ? "right" : "left";
  const chipBg = dark ? withAlpha(colors.white, 0.07) : withAlpha("#12141A", 0.05);
  const subtle = dark ? withAlpha(colors.white, 0.14) : withAlpha("#12141A", 0.14);

  function step(delta: number) {
    const current = Number(quantity.replace(",", "."));
    const base = Number.isFinite(current) && current > 0 ? current : 1;
    const next = Math.max(1, Math.round((base + delta) * 100) / 100);
    void Haptics.selectionAsync();
    onChangeQuantity(String(next));
  }

  function pickUnit(next: string) {
    void Haptics.selectionAsync();
    setCustomUnitOpen(false);
    onChangeUnit(next);
    setUnitOpen(false);
  }

  const showRecent = !name.trim() && (recent?.length ?? 0) > 0 && Boolean(onPickRecent);
  const buttonReady = canSubmit && !submitting;

  return (
    <View>
      {/* Header */}
      <View className="mb-4 flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            {titleIcon ? (
              <MaterialCommunityIcons name={titleIcon} size={20} color={colors.accent} />
            ) : null}
            <AppText className="text-lg font-semibold text-cove-ink" numberOfLines={1}>
              {title}
            </AppText>
          </View>
          {subtitle ? (
            <AppText className="mt-0.5 text-xs text-cove-muted" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {onDelete ? (
          <HeaderIcon
            icon="trash-outline"
            label={t("delete")}
            color="#F07178"
            background={dark ? "rgba(240,113,120,0.14)" : "rgba(194,65,74,0.1)"}
            onPress={onDelete}
          />
        ) : null}
        {onClose ? (
          <HeaderIcon
            icon="close"
            label={t("close")}
            color={colors.muted}
            background={chipBg}
            onPress={onClose}
          />
        ) : null}
      </View>

      {/* Big name */}
      <TextInput
        value={name}
        onChangeText={onChangeName}
        placeholder={t("itemSheetNamePlaceholder")}
        placeholderTextColor={withAlpha(colors.muted, 0.7)}
        autoFocus={autoFocusName}
        onFocus={() => setNameFocused(true)}
        onBlur={() => setNameFocused(false)}
        returnKeyType="done"
        allowFontScaling={false}
        textAlign={textAlign}
        className="text-cove-ink"
        style={{
          fontSize: 22,
          fontFamily: "ReadexPro_600SemiBold",
          paddingVertical: 6,
          paddingHorizontal: 0,
          borderBottomWidth: 2,
          // Neutral underline: a little stronger while typing, never blue.
          borderBottomColor: nameFocused ? withAlpha(colors.ink, dark ? 0.32 : 0.28) : subtle,
          color: colors.ink,
        }}
      />

      {showRecent ? (
        <View className="mt-4 gap-2">
          <AppText className="text-xs font-semibold text-cove-muted">{t("recent")}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {recent!.map((pick) => (
              <Pressable
                key={pick.name.toLowerCase()}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onPickRecent?.(pick);
                }}
                accessibilityRole="button"
                accessibilityLabel={pick.name}
                className="h-8 justify-center rounded-full px-3.5 active:opacity-70"
                style={{ backgroundColor: chipBg }}
              >
                <AppText className="text-[13px] font-semibold text-cove-ink" numberOfLines={1}>
                  {pick.name}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {repeat ? (
        <View className="mt-5 gap-2">
          <AppText className="text-xs font-semibold text-cove-muted">{t("pinInterval")}</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {PIN_INTERVAL_OPTIONS.map((value) => (
              <Chip
                key={value}
                label={t(PIN_INTERVAL_KEYS[value])}
                selected={repeat.value === value}
                onPress={() => {
                  void Haptics.selectionAsync();
                  repeat.onChange(value);
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Quantity · unit · urgent */}
      <View className="mt-5 flex-row flex-wrap items-center gap-2">
        <View
          className="flex-row items-center"
          style={{ height: 42, borderRadius: FIELD_RADIUS, backgroundColor: chipBg, paddingHorizontal: 5 }}
        >
          <StepButton icon="remove" onPress={() => step(-1)} disabled={Number(quantity) <= 1} />
          <TextInput
            value={quantity}
            onChangeText={onChangeQuantity}
            keyboardType="decimal-pad"
            selectTextOnFocus
            allowFontScaling={false}
            textAlign="center"
            accessibilityLabel={t("quantity")}
            style={{
              width: 44,
              fontSize: 17,
              fontFamily: "ReadexPro_600SemiBold",
              color: colors.ink,
              paddingVertical: 0,
            }}
          />
          <StepButton icon="add" primary onPress={() => step(1)} />
        </View>

        <Pressable
          onPress={() => setUnitOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={t("unit")}
          accessibilityState={{ expanded: unitOpen }}
          className="flex-row items-center gap-1 px-3.5 active:opacity-75"
          style={{
            height: 42,
            borderRadius: FIELD_RADIUS,
            backgroundColor: unitOpen ? withAlpha(colors.accent, 0.16) : chipBg,
            borderWidth: 1,
            borderColor: unitOpen ? colors.accent : "transparent",
          }}
        >
          <AppText className="text-sm font-semibold text-cove-ink" numberOfLines={1}>
            {unitLabel(unit)}
          </AppText>
          <Ionicons name={unitOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
        </Pressable>

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onChangeUrgent(!urgent);
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: urgent }}
          accessibilityLabel={t("urgent")}
          className="flex-row items-center gap-1.5 px-3.5 active:opacity-75"
          style={{
            height: 42,
            borderRadius: FIELD_RADIUS,
            borderWidth: 1,
            borderColor: urgent ? "#E0646C" : subtle,
            backgroundColor: urgent ? (dark ? "rgba(240,113,120,0.14)" : "rgba(194,65,74,0.08)") : "transparent",
          }}
        >
          <Ionicons name="flash" size={15} color={urgent ? "#F07178" : colors.muted} />
          <AppText
            className="text-sm font-semibold"
            style={{ color: urgent ? (dark ? "#F4A3A8" : "#C2414A") : colors.muted }}
          >
            {t("urgent")}
          </AppText>
        </Pressable>
      </View>
      {quantityError ? (
        <AppText className="mt-1.5 text-xs" style={{ color: "#F07178" }}>
          {quantityError}
        </AppText>
      ) : null}

      {unitOpen ? (
        <View
          className="mt-2 rounded-2xl p-2"
          style={{ backgroundColor: dark ? withAlpha(colors.white, 0.03) : withAlpha("#12141A", 0.03), borderWidth: 1, borderColor: subtle }}
        >
          <View className="flex-row flex-wrap gap-2">
            {ITEM_UNITS.map((value) => (
              <Chip
                key={value || "pcs"}
                label={unitLabel(value)}
                selected={!customUnitOpen && unit === value}
                compact
                onPress={() => pickUnit(value)}
              />
            ))}
            <Chip
              label={t("unitOther")}
              selected={customUnitOpen}
              compact
              onPress={() => setCustomUnitOpen(true)}
            />
          </View>
          {customUnitOpen ? (
            <TextInput
              value={(ITEM_UNITS as readonly string[]).includes(unit) ? "" : unit}
              onChangeText={(value) => onChangeUnit(value.slice(0, 20))}
              placeholder={t("unitCustomPlaceholder")}
              placeholderTextColor={withAlpha(colors.muted, 0.7)}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => setUnitOpen(false)}
              textAlign={textAlign}
              allowFontScaling={false}
              className="mt-2 h-10 rounded-xl px-3 text-cove-ink"
              style={{ backgroundColor: chipBg, fontFamily: "ReadexPro_400Regular", fontSize: 14, color: colors.ink }}
            />
          ) : null}
        </View>
      ) : null}

      {/* Category */}
      <View className="mt-5 gap-2">
        <AppText className="text-xs font-semibold text-cove-muted">{t("category")}</AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-2"
        >
          {categories.map((entry) => (
            <Chip
              key={entry.id}
              label={entry.builtin ? getCategoryLabel(entry.id, locale) : (entry.name ?? entry.id)}
              selected={category === entry.id}
              onPress={() => {
                void Haptics.selectionAsync();
                onChangeCategory(entry.id);
              }}
            />
          ))}
        </ScrollView>
      </View>

      {/* Note on demand */}
      {!onChangeNotes ? null : showNote ? (
        <TextInput
          value={notes}
          onChangeText={onChangeNotes}
          placeholder={t("notesPlaceholder")}
          placeholderTextColor={withAlpha(colors.muted, 0.7)}
          autoFocus={noteOpen && !notes}
          multiline
          textAlign={textAlign}
          textAlignVertical="top"
          allowFontScaling={false}
          className="mt-5 rounded-2xl px-4 py-3 text-cove-ink"
          style={{
            minHeight: 48,
            backgroundColor: chipBg,
            fontFamily: "ReadexPro_400Regular",
            fontSize: 15,
            color: colors.ink,
          }}
        />
      ) : (
        <Pressable
          onPress={() => setNoteOpen(true)}
          accessibilityRole="button"
          className="mt-5 flex-row items-center gap-1.5 self-start py-1 active:opacity-70"
        >
          <Ionicons name="add" size={18} color={colors.accent} />
          <AppText className="text-sm font-semibold text-cove-accent">{t("addNote")}</AppText>
        </Pressable>
      )}

      {photo ? <View className="mt-3">{photo}</View> : null}

      {extra ? <View className="mt-4">{extra}</View> : null}

      <FormMessage message={error ?? null} />

      {/* Actions */}
      <View className="mt-6 flex-row items-stretch gap-3">
        <Pressable
          disabled={!buttonReady}
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel={canSubmit ? submitLabel : (disabledLabel ?? submitLabel)}
          accessibilityState={{ disabled: !buttonReady, busy: submitting }}
          className="flex-1 items-center justify-center px-4 active:opacity-85"
          style={{
            height: BUTTON_HEIGHT,
            borderRadius: 18,
            backgroundColor: canSubmit ? colors.accent : withAlpha(colors.accent, dark ? 0.28 : 0.3),
          }}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <AppText
              numberOfLines={1}
              className="text-base font-bold"
              style={{ color: canSubmit ? colors.onAccent : withAlpha(colors.onAccent, 0.75) }}
            >
              {canSubmit ? submitLabel : (disabledLabel ?? submitLabel)}
            </AppText>
          )}
        </Pressable>
        {secondary}
      </View>
    </View>
  );
}

/** Outlined companion button for the action row (e.g. "Bought"). */
export function ItemSheetSecondaryButton({
  label,
  icon,
  tone = "accent",
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: "accent" | "success";
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const color = tone === "success" ? (scheme === "dark" ? "#7FDCA0" : "#1F8A4C") : colors.accent;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center justify-center gap-1.5 px-4 ${disabled ? "opacity-50" : "active:opacity-75"}`}
      style={{ height: BUTTON_HEIGHT, borderRadius: 18, borderWidth: 1.5, borderColor: withAlpha(color, 0.6) }}
    >
      {icon ? <Ionicons name={icon} size={18} color={color} /> : null}
      <AppText className="text-sm font-semibold" style={{ color }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Compact switch row for extra options (pin this item, add to list now). */
export function ItemSheetToggle({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      className="flex-row items-center gap-3 rounded-2xl px-4 active:opacity-80"
      style={{ height: 48, backgroundColor: dark ? withAlpha(colors.white, 0.05) : withAlpha("#12141A", 0.04) }}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={colors.accent} /> : null}
      <AppText className="min-w-0 flex-1 text-sm text-cove-ink" numberOfLines={1}>
        {label}
      </AppText>
      <View
        className="justify-center rounded-full px-0.5"
        style={{ width: 44, height: 26, backgroundColor: value ? colors.accent : withAlpha(colors.muted, 0.35) }}
      >
        <View
          className="rounded-full"
          style={{ width: 22, height: 22, backgroundColor: "#FFFFFF", alignSelf: value ? "flex-end" : "flex-start" }}
        />
      </View>
    </Pressable>
  );
}

function Chip({
  label,
  selected,
  compact = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className="justify-center rounded-full active:opacity-75"
      style={{
        height: compact ? 34 : 38,
        paddingHorizontal: compact ? 13 : 15,
        backgroundColor: selected
          ? colors.accent
          : dark
            ? withAlpha(colors.white, 0.07)
            : withAlpha("#12141A", 0.05),
      }}
    >
      <AppText
        numberOfLines={1}
        className="text-[13px] font-semibold"
        style={{ color: selected ? colors.onAccent : colors.ink }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function StepButton({
  icon,
  primary = false,
  disabled = false,
  onPress,
}: {
  icon: "add" | "remove";
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={icon === "add" ? t("increaseQuantity") : t("decreaseQuantity")}
      hitSlop={6}
      className={`items-center justify-center rounded-full ${disabled ? "opacity-40" : "active:opacity-70"}`}
      style={{
        width: 32,
        height: 32,
        backgroundColor: primary
          ? colors.accent
          : scheme === "dark"
            ? withAlpha(colors.white, 0.1)
            : withAlpha("#12141A", 0.08),
      }}
    >
      <Ionicons name={icon} size={18} color={primary ? colors.onAccent : colors.ink} />
    </Pressable>
  );
}

function HeaderIcon({
  icon,
  label,
  color,
  background,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  background: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: background }}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}
