import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";
import { SWIPE_ACTION_TONE, type SwipeAction } from "@/features/items/utils/swipe-actions";

const REVEAL_RATIO = 0.36;

type SwipeableItemProps = {
  enabled: boolean;
  revealed: boolean;
  leftAction: SwipeAction;
  rightAction: SwipeAction;
  onReveal: (open: boolean) => void;
  onAction: (action: SwipeAction) => void;
  children: ReactNode;
};

export function SwipeableItem({
  enabled,
  revealed,
  leftAction,
  rightAction,
  onReveal,
  onAction,
  children,
}: SwipeableItemProps) {
  const { t } = useI18n();
  const [settled, setSettled] = useState<"left" | "right" | null>(null);
  const widthSV = useSharedValue(0);
  const travel = useSharedValue(0);
  const resting = useSharedValue(0);
  const dragging = useSharedValue(false);
  const callbacks = useRef({ onReveal, onAction, leftAction, rightAction });
  callbacks.current = { onReveal, onAction, leftAction, rightAction };

  useEffect(() => {
    if (revealed || dragging.value) return;
    resting.value = 0;
    travel.value = withTiming(0, { duration: 180 });
    setSettled(null);
  }, [dragging, revealed, resting, travel]);

  function settle(direction: number) {
    const side = direction < 0 ? "left" : direction > 0 ? "right" : null;
    setSettled(side);
    callbacks.current.onReveal(side !== null);
  }

  function trigger() {
    const side = resting.value < 0 ? "left" : resting.value > 0 ? "right" : null;
    if (!side) return;
    const action = side === "left" ? callbacks.current.leftAction : callbacks.current.rightAction;
    resting.value = 0;
    travel.value = withTiming(0, { duration: 180 });
    setSettled(null);
    callbacks.current.onReveal(false);
    callbacks.current.onAction(action);
  }

  const gesture = useMemo(() => {
    const report = (direction: number) => settle(direction);
    return Gesture.Pan()
      .enabled(enabled)
      .activeOffsetX([-18, 18])
      .failOffsetY([-14, 14])
      .onStart(() => {
        "worklet";
        dragging.value = true;
      })
      .onUpdate((event) => {
        "worklet";
        const width = Math.max(widthSV.value, 1);
        const next = resting.value * width + event.translationX;
        travel.value = Math.max(-width, Math.min(width, next));
      })
      .onFinalize((event) => {
        "worklet";
        dragging.value = false;
        const width = Math.max(widthSV.value, 1);
        const projected = resting.value * width + event.translationX;
        const ratio = projected / width;
        const direction = ratio <= -REVEAL_RATIO ? -1 : ratio >= REVEAL_RATIO ? 1 : 0;
        resting.value = direction;
        travel.value = withTiming(direction * width, { duration: 180 }, () => {
          runOnJS(report)(direction);
        });
      });
    // Shared values are stable. Callbacks are read through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, enabled, resting, travel, widthSV]);

  const leftBg = SWIPE_ACTION_TONE[leftAction].bg;
  const rightBg = SWIPE_ACTION_TONE[rightAction].bg;

  const leftStyle = useAnimatedStyle(() => {
    const width = Math.max(widthSV.value, 1);
    const amount = interpolate(-travel.value / width, [0, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: amount };
  });

  const rightStyle = useAnimatedStyle(() => {
    const width = Math.max(widthSV.value, 1);
    const amount = interpolate(travel.value / width, [0, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: amount };
  });

  const openSide = settled;
  const openAction = openSide === "left" ? leftAction : openSide === "right" ? rightAction : null;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={(event) => {
          widthSV.value = event.nativeEvent.layout.width;
        }}
        style={{ borderRadius: 24 }}
      >
        <View pointerEvents={openAction ? "none" : "auto"}>{children}</View>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: leftBg, borderRadius: 24, overflow: "hidden" },
            leftStyle,
          ]}
        >
          <ActionFace action={leftAction} label={actionLabel(leftAction, t)} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: rightBg, borderRadius: 24, overflow: "hidden" },
            rightStyle,
          ]}
        >
          <ActionFace action={rightAction} label={actionLabel(rightAction, t)} />
        </Animated.View>
        {openAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel(openAction, t)}
            onPress={trigger}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

function actionLabel(
  action: SwipeAction,
  t: (key: "markSelectedBought" | "pinSelected" | "moveSelected" | "markSelectedUrgent" | "delete") => string,
) {
  if (action === "buy") return t("markSelectedBought");
  if (action === "pin") return t("pinSelected");
  if (action === "move") return t("moveSelected");
  if (action === "urgent") return t("markSelectedUrgent");
  return t("delete");
}

function ActionFace({ action, label }: { action: SwipeAction; label: string }) {
  const tone = SWIPE_ACTION_TONE[action];
  const icon =
    action === "buy" ? (
      <MaterialCommunityIcons name="cart-check" size={28} color={tone.fg} />
    ) : action === "pin" ? (
      <MaterialCommunityIcons name="pin" size={26} color={tone.fg} />
    ) : action === "move" ? (
      <Ionicons name="swap-horizontal" size={28} color={tone.fg} />
    ) : action === "urgent" ? (
      <Ionicons name="flash" size={28} color={tone.fg} />
    ) : (
      <Ionicons name="trash-outline" size={28} color={tone.fg} />
    );

  return (
    <View className="flex-1 items-center justify-center gap-1">
      {icon}
      <AppText className="text-sm font-semibold" style={{ color: tone.fg }}>
        {label}
      </AppText>
    </View>
  );
}
