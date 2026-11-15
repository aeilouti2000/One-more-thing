import { Ionicons } from "@expo/vector-icons";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ViewHandle } from "@/lib/native-refs";
import { StyleSheet, View } from "react-native";
import { useDragOverlay } from "@/components/ui/DragOverlay";
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
/** Used until a row has been measured; replaced by the last real height seen. */
const FIRST_HEIGHT_GUESS = 48;

type ReorderableListProps = {
  items: Purchase[];
  enabled: boolean;
  onReorder: (ids: string[]) => void;
  onDragChange?: (dragging: boolean) => void;
  onItemLongPress?: (id: string) => void;
  renderRow: (
    purchase: Purchase,
    handle: ReactNode,
    index: number,
    preview?: boolean,
  ) => ReactNode;
};

/**
 * Where every row sits, in the order shown. Rows are absolutely positioned and
 * placed only from this value, so a reorder never depends on a React layout
 * pass landing in the same frame as an animation update.
 */
type ListLayout = {
  ids: string[];
  heights: number[];
  tops: number[];
  index: Record<string, number>;
  total: number;
};

const EMPTY_LAYOUT: ListLayout = { ids: [], heights: [], tops: [], index: {}, total: 0 };

function buildLayout(ids: string[], heights: number[]): ListLayout {
  "worklet";
  const tops: number[] = [];
  const index: Record<string, number> = {};
  let y = 0;
  for (let position = 0; position < ids.length; position += 1) {
    tops.push(y);
    index[ids[position]] = position;
    y += (heights[position] ?? 0) + GAP;
  }
  return { ids, heights, tops, index, total: Math.max(0, y - GAP) };
}

function moveInLayout(layout: ListLayout, from: number, to: number): ListLayout {
  "worklet";
  if (from === to || from < 0 || from >= layout.ids.length) return layout;
  const ids = layout.ids.slice();
  const heights = layout.heights.slice();
  const [id] = ids.splice(from, 1);
  const [height] = heights.splice(from, 1);
  ids.splice(to, 0, id);
  heights.splice(to, 0, height);
  return buildLayout(ids, heights);
}

function computeTarget(from: number, dy: number, layout: ListLayout) {
  "worklet";
  const { tops, heights } = layout;
  if (from < 0 || from >= tops.length) return Math.max(0, from);
  const movingMid = tops[from] + dy + heights[from] / 2;
  let to = from;
  if (dy > 0) {
    for (let index = from + 1; index < tops.length; index += 1) {
      if (movingMid > tops[index] + heights[index] / 2) to = index;
      else break;
    }
  } else if (dy < 0) {
    for (let index = from - 1; index >= 0; index -= 1) {
      if (movingMid < tops[index] + heights[index] / 2) to = index;
      else break;
    }
  }
  return to;
}

