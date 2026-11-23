import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormMessage } from "@/components/ui/FormMessage";
import { HomeIcon } from "@/components/ui/HomeIcon";
import { iconSuggestions } from "@/constants/icons";
import { singleLineInput } from "@/constants/font";
import { withAlpha } from "@/constants/theme";
import { resetIcon, setIconEmoji, uploadIconImage } from "@/features/icons/api";
import { isSingleEmoji } from "@/features/icons/emoji";
import { iconKey, resolveIcon } from "@/features/icons/resolve";
import type { IconTarget } from "@/features/icons/types";
import { useHomeIcons } from "@/features/icons/use-icons";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { pickItemPhoto } from "@/features/items/utils/pick-photo";
import { useOnline } from "@/features/offline/network";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const COLUMNS = 6;
const GAP = 8;
/** The sheet steps aside before the photo picker opens over it (like item photos). */
const PICKER_DELAY_MS = 320;

/**
 * Changes the icon of a category or a shop: a suggested emoji, any emoji from
 * the keyboard, an uploaded image (cropped square), or back to the default.
 * Emoji changes work offline (outbox); an upload needs a connection.
 */
export function IconSheet({
  target,
  title,
  onClose,
}: {
  /** What to change; null keeps the sheet closed. */
  target: IconTarget | null;
  /** The category's or shop's name, as shown. */
  title: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const { household } = useHousehold();
  const icons = useHomeIcons();
  const online = useOnline();
  const dark = scheme === "dark";
  const homeId = household?.id ?? null;
  const key = target ? iconKey(target) : "";
  const current = target ? resolveIcon(icons, target.kind, key) : null;
  const currentEmoji = current?.type === "emoji" && current.chosen ? current.emoji : null;
  const customised = Boolean(current && (current.type === "image" || current.chosen));
  const suggestions = target ? iconSuggestions(target.kind, target.kind === "category" ? target.key : "") : [];

  const [picked, setPicked] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"save" | "upload" | "reset" | null>(null);
  const [covered, setCovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // A new opening starts from the icon as it is now.
  const openKey = target ? `${target.kind}:${key}` : null;
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (openKey !== seenKey) {
    setSeenKey(openKey);
    setPicked(currentEmoji);
    setTyping(false);
    setTyped("");
    setError(null);
    setBusy(null);
  }

  const typedValid = isSingleEmoji(typed.trim());
  const typedShown = typedValid ? typed.trim() : null;
  const anyEmoji = picked && !suggestions.includes(picked) ? picked : null;
  const canSave = Boolean(picked) && picked !== currentEmoji && busy === null;
  const tile = gridWidth > 0 ? Math.floor((gridWidth - GAP * (COLUMNS - 1)) / COLUMNS) : 44;

  function close() {
    if (busy) return;
    onClose();
  }

  async function save() {
    if (!target || !homeId || !picked || !canSave) return;
    setBusy("save");
    setError(null);
    const result = await setIconEmoji(homeId, target, picked);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    void Haptics.selectionAsync();
    onClose();
  }

  async function reset() {
    if (!target || !homeId || busy) return;
    setBusy("reset");
    setError(null);
    const result = await resetIcon(homeId, target);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  function upload() {
    if (!target || !homeId || busy || covered) return;
    if (!online) {
      setError(t("iconUploadOffline"));
      return;
    }
    setError(null);
    setCovered(true);
    const chosen = target;
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const result = await pickItemPhoto("library", { square: true });
          setCovered(false);
          if (!result.ok) {
            if (result.denied) setError(t("itemPhotoPermission"));
            return;
          }
          setBusy("upload");
          const saved = await uploadIconImage(homeId, chosen, result.photo);
          setBusy(null);
          if (saved.error) {
            setError(saved.error);
            return;
          }
          onClose();
        } catch {
          setCovered(false);
          setBusy(null);
          setError(t("errorGeneric"));
        }
      })();
    }, PICKER_DELAY_MS);
  }

  function emojiTile(emoji: string, selected: boolean, onPress: () => void, label?: string) {
    return (
      <Pressable
        key={label ?? emoji}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label ?? emoji}
        className="items-center justify-center active:opacity-75"
        style={{
          width: tile,
          height: tile,
          borderRadius: 12,
          backgroundColor: selected ? colors.paper : dark ? colors.mist : colors.ice,
          borderWidth: 2,
          borderColor: selected ? colors.accentText : "transparent",
        }}
      >
        <Text allowFontScaling={false} style={{ fontSize: 20, lineHeight: 26, includeFontPadding: false }}>
          {emoji}
        </Text>
      </Pressable>
    );
  }

  return (
    <BottomSheet visible={target !== null} onClose={close} locked={busy !== null} covered={covered}>
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          {target ? (
            target.kind === "category" ? (
              <HomeIcon kind="category" id={target.key} size={46} />
            ) : (
              <HomeIcon kind="shop" name={target.name} size={46} />
            )
          ) : null}
          <View className="min-w-0 flex-1">
            <AppText className="text-lg font-semibold text-cove-ink" numberOfLines={1}>
              {t("iconFor", { name: title })}
            </AppText>
            <AppText className="text-xs text-cove-muted" numberOfLines={2}>
              {target?.kind === "shop" ? t("iconEveryTrip", { name: title }) : t("iconEveryone")}
            </AppText>
          </View>
        </View>

        <AppText className="mt-1 text-xs font-semibold uppercase text-cove-muted">
          {t("iconPickOne")}
        </AppText>
        <View
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
          className="flex-row flex-wrap"
          style={{ gap: GAP }}
        >
          {suggestions.map((emoji) =>
            emojiTile(emoji, picked === emoji, () => {
              setPicked(emoji);
              setTyping(false);
              void Haptics.selectionAsync();
            }),
          )}
          {anyEmoji ? (
            emojiTile(anyEmoji, true, () => setTyping(true), t("iconAny"))
          ) : (
            <Pressable
              onPress={() => setTyping((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={t("iconAny")}
              className="items-center justify-center active:opacity-75"
              style={{
                width: tile,
                height: tile,
                borderRadius: 12,
                backgroundColor: dark ? colors.mist : colors.ice,
                borderWidth: 2,
                borderColor: typing ? colors.accentText : "transparent",
              }}
            >
              <Ionicons name="happy-outline" size={16} color={colors.accentText} />
              <AppText className="text-[11px] font-semibold" style={{ color: colors.accentText }}>
                {t("iconAny")}
              </AppText>
            </Pressable>
          )}
        </View>

        {typing ? (
          <View className="gap-1">
            <TextInput
              value={typed}
              onChangeText={(text) => {
                setTyped(text);
                const value = text.trim();
                if (isSingleEmoji(value)) setPicked(value);
              }}
              autoFocus
              maxLength={16}
              placeholder={t("iconAnyPlaceholder")}
              placeholderTextColor={withAlpha(colors.muted, 0.7)}
              accessibilityLabel={t("iconAny")}
              className="h-11 rounded-2xl px-3"
              style={[
                singleLineInput,
                {
                  color: colors.ink,
                  fontSize: 18,
                  backgroundColor: dark ? colors.mist : colors.ice,
                  borderWidth: 1,
                  borderColor: typed && !typedValid ? "#F87171" : colors.line,
                },
              ]}
            />
            {typed.trim() && !typedShown ? (
              <AppText className="px-1 text-xs" style={{ color: dark ? "#FCA5A5" : "#B91C1C" }}>
                {t("iconOneEmoji")}
              </AppText>
            ) : null}
          </View>
        ) : null}

        <FormMessage message={error} />

        <Pressable
          onPress={upload}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={t("iconUpload")}
          accessibilityState={{ disabled: !online || busy !== null }}
          className="mt-1 h-[48px] flex-row items-center justify-center gap-2 rounded-2xl bg-cove-accent active:opacity-80"
          style={{ opacity: online ? 1 : 0.5 }}
        >
          {busy === "upload" ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <>
              <Ionicons name="image-outline" size={18} color={colors.onAccent} />
              <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                {t("iconUpload")}
              </AppText>
            </>
          )}
        </Pressable>
        {!online ? (
          <AppText className="-mt-1 text-center text-xs text-cove-muted">{t("iconUploadOffline")}</AppText>
        ) : null}

        <Pressable
          onPress={() => void save()}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={t("iconSave")}
          className="h-[48px] items-center justify-center rounded-2xl active:opacity-80"
          style={{ backgroundColor: dark ? colors.mist : colors.ice, opacity: canSave || busy === "save" ? 1 : 0.5 }}
        >
          {busy === "save" ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <AppText className="text-sm font-semibold text-cove-ink">{t("iconSave")}</AppText>
          )}
        </Pressable>

        {customised ? (
          <Pressable
            onPress={() => void reset()}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={t("iconReset")}
            className="h-9 items-center justify-center active:opacity-70"
          >
            {busy === "reset" ? (
              <ActivityIndicator color="#C0392B" />
            ) : (
              <AppText className="text-sm font-semibold" style={{ color: dark ? "#F4A3A8" : "#C0392B" }}>
                {t("iconReset")}
              </AppText>
            )}
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}
