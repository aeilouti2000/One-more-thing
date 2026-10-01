import { BlurTargetView } from "expo-blur";
import { useIsFocused } from "expo-router";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Platform, View } from "react-native";

type TabBlurContextValue = {
  target: RefObject<View | null> | null;
  setTarget: (target: RefObject<View | null>) => void;
};

const TabBlurContext = createContext<TabBlurContextValue>({
  target: null,
  setTarget: () => {},
});

export function TabBlurProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<RefObject<View | null> | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);
  return <TabBlurContext.Provider value={value}>{children}</TabBlurContext.Provider>;
}

export function useTabBlurTarget() {
  return useContext(TabBlurContext).target;
}

export function TabBlurSurface({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  const focused = useIsFocused();
  const setTarget = useContext(TabBlurContext).setTarget;

  useLayoutEffect(() => {
    if (Platform.OS !== "android" || !focused) return;
    setTarget(ref);
  }, [focused, setTarget]);

  if (Platform.OS !== "android") return children;

  return (
    <BlurTargetView ref={ref} collapsable={false} style={{ flex: 1 }}>
      {children}
    </BlurTargetView>
  );
}
