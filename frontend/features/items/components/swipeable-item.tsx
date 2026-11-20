import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { useScreenSwipeGesture } from "@/components/ui/Screen";
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { SWIPE_ACTION_TONE, type SwipeAction } from "@/features/items/utils/swipe-actions";
import { CARD_RADIUS } from "@/features/items/components/purchase-row";

/** How far the card must be pulled, as a share of its width, for the action to run. */
const COMMIT_RATIO = 0.4;
const RETURN_MS = 220;
const FLY_MS = 200;
/** A flown-off card comes back if its row is still there (the action was cancelled). */
const FLY_BACK_MS = 700;

type SwipeableItemProps = {
  enabled: boolean;
  /** Kept for callers; a short swipe now springs back instead of staying open. */
  revealed?: boolean;
  leftAction: SwipeAction;
  rightAction: SwipeAction;
  onReveal?: (open: boolean) => void;
  onAction: (action: SwipeAction) => void;
  children: ReactNode;
};

export function SwipeableItem({
  enabled,
  leftAction,
  rightAction,
  onAction,
  children,
}: SwipeableItemProps) {
  const { t } = useI18n();
  const screenSwipe = useScreenSwipeGesture();
  const widthSV = useSharedValue(0);
  const travel = useSharedValue(0);
  // 0 → 1 once the pull is far enough to run the action.
  const armed = useSharedValue(0);
  const isArmed = useSharedValue(false);
  const flyBack = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onAction, leftAction, rightAction });
  useLayoutEffect(() => {
    callbacks.current = { onAction, leftAction, rightAction };
  });
  useEffect(
    () => () => {
      if (flyBack.current) clearTimeout(flyBack.current);
    },
    [],
  );

  function tick() {
    void Haptics.selectionAsync();
  }

  function commit(direction: number, flown: boolean) {
    const action =
      direction < 0 ? callbacks.current.leftAction : callbacks.current.rightAction;
    callbacks.current.onAction(action);
    if (!flown) return;
    if (flyBack.current) clearTimeout(flyBack.current);
    flyBack.current = setTimeout(() => {
      armed.set(0);
      travel.set(withTiming(0, { duration: RETURN_MS, easing: Easing.out(Easing.cubic) }));
    }, FLY_BACK_MS);
  }

  const leftFlies = leftAction === "buy";
  const rightFlies = rightAction === "buy";
  const gesture = usePanGesture({
    enabled,
    activeOffsetX: [-18, 18],
    failOffsetY: [-14, 14],
    // A swipe on the card belongs to the item action, not the list pager.
    block: enabled ? (screenSwipe ?? undefined) : undefined,
    onUpdate: (event) => {
      const width = Math.max(widthSV.value, 1);
      const next = Math.max(-width, Math.min(width, event.translationX));
      travel.set(next);
      const far = Math.abs(next) >= width * COMMIT_RATIO;
      if (far !== isArmed.value) {
        isArmed.set(far);
        armed.set(withTiming(far ? 1 : 0, { duration: 120 }));
        if (far) runOnJS(tick)();
      }
    },
    onDeactivate: (event) => {
      const width = Math.max(widthSV.value, 1);
      const far = !event.canceled && isArmed.value;
      const direction = travel.value < 0 ? -1 : 1;
      isArmed.set(false);
      if (!far) {
        armed.set(withTiming(0, { duration: 120 }));
        travel.set(withTiming(0, { duration: RETURN_MS, easing: Easing.out(Easing.cubic) }));
        return;
      }
      const flies = direction < 0 ? leftFlies : rightFlies;
      if (flies) {
        travel.set(
          withTiming(direction * width * 1.05, { duration: FLY_MS }, () => {
            runOnJS(commit)(direction, true);
          }),
        );
        return;
      }
      // Actions that keep the row, or ask first, just let the card come back.
      runOnJS(commit)(direction, false);
      travel.set(
        withTiming(0, { duration: RETURN_MS, easing: Easing.out(Easing.cubic) }, () => {
          armed.set(0);
        }),
      );
    },
  });

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: travel.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={(event) => {
          widthSV.set(event.nativeEvent.layout.width);
        }}
        style={{ borderRadius: CARD_RADIUS }}
      >
        {/* Swiping right opens the lane on the left edge, and the other way round. */}
        <ActionLane
          action={rightAction}
          label={actionLabel(rightAction, t)}
          side="left"
          travel={travel}
          width={widthSV}
          armed={armed}
        />
        <ActionLane
          action={leftAction}
          label={actionLabel(leftAction, t)}
          side="right"
          travel={travel}
          width={widthSV}
          armed={armed}
        />
        <Animated.View style={cardStyle}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

