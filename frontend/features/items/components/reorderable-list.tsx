import { Ionicons } from "@expo/vector-icons";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase } from "@/features/items/types/purchase";

const GAP = 12;
const SHIFT_MS = 160;
const SETTLE_MS = 150;

type ReorderableListProps = {
  items: Purchase[];
  enabled: boolean;
  onReorder: (ids: string[]) => void;
  onDragChange?: (dragging: boolean) => void;
  onItemLongPress?: (id: string) => void;
  renderRow: (purchase: Purchase, handle: ReactNode, index: number) => ReactNode;
};

function rowHeight(heights: number[], index: number) {
  "worklet";
  const height = heights[index] ?? 0;
  return height > 0 ? height : 88;
}

function computeTarget(from: number, dy: number, tops: number[], heights: number[]) {
  "worklet";
  if (from < 0 || tops.length === 0) return Math.max(0, from);
  const movingMid = (tops[from] ?? 0) + dy + rowHeight(heights, from) / 2;
  let to = from;
  if (dy > 0) {
    for (let index = from + 1; index < tops.length; index += 1) {
      const mid = (tops[index] ?? 0) + rowHeight(heights, index) / 2;
      if (movingMid > mid) to = index;
      else break;
    }
  } else if (dy < 0) {
    for (let index = from - 1; index >= 0; index -= 1) {
      const mid = (tops[index] ?? 0) + rowHeight(heights, index) / 2;
      if (movingMid < mid) to = index;
      else break;
    }
  }
  return to;
}

function settleOffset(from: number, to: number, tops: number[], heights: number[]) {
  "worklet";
  if (from < 0 || to === from || tops.length === 0) return 0;
  if (to > from) {
    return (
      (tops[to] ?? 0) +
      rowHeight(heights, to) -
      (tops[from] ?? 0) -
      rowHeight(heights, from)
    );
  }
  return (tops[to] ?? 0) - (tops[from] ?? 0);
}

export function ReorderableList({
  items,
  enabled,
  onReorder,
  onDragChange,
  onItemLongPress,
  renderRow,
}: ReorderableListProps) {
  const [rows, setRows] = useState(items);
  const dragging = useRef(false);
  const committed = useRef(false);
  const pendingReset = useRef(false);
  const heights = useRef<number[]>([]);
  const rowsRef = useRef(rows);
  const onReorderRef = useRef(onReorder);
  const onDragChangeRef = useRef(onDragChange);
  const onLongPressRef = useRef(onItemLongPress);
  const dragY = useSharedValue(0);
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);
  const settling = useSharedValue(false);
  const heightsSV = useSharedValue<number[]>([]);
  const topsSV = useSharedValue<number[]>([]);

  useLayoutEffect(() => {
    rowsRef.current = rows;
    onReorderRef.current = onReorder;
    onDragChangeRef.current = onDragChange;
    onLongPressRef.current = onItemLongPress;
  });

  function publishMetrics() {
    const count = rowsRef.current.length;
    const measured = heights.current.slice(0, count);
    while (measured.length < count) measured.push(0);
    const tops: number[] = [];
    let y = 0;
    for (let index = 0; index < count; index += 1) {
      tops.push(y);
      y += rowHeight(measured, index) + GAP;
    }
    heightsSV.value = measured;
    topsSV.value = tops;
  }

  // Sync before paint so list switches don't flash the previous rows for a frame.
  // Same ids keep their measured heights; only a real order change clears them.
  useLayoutEffect(() => {
    if (dragging.current) return;
    const current = rowsRef.current;
    const sameOrder =
      items.length === current.length &&
      items.every((item, index) => item.id === current[index]?.id);
    if (sameOrder) {
      if (items.some((item, index) => item !== current[index])) setRows(items);
      return;
    }
    heights.current = [];
    setRows(items);
  }, [items]);

  useLayoutEffect(() => {
    if (!pendingReset.current) return;
    pendingReset.current = false;
    activeIndex.value = -1;
    targetIndex.value = -1;
    dragY.value = 0;
    settling.value = false;
    publishMetrics();
  });

  function hold(active: boolean) {
    if (active) onDragChangeRef.current?.(true);
    else if (!dragging.current) onDragChangeRef.current?.(false);
  }

  function beginDrag() {
    committed.current = false;
    dragging.current = true;
    onDragChangeRef.current?.(true);
  }

  function commit(from: number, to: number) {
    if (committed.current) return;
    committed.current = true;
    const current = rowsRef.current;
    const next = current.slice();
    const fromIndex = Math.max(0, Math.min(next.length - 1, from));
    const toIndex = Math.max(0, Math.min(next.length - 1, to));
    if (fromIndex !== toIndex && next[fromIndex]) {
      const [moved] = next.splice(fromIndex, 1);
      if (moved) next.splice(toIndex, 0, moved);
      const measured = heights.current.slice();
      const [height] = measured.splice(fromIndex, 1);
      if (height !== undefined) measured.splice(toIndex, 0, height);
      heights.current = measured;
      onReorderRef.current(next.map((item) => item.id));
    }
    dragging.current = false;
    pendingReset.current = true;
    onDragChangeRef.current?.(false);
    setRows(next);
  }

  return (
    <View style={{ gap: GAP }}>
      {rows.map((purchase, index) => (
        <ReorderRow
          key={purchase.id}
          index={index}
          dragY={dragY}
          activeIndex={activeIndex}
          targetIndex={targetIndex}
          heightsSV={heightsSV}
          onLayout={(height) => {
            if (heights.current[index] === height) return;
            heights.current[index] = height;
            if (!dragging.current) publishMetrics();
          }}
        >
          {renderRow(
            purchase,
            enabled ? (
              <DragHandle
                index={index}
                dragY={dragY}
                activeIndex={activeIndex}
                targetIndex={targetIndex}
                settling={settling}
                topsSV={topsSV}
                heightsSV={heightsSV}
                onHold={hold}
                onBegin={beginDrag}
                onCommit={commit}
                onLongPress={
                  onItemLongPress ? () => onLongPressRef.current?.(purchase.id) : undefined
                }
              />
            ) : null,
            index,
          )}
        </ReorderRow>
      ))}
    </View>
  );
}

