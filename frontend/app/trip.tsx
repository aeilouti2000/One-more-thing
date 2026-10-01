import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { RequireSession } from "@/components/auth/RequireSession";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getCategoryLabel } from "@/constants/categories";
import { useCategories } from "@/providers/CategoriesProvider";
import { iconSize } from "@/constants/theme";
import { usePurchases } from "@/hooks/usePurchases";
import { canUndoBought, formatNeededShare, shareNeededText } from "@/lib/share-list";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase } from "@/types/purchase";

const ROW_GAP = 12;
const CHECK_SIZE = iconSize.md;
const LEAVE_DELAY = 140;
const LEAVE_MS = 380;

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
  const { categories } = useCategories();
  const { colors } = useTheme();
  const [actionError, setActionError] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const recent = bought.find((item) => item.id === undoId && canUndoBought(item.boughtAt, now));
  const urgent = needed.filter((item) => item.urgent);
  const groups = categories
    .map((category) => ({
      id: category.id,
      title: category.builtin ? getCategoryLabel(category.id, locale) : (category.name ?? category.id),
      items: needed.filter((item) => !item.urgent && item.category === category.id),
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    if (!undoId) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [undoId]);

  async function checkOff(id: string) {
    setActionError(null);
    const result = await markBought(id);
    if (result.error) {
      setActionError(result.error);
      return false;
    }
    setUndoId(id);
    setNow(Date.now());
    return true;
  }

  async function undoLast() {
    if (!recent) return;
    setActionError(null);
    const result = await undoBought(recent.id);
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
              onCheck={checkOff}
            />
          ) : null}
          {groups.map((group) => (
            <TripGroup
              key={`${group.id}-${locale}`}
              title={group.title}
              items={group.items}
              onCheck={checkOff}
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
  onCheck,
}: {
  title: string;
  items: Purchase[];
  onCheck: (id: string) => Promise<boolean>;
}) {
  return (
    <View>
      <SectionHeader title={title} meta={String(items.length)} />
      <View>
        {items.map((item, index) => (
          <TripCheckRow
            key={item.id}
            item={item}
            gap={index < items.length - 1 ? ROW_GAP : 0}
            onCheck={() => onCheck(item.id)}
          />
        ))}
      </View>
    </View>
  );
}

function TripCheckRow({
  item,
  gap,
  onCheck,
}: {
  item: Purchase;
  gap: number;
  onCheck: () => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const quantity = item.unit ? `${item.quantity} ${item.unit}` : `x${item.quantity}`;
  const locked = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const contentHeight = useSharedValue(0);
  const check = useSharedValue(0);
  const ripple = useSharedValue(0);
  const leave = useSharedValue(0);

  function onContentLayout(event: LayoutChangeEvent) {
    if (locked.current) return;
    const next = event.nativeEvent.layout.height;
    if (next > 0) contentHeight.value = next;
  }

  function unlock() {
    locked.current = false;
    setLeaving(false);
  }

  function restore() {
    check.value = withTiming(0, { duration: 180 });
    ripple.value = withTiming(0, { duration: 160 });
    leave.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(unlock)();
    });
  }

  function commit() {
    void onCheck().then((ok) => {
      if (!ok) restore();
    });
  }

  function playExit() {
    if (locked.current) return;
    locked.current = true;
    setLeaving(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    check.value = withSpring(1, { damping: 13, stiffness: 340, mass: 0.45 });
    ripple.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    leave.value = withDelay(
      LEAVE_DELAY,
      withTiming(1, { duration: LEAVE_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(commit)();
      }),
    );
  }

  const shellStyle = useAnimatedStyle(() => {
    const close = interpolate(leave.value, [0.45, 1], [0, 1], Extrapolation.CLAMP);
    const measured = contentHeight.value;
    return {
      height: measured > 0 ? measured * (1 - close) : undefined,
      marginBottom: gap * (1 - close),
    };
  });

  const motionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(leave.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
    transformOrigin: isRTL ? "right center" : "left center",
    transform: [{ scale: interpolate(leave.value, [0, 0.5], [1, 0.9], Extrapolation.CLAMP) }],
  }));

  const fillStyle = useAnimatedStyle(() => {
    const t = Math.min(Math.max(check.value, 0), 1.1);
    return {
      opacity: Math.min(Math.max(check.value, 0), 1),
      transform: [{ scale: t }],
    };
  });

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(check.value, [0, 0.55], [1, 0], Extrapolation.CLAMP),
  }));

  const markStyle = useAnimatedStyle(() => {
    const t = interpolate(check.value, [0.3, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: t,
      transform: [{ scale: 0.5 + 0.5 * t }],
    };
  });

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ripple.value, [0, 0.12, 1], [0, 0.5, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(ripple.value, [0, 1], [0.85, 3.8], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View
      style={[{ overflow: "hidden" }, shellStyle]}
      pointerEvents={leaving ? "none" : "auto"}
    >
      <Animated.View style={motionStyle}>
        <View onLayout={onContentLayout} collapsable={false}>
          <Pressable
            onPress={playExit}
            disabled={leaving}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: leaving }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                overflow: "hidden",
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: 16,
                backgroundColor: colors.paper,
              }}
            >
              <View
                style={{
                  width: CHECK_SIZE,
                  height: CHECK_SIZE,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: CHECK_SIZE,
                      height: CHECK_SIZE,
                      borderRadius: CHECK_SIZE / 2,
                      borderWidth: 2,
                      borderColor: colors.accent,
                    },
                    rippleStyle,
                  ]}
                />
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: CHECK_SIZE,
                      height: CHECK_SIZE,
                      borderRadius: CHECK_SIZE / 2,
                      backgroundColor: colors.accent,
                    },
                    fillStyle,
                  ]}
                />
                <Animated.View style={ringStyle}>
                  <Ionicons name="ellipse-outline" size={CHECK_SIZE} color={colors.accent} />
                </Animated.View>
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    markStyle,
                  ]}
                >
                  <Ionicons name="checkmark" size={17} color={colors.white} />
                </Animated.View>
              </View>
              <View className="min-w-0 flex-1">
                <AppText className="text-base font-semibold text-cove-ink">{item.name}</AppText>
                {item.notes ? (
                  <AppText className="mt-1 text-sm text-cove-muted">{item.notes}</AppText>
                ) : null}
                <AppText className="mt-1 text-sm text-cove-muted">{quantity}</AppText>
              </View>
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