function actionLabel(
  action: SwipeAction,
  t: (
    key:
      | "markSelectedBought"
      | "pinSelected"
      | "moveSelected"
      | "markSelectedUrgent"
      | "laterAction"
      | "delete",
  ) => string,
) {
  if (action === "buy") return t("markSelectedBought");
  if (action === "pin") return t("pinSelected");
  if (action === "move") return t("moveSelected");
  if (action === "urgent") return t("markSelectedUrgent");
  if (action === "later") return t("laterAction");
  return t("delete");
}

function ActionLane({
  action,
  label,
  side,
  travel,
  width,
  armed,
}: {
  action: SwipeAction;
  label: string;
  side: "left" | "right";
  travel: SharedValue<number>;
  width: SharedValue<number>;
  armed: SharedValue<number>;
}) {
  const solid = SWIPE_ACTION_TONE[action].solid;
  const soft = withAlpha(solid, 0.22);
  const sign = side === "left" ? 1 : -1;

  const laneStyle = useAnimatedStyle(() => {
    const pulled = (sign * travel.value) / Math.max(width.value, 1);
    return {
      opacity: interpolate(pulled, [0, 0.06], [0, 1], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(armed.value, [0, 1], [soft, solid]),
    };
  });
  const iconStyle = useAnimatedStyle(() => {
    const pulled = (sign * travel.value) / Math.max(width.value, 1);
    const grow = interpolate(pulled, [0, COMMIT_RATIO], [0.7, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: grow + armed.value * 0.2 }] };
  });
  const restStyle = useAnimatedStyle(() => ({ opacity: 1 - armed.value }));
  const armedStyle = useAnimatedStyle(() => ({ opacity: armed.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          borderRadius: CARD_RADIUS,
          // Physical sides: the lane follows the finger, not the reading direction.
          direction: "ltr",
          flexDirection: side === "left" ? "row" : "row-reverse",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 18,
        },
        laneStyle,
      ]}
    >
      <Animated.View style={iconStyle}>
        <Animated.View style={restStyle}>
          <ActionIcon action={action} color={solid} />
        </Animated.View>
        <Animated.View style={[{ position: "absolute", top: 0, left: 0 }, armedStyle]}>
          <ActionIcon action={action} color="#FFFFFF" />
        </Animated.View>
      </Animated.View>
      <Animated.View style={armedStyle}>
        <AppText className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>
          {label}
        </AppText>
      </Animated.View>
    </Animated.View>
  );
}

function ActionIcon({ action, color }: { action: SwipeAction; color: string }) {
  if (action === "buy") return <MaterialCommunityIcons name="cart-check" size={24} color={color} />;
  if (action === "pin") return <MaterialCommunityIcons name="pin" size={24} color={color} />;
  if (action === "move") return <Ionicons name="swap-horizontal" size={24} color={color} />;
  if (action === "urgent") return <Ionicons name="flash" size={24} color={color} />;
  if (action === "later") return <Ionicons name="hourglass-outline" size={24} color={color} />;
  return <Ionicons name="trash-outline" size={24} color={color} />;
}