function ReorderRow({
  index,
  dragY,
  activeIndex,
  targetIndex,
  heightsSV,
  onLayout,
  children,
}: {
  index: number;
  dragY: SharedValue<number>;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  heightsSV: SharedValue<number[]>;
  onLayout: (height: number) => void;
  children: ReactNode;
}) {
  const indexSV = useSharedValue(index);
  const shift = useSharedValue(0);

  useLayoutEffect(() => {
    indexSV.value = index;
  }, [index, indexSV]);

  useAnimatedReaction(
    () => {
      const from = activeIndex.value;
      const row = indexSV.value;
      if (from < 0 || row === from) return 0;
      const to = targetIndex.value;
      const span = rowHeight(heightsSV.value, from) + GAP;
      if (from < to && row > from && row <= to) return -span;
      if (from > to && row < from && row >= to) return span;
      return 0;
    },
    (next) => {
      if (activeIndex.value < 0) {
        shift.value = 0;
        return;
      }
      shift.value = withTiming(next, {
        duration: SHIFT_MS,
        easing: Easing.out(Easing.cubic),
      });
    },
  );

  const style = useAnimatedStyle(() => {
    const draggingThis = activeIndex.value === indexSV.value;
    return {
      transform: [
        {
          translateY:
            activeIndex.value < 0 ? 0 : draggingThis ? dragY.value : shift.value,
        },
      ],
      zIndex: draggingThis ? 20 : 0,
      elevation: draggingThis ? 12 : 0,
    };
  });

  return (
    <Animated.View
      collapsable={false}
      style={style}
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
    >
      {children}
    </Animated.View>
  );
}

function DragHandle({
  index,
  dragY,
  activeIndex,
  targetIndex,
  settling,
  topsSV,
  heightsSV,
  onHold,
  onBegin,
  onCommit,
  onLongPress,
}: {
  index: number;
  dragY: SharedValue<number>;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  settling: SharedValue<boolean>;
  topsSV: SharedValue<number[]>;
  heightsSV: SharedValue<number[]>;
  onHold: (active: boolean) => void;
  onBegin: () => void;
  onCommit: (from: number, to: number) => void;
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const indexSV = useSharedValue(index);
  const callbacks = useRef({ onHold, onBegin, onCommit, onLongPress });

  useLayoutEffect(() => {
    indexSV.value = index;
    callbacks.current = { onHold, onBegin, onCommit, onLongPress };
  });

  const gesture = useMemo(() => {
    const hold = (active: boolean) => callbacks.current.onHold(active);
    const begin = () => callbacks.current.onBegin();
    const commitDrag = (from: number, to: number) => callbacks.current.onCommit(from, to);
    const longPress = () => callbacks.current.onLongPress?.();

    return Gesture.Exclusive(
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onStart(() => {
          "worklet";
          if (settling.value) return;
          dragY.value = 0;
          activeIndex.value = indexSV.value;
          targetIndex.value = indexSV.value;
          runOnJS(begin)();
        })
        .onUpdate((event) => {
          "worklet";
          if (settling.value || activeIndex.value < 0) return;
          dragY.value = event.translationY;
          const next = computeTarget(
            activeIndex.value,
            event.translationY,
            topsSV.value,
            heightsSV.value,
          );
          if (next !== targetIndex.value) targetIndex.value = next;
        })
        .onFinalize((event, success) => {
          "worklet";
          if (activeIndex.value < 0 || settling.value) return;
          settling.value = true;
          const from = activeIndex.value;
          const to = success
            ? computeTarget(from, event.translationY, topsSV.value, heightsSV.value)
            : from;
          targetIndex.value = to;
          const dest = settleOffset(from, to, topsSV.value, heightsSV.value);
          dragY.value = withTiming(
            dest,
            { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) },
            () => {
              "worklet";
              runOnJS(commitDrag)(from, to);
            },
          );
        }),
      Gesture.LongPress()
        .minDuration(350)
        .onStart(() => {
          "worklet";
          runOnJS(hold)(false);
          runOnJS(longPress)();
        }),
    );
    // Shared values are stable. JS callbacks are read through the ref at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, dragY, heightsSV, indexSV, settling, targetIndex, topsSV]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityRole="button"
        accessibilityLabel={t("reorderItem")}
        className="justify-center py-1"
        onTouchStart={() => callbacks.current.onHold(true)}
        onTouchEnd={() => callbacks.current.onHold(false)}
        onTouchCancel={() => callbacks.current.onHold(false)}
      >
        <Ionicons name="reorder-three" size={22} color={colors.muted} />
      </View>
    </GestureDetector>
  );
}