function settleOffset(from: number, to: number, layout: ListLayout) {
  "worklet";
  const { tops, heights } = layout;
  if (from < 0 || to === from || from >= tops.length) return 0;
  if (to > from) return tops[to] + heights[to] - tops[from] - heights[from];
  return tops[to] - tops[from];
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
  const publishQueued = useRef(false);
  const heightById = useRef(new Map<string, number>());
  const heightGuess = useRef(FIRST_HEIGHT_GUESS);
  const rowsRef = useRef(rows);
  const onReorderRef = useRef(onReorder);
  const onDragChangeRef = useRef(onDragChange);
  const onLongPressRef = useRef(onItemLongPress);
  const renderRowRef = useRef(renderRow);
  const rowRefs = useRef(new Map<string, ViewHandle>());
  const overlay = useDragOverlay();
  const dragY = overlay.y;
  const dragX = overlay.x;
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);
  const settling = useSharedValue(false);
  /** The row hidden under the floating copy while it is dragged. */
  const hiddenId = useSharedValue("");
  const layout = useSharedValue<ListLayout>(EMPTY_LAYOUT);

  useLayoutEffect(() => {
    rowsRef.current = rows;
    onReorderRef.current = onReorder;
    onDragChangeRef.current = onDragChange;
    onLongPressRef.current = onItemLongPress;
    renderRowRef.current = renderRow;
  });

  useEffect(() => () => overlay.dismiss(), [overlay]);

  function measuredLayout(list: Purchase[]) {
    return buildLayout(
      list.map((item) => item.id),
      list.map((item) => heightById.current.get(item.id) ?? heightGuess.current),
    );
  }

  function publishLayout() {
    layout.set(measuredLayout(rowsRef.current));
  }

  // Rows measure one by one; publish once for the whole batch.
  function queuePublish() {
    if (publishQueued.current) return;
    publishQueued.current = true;
    queueMicrotask(() => {
      publishQueued.current = false;
      if (!dragging.current) publishLayout();
    });
  }

  // Sync before paint so list switches don't flash the previous rows for a frame.
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
    // Rows that stay keep their measured height (they won't lay out again, so
    // nothing would measure them a second time); only new rows start unknown.
    const known = heightById.current;
    heightById.current = new Map(
      items.flatMap((item) => {
        const height = known.get(item.id);
        return height === undefined ? [] : [[item.id, height] as const];
      }),
    );
    setRows(items);
  }, [items]);

  // The drag maths needs the new rows and positions as soon as rows change.
  useLayoutEffect(() => {
    if (!dragging.current) publishLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publishLayout only reads refs
  }, [rows]);

  function hold(active: boolean) {
    if (active) onDragChangeRef.current?.(true);
    else if (!dragging.current) onDragChangeRef.current?.(false);
  }

  function beginDrag(id: string) {
    committed.current = false;
    dragging.current = true;
    onDragChangeRef.current?.(true);
    const index = rowsRef.current.findIndex((item) => item.id === id);
    const purchase = rowsRef.current[index];
    const node = rowRefs.current.get(id);
    if (!purchase || !node) return;
    const preview = renderRowRef.current(purchase, <StaticHandle />, index, true);
    node.measureInWindow((x, y, width, height) => {
      if (!dragging.current) return;
      // The row may already be translated by the drag, and that shift is inside
      // this measurement. The overlay adds the same shift again, so remove it here.
      overlay.present(preview, {
        x: x - dragX.value,
        y: y - dragY.value,
        width,
        height,
      });
    });
  }

  /**
   * Runs after the drop is already on screen: the UI thread has put every row
   * in its new place. This only brings React's order in line and reports it.
   */
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
      onReorderRef.current(next.map((item) => item.id));
    }
    dragging.current = false;
    rowsRef.current = next;
    onDragChangeRef.current?.(false);
    setRows(next);
    overlay.dismiss();
    dragX.set(0);
    dragY.set(0);
    settling.set(false);
  }

  // Each row's place for its first frame, before the UI thread takes over.
  // eslint-disable-next-line react-hooks/refs -- measured heights only seed a new row's starting position; later moves come from the shared layout
  const firstLayout = measuredLayout(rows);
  const containerStyle = useAnimatedStyle(() => ({ height: layout.value.total }));

  return (
    <Animated.View style={[{ height: firstLayout.total }, containerStyle]}>
      {rows.map((purchase, index) => (
        <ReorderRow
          key={purchase.id}
          id={purchase.id}
          firstTop={firstLayout.tops[index] ?? 0}
          dragY={dragY}
          shown={overlay.shown}
          hiddenId={hiddenId}
          activeIndex={activeIndex}
          targetIndex={targetIndex}
          layout={layout}
          rowRefs={rowRefs}
          onLayout={(height) => {
            heightGuess.current = height;
            if (heightById.current.get(purchase.id) === height) return;
            heightById.current.set(purchase.id, height);
            queuePublish();
          }}
        >
          {renderRow(
            purchase,
            enabled ? (
              <DragHandle
                id={purchase.id}
                dragX={dragX}
                dragY={dragY}
                activeIndex={activeIndex}
                targetIndex={targetIndex}
                settling={settling}
                hiddenId={hiddenId}
                layout={layout}
                onHold={hold}
                onBegin={() => beginDrag(purchase.id)}
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
    </Animated.View>
  );
}

function ReorderRow({
  id,
  firstTop,
  dragY,
  shown,
  hiddenId,
  activeIndex,
  targetIndex,
  layout,
  rowRefs,
  onLayout,
  children,
}: {
  id: string;
  firstTop: number;
  dragY: SharedValue<number>;
  shown: SharedValue<number>;
  hiddenId: SharedValue<string>;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  layout: SharedValue<ListLayout>;
  rowRefs: { current: Map<string, ViewHandle> };
  onLayout: (height: number) => void;
  children: ReactNode;
}) {
  const top = useSharedValue(firstTop);

  // Where this row should rest: its slot, moved aside while another row is
  // dragged across it. -1 until the layout knows this row.
  useAnimatedReaction(
    () => {
      const current = layout.value;
      const row = current.index[id];
      if (row === undefined) return -1;
      const slot = current.tops[row] ?? 0;
      const from = activeIndex.value;
      if (from < 0 || row === from) return slot;
      const to = targetIndex.value;
      const span = (current.heights[from] ?? 0) + GAP;
      if (from < to && row > from && row <= to) return slot - span;
      if (from > to && row < from && row >= to) return slot + span;
      return slot;
    },
    (next, previous) => {
      if (next < 0) return;
      if (previous === null || previous < 0) {
        top.set(next);
        return;
      }
      if (activeIndex.value >= 0) {
        top.set(withTiming(next, { duration: SHIFT_MS, easing: Easing.out(Easing.cubic) }));
        return;
      }
      // A drop hands the same position over as the row's new slot: leave any
      // running slide alone instead of cutting it short.
      if (Math.abs(next - previous) < 0.5) return;
      top.set(next);
    },
  );

  const style = useAnimatedStyle(() => {
    const draggingThis =
      activeIndex.value >= 0 && layout.value.index[id] === activeIndex.value;
    const hidden = hiddenId.value === id && shown.value > 0;
    return {
      transform: [{ translateY: draggingThis ? top.value + dragY.value : top.value }],
      zIndex: draggingThis ? 20 : 0,
      elevation: draggingThis && !hidden ? 12 : 0,
      opacity: hidden ? 0 : 1,
    };
  });

  return (
    <Animated.View
      ref={(node: ViewHandle | null) => {
        if (node) rowRefs.current.set(id, node);
        else rowRefs.current.delete(id);
      }}
      collapsable={false}
      style={[rowStyles.row, style]}
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
    >
      {children}
    </Animated.View>
  );
}

const rowStyles = StyleSheet.create({
  row: { position: "absolute", top: 0, left: 0, right: 0 },
});

function DragHandle({
  id,
  dragX,
  dragY,
  activeIndex,
  targetIndex,
  settling,
  hiddenId,
  layout,
  onHold,
  onBegin,
  onCommit,
  onLongPress,
}: {
  id: string;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  settling: SharedValue<boolean>;
  hiddenId: SharedValue<string>;
  layout: SharedValue<ListLayout>;
  onHold: (active: boolean) => void;
  onBegin: () => void;
  onCommit: (from: number, to: number) => void;
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const callbacks = useRef({ onHold, onBegin, onCommit, onLongPress });

  useLayoutEffect(() => {
    callbacks.current = { onHold, onBegin, onCommit, onLongPress };
  });

  /* eslint-disable react-hooks/refs -- gesture callbacks read the latest handlers via a ref when they fire, not during render */
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
          const row = layout.value.index[id];
          if (row === undefined) return;
          dragX.set(0);
          dragY.set(0);
          hiddenId.set(id);
          activeIndex.set(row);
          targetIndex.set(row);
          runOnJS(begin)();
        })
        .onUpdate((event) => {
          "worklet";
          if (settling.value || activeIndex.value < 0) return;
          dragX.set(event.translationX);
          dragY.set(event.translationY);
          const next = computeTarget(activeIndex.value, event.translationY, layout.value);
          if (next !== targetIndex.value) targetIndex.set(next);
        })
        .onFinalize((event, success) => {
          "worklet";
          if (activeIndex.value < 0 || settling.value) return;
          settling.set(true);
          const from = activeIndex.value;
          const to = success ? computeTarget(from, event.translationY, layout.value) : from;
          targetIndex.set(to);
          const dest = settleOffset(from, to, layout.value);
          dragX.set(withTiming(0, {
            duration: SETTLE_MS,
            easing: Easing.out(Easing.cubic),
          }));
          dragY.set(withTiming(
            dest,
            { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) },
            () => {
              "worklet";
              // The whole drop happens here, in one frame on the UI thread:
              // every row's slot changes together with the end of the drag.
              layout.set(moveInLayout(layout.value, from, to));
              activeIndex.set(-1);
              targetIndex.set(-1);
              // Then show the real row, and only once it has been drawn let
              // React remove the floating copy that covers it.
              requestAnimationFrame(() => {
                "worklet";
                hiddenId.set("");
                requestAnimationFrame(() => {
                  "worklet";
                  requestAnimationFrame(() => {
                    "worklet";
                    runOnJS(commitDrag)(from, to);
                  });
                });
              });
            },
          ));
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
  }, [activeIndex, dragX, dragY, hiddenId, id, layout, settling, targetIndex]);
  /* eslint-enable react-hooks/refs */

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

function StaticHandle() {
  const { colors } = useTheme();
  return (
    <View className="justify-center py-1">
      <Ionicons name="reorder-three" size={22} color={colors.muted} />
    </View>
  );
}
