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

export function TabBarVisibility({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const value = useMemo(() => ({ hidden, setHidden }), [hidden]);

  return (
    <TabBarVisibilityContext.Provider value={value}>
      {children}
    </TabBarVisibilityContext.Provider>
  );
}

export function useTabBarVisibility() {
  const value = useContext(TabBarVisibilityContext);
  if (!value) {
    throw new Error("useTabBarVisibility must be used within TabBarVisibility");
  }
  return value;
}
