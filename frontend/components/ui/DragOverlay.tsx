import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

export type DragFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragOverlayApi = {
  present: (node: ReactNode, frame: DragFrame) => void;
  dismiss: () => void;
  x: SharedValue<number>;
  y: SharedValue<number>;
  shown: SharedValue<number>;
};

const DragOverlayContext = createContext<DragOverlayApi | null>(null);

export function useDragOverlay() {
  const value = useContext(DragOverlayContext);
  if (!value) {
    throw new Error("useDragOverlay must be used within DragOverlayProvider");
  }
  return value;
}

export function DragOverlayProvider({ children }: { children: ReactNode }) {
  const hostRef = useRef<View>(null);
  const ticket = useRef(0);
  const [node, setNode] = useState<ReactNode>(null);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const shown = useSharedValue(0);

  useLayoutEffect(() => {
    shown.value = node ? 1 : 0;
  }, [node, shown]);

  const api = useMemo<DragOverlayApi>(
    () => ({
      x,
      y,
      shown,
      present(next, frame) {
        const current = ++ticket.current;
        const host = hostRef.current;
        if (!host) return;
        host.measureInWindow((hx, hy) => {
          if (current !== ticket.current) return;
          originX.value = frame.x - hx;
          originY.value = frame.y - hy;
          width.value = frame.width;
          height.value = frame.height;
          setNode(next);
        });
      },
      dismiss() {
        ticket.current += 1;
        shown.value = 0;
        setNode(null);
      },
    }),
    [height, originX, originY, shown, width, x, y],
  );

  const ghost = useAnimatedStyle(() => ({
    opacity: shown.value,
    position: "absolute",
    left: originX.value,
    top: originY.value,
    width: width.value,
    height: height.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <DragOverlayContext.Provider value={api}>
      {children}
      <View
        ref={hostRef}
        collapsable={false}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, node ? styles.host : null]}
      >
        {node ? (
          <Animated.View pointerEvents="none" style={[styles.card, ghost]}>
            {node}
          </Animated.View>
        ) : null}
      </View>
    </DragOverlayContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    zIndex: 1000,
    elevation: 48,
  },
  card: {
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 24,
  },
});
