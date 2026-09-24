import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { RequireSession } from "@/components/auth/RequireSession";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PURCHASE_CATEGORIES, getCategoryLabel } from "@/constants/categories";
import { iconSize } from "@/constants/theme";
import { usePurchases } from "@/hooks/usePurchases";
import { canUndoBought, formatNeededShare, shareNeededText } from "@/lib/share-list";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase } from "@/types/purchase";

export default function TripScreen() {
  return (
    <RequireSession requireHome>
      <TripBody />
    </RequireSession>
  );
}

function TripBody() {
  const { needed, bought, isLoading, error, markBought, undoBought } = usePurchases();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const recent = bought.find((item) => item.id === undoId && canUndoBought(item.boughtAt, now));
  const urgent = needed.filter((item) => item.urgent);
  const groups = PURCHASE_CATEGORIES.map((category) => ({
    id: category.id,
    items: needed.filter((item) => !item.urgent && item.category === category.id),
  })).filter((group) => group.items.length > 0);

  useEffect(() => {
    if (!undoId) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [undoId]);

  async function checkOff(id: string) {
    setBusyId(id);
    setActionError(null);
    const result = await markBought(id);
    setBusyId(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setUndoId(id);
    setNow(Date.now());
  }

  async function undoLast() {
    if (!recent) return;
    setBusyId(recent.id);
    setActionError(null);
    const result = await undoBought(recent.id);
    setBusyId(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setUndoId(null);
  }

  async function shareList() {
    if (needed.length === 0) return;
    const message = formatNeededShare(needed, {
      title: t("shareListTitle"),
      urgent: t("urgent"),
    });
    try {
      await shareNeededText(message);
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      setActionError(t("errorGeneric"));
    }
  }

  if (isLoading && needed.length === 0 && bought.length === 0 && !error) {
    return <LoadingScreen />;
  }

  return (
    <Screen>
      <ScreenHeader
        title={t("tripTitle")}
        subtitle={t("tripSubtitle")}
        showBack
        right={
          <Pressable
            onPress={() => void shareList()}
            disabled={needed.length === 0}
            accessibilityRole="button"
            accessibilityLabel={t("shareList")}
            className="h-11 w-11 items-center justify-center rounded-full bg-white active:opacity-80"
          >
            <Ionicons name="share-outline" size={iconSize.sm} color={colors.accent} />
          </Pressable>
        }
      />

      <FormMessage message={actionError ?? error} />

      {recent ? (
        <View className="mb-5 flex-row items-center justify-between gap-3 rounded-3xl bg-cove-paper px-4 py-3">
          <AppText className="min-w-0 flex-1 text-sm text-cove-ink">{t("markedBoughtUndo")}</AppText>
          <Pressable onPress={() => void undoLast()} className="active:opacity-80">
            <AppText className="text-sm font-semibold text-cove-accent">{t("undoBought")}</AppText>
          </Pressable>
        </View>
      ) : null}

      {needed.length === 0 ? (
        <EmptyState title={t("tripEmpty")} message={t("tripEmptyBody")} />
      ) : (
        <View className="gap-6">
          {urgent.length > 0 ? (
            <TripGroup
              title={t("urgentSection")}
              items={urgent}
              busyId={busyId}
              onCheck={(id) => void checkOff(id)}
            />
          ) : null}
          {groups.map((group) => (
            <TripGroup
              key={`${group.id}-${locale}`}
              title={getCategoryLabel(group.id, locale)}
              items={group.items}
              busyId={busyId}
              onCheck={(id) => void checkOff(id)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function TripGroup({
  title,
  items,
  busyId,
  onCheck,
}: {
  title: string;
  items: Purchase[];
  busyId: string | null;
  onCheck: (id: string) => void;
}) {
  return (
    <View>
      <SectionHeader title={title} meta={String(items.length)} />
      <View className="gap-3">
        {items.map((item) => (
          <TripCheckRow
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onCheck={() => onCheck(item.id)}
          />
        ))}
      </View>
    </View>
  );
}

function TripCheckRow({
  item,
  busy,
  onCheck,
}: {
  item: Purchase;
  busy: boolean;
  onCheck: () => void;
}) {
  const { colors } = useTheme();
  const quantity = item.unit ? `${item.quantity} ${item.unit}` : `x${item.quantity}`;

  return (
    <Pressable
      onPress={onCheck}
      disabled={busy}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: false, busy }}
      className="flex-row items-center gap-3 rounded-3xl bg-cove-paper px-4 py-4 active:opacity-80"
    >
      {busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Ionicons name="ellipse-outline" size={iconSize.md} color={colors.accent} />
      )}
      <View className="min-w-0 flex-1">
        <AppText className="text-base font-semibold text-cove-ink">{item.name}</AppText>
        <AppText className="mt-1 text-sm text-cove-muted">{quantity}</AppText>
      </View>
    </Pressable>
  );
}
