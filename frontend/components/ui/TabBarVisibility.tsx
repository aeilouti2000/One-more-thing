import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TabBarVisibilityValue = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

const TabBarVisibilityContext = createContext<TabBarVisibilityValue | null>(null);
/** Node drawn in the middle of the tab bar (e.g. the Items add button). */
const TabBarCenterContext = createContext<ReactNode>(null);
/** Kept separate so screens that set the node don't re-render when it changes. */
const SetTabBarCenterContext = createContext<(node: ReactNode) => void>(() => {});

export function TabBarVisibility({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [center, setCenter] = useState<ReactNode>(null);
  const value = useMemo(() => ({ hidden, setHidden }), [hidden]);

  return (
    <TabBarVisibilityContext.Provider value={value}>
      <SetTabBarCenterContext.Provider value={setCenter}>
        <TabBarCenterContext.Provider value={center}>
          {children}
        </TabBarCenterContext.Provider>
      </SetTabBarCenterContext.Provider>
    </TabBarVisibilityContext.Provider>
  );
}

export function useTabBarCenter() {
  return useContext(TabBarCenterContext);
}

export function useSetTabBarCenter() {
  return useContext(SetTabBarCenterContext);
}

export function useTabBarVisibility() {
  const value = useContext(TabBarVisibilityContext);
  if (!value) {
    throw new Error("useTabBarVisibility must be used within TabBarVisibility");
  }
  return value;
}
