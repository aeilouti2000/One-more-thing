import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname } from "expo-router";
import { RequireSession } from "@/features/auth/components/require-session";
import { GlassTabBar } from "@/components/ui/GlassTabBar";
import { TabBarVisibility, useTabBarVisibility } from "@/components/ui/TabBarVisibility";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { useI18n } from "@/providers/LanguageProvider";

export default function TabsLayout() {
  return (
    <TabBarVisibility>
      <TabScreens />
    </TabBarVisibility>
  );
}

/** Hide the tab bar on settings subpages on phone only; fold keeps the bar. */
function useSettingsSectionOpen() {
  const pathname = usePathname();
  const wide = useWideLayout();
  if (wide) return false;
  return pathname.startsWith("/settings/");
}

function TabScreens() {
  const { hidden } = useTabBarVisibility();
  const settingsSectionOpen = useSettingsSectionOpen();
  const { t } = useI18n();

  return (
    <RequireSession requireHome>
      <Tabs
        tabBar={(props) => (
          <GlassTabBar {...props} hidden={hidden || settingsSectionOpen} />
        )}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen
          name="items"
          options={{
            title: t("tabItems"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "list" : "list-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: t("tabHistory"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "time" : "time-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="home"
          options={{
            title: t("tabHome"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t("tabSettings"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "settings" : "settings-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </RequireSession>
  );
}
