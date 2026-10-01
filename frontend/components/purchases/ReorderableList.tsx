import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase } from "@/types/purchase";

type ReorderableListProps = {
  items: Purchase[];
  enabled: boolean;
  onReorder: (ids: string[]) => void;
  onDragChange?: (dragging: boolean) => void;
  onItemLongPress?: (id: string) => void;
  renderRow: (purchase: Purchase, handle: ReactNode) => ReactNode;
};

export function ReorderableList({
  items,
  enabled,
  onReorder,
  onDragChange,
  onItemLongPress,
  renderRow,
}: ReorderableListProps) {
  const [rows, setRows] = useState(items);
  const [drag, setDrag] = useState<{ index: number; dy: number; height: number } | null>(null);
  const dragging = useRef(false);
  const dragRef = useRef<{ index: number; dy: number; height: number } | null>(null);
  const heights = useRef<number[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!dragging.current) setRows(items);
  }, [items]);

  function hold(active: boolean) {
    if (active) onDragChange?.(true);
    else if (!dragging.current) onDragChange?.(false);
  }

  function begin(index: number) {
    const next = { index, dy: 0, height: (heights.current[index] || 88) + 12 };
    dragging.current = true;
    dragRef.current = next;
    setDrag(next);
    onDragChange?.(true);
  }

  function move(dy: number) {
    if (!dragRef.current) return;
    const next = { ...dragRef.current, dy };
    dragRef.current = next;
    setDrag(next);
  }

  function finish(dy: number) {
    const current = dragRef.current;
    if (!dragging.current || !current) return;
    dragging.current = false;
    dragRef.current = null;
    const shift = Math.round(dy / current.height);
    const to = Math.max(0, Math.min(rowsRef.current.length - 1, current.index + shift));
    const next = rowsRef.current.slice();
    const [moved] = next.splice(current.index, 1);
    if (moved) next.splice(to, 0, moved);
    setRows(next);
    setDrag(null);
    onDragChange?.(false);
    if (moved && to !== current.index) onReorder(next.map((item) => item.id));
  }

  const target =
    drag === null
      ? -1
      : Math.max(0, Math.min(rows.length - 1, drag.index + Math.round(drag.dy / drag.height)));

  return (
    <View className="gap-3">
      {rows.map((purchase, index) => {
        let shift = 0;
        if (drag && index !== drag.index) {
          if (drag.index < target && index > drag.index && index <= target) shift = -drag.height;
          if (drag.index > target && index < drag.index && index >= target) shift = drag.height;
        }
        const translateY = drag && index === drag.index ? drag.dy : shift;

        return (
          <View
            key={purchase.id}
            onLayout={(event) => {
              heights.current[index] = event.nativeEvent.layout.height;
            }}
            style={{
              transform: [{ translateY }],
              zIndex: drag && index === drag.index ? 2 : 0,
            }}
          >
            {renderRow(
              purchase,
              enabled ? (
                <DragHandle
                  index={index}
                  onHold={hold}
                  onBegin={begin}
                  onMove={move}
                  onFinish={finish}
                  onLongPress={
                    onItemLongPress ? () => onItemLongPress(purchase.id) : undefined
                  }
                />
              ) : null,
            )}
          </View>
        );
      })}
    </View>
  );
}

function DragHandle({
  index,
  onHold,
  onBegin,
  onMove,
  onFinish,
  onLongPress,
}: {
  index: number;
  onHold: (active: boolean) => void;
  onBegin: (index: number) => void;
  onMove: (dy: number) => void;
  onFinish: (dy: number) => void;
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const callbacks = useRef({ index, onHold, onBegin, onMove, onFinish, onLongPress });
  callbacks.current = { index, onHold, onBegin, onMove, onFinish, onLongPress };
  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Pan()
          .runOnJS(true)
          .activeOffsetY([-8, 8])
          .onStart(() => callbacks.current.onBegin(callbacks.current.index))
          .onUpdate((event) => callbacks.current.onMove(event.translationY))
          .onFinalize((event) => callbacks.current.onFinish(event.translationY)),
        Gesture.LongPress()
          .runOnJS(true)
          .minDuration(350)
          .onStart(() => callbacks.current.onLongPress?.()),
      ),
    [],
  );

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
