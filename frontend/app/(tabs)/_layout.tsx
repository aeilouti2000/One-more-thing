import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { RequireSession } from "@/components/auth/RequireSession";
import { GlassTabBar } from "@/components/ui/GlassTabBar";
import { TabBarVisibility, useTabBarVisibility } from "@/components/ui/TabBarVisibility";
import { useI18n } from "@/providers/LanguageProvider";

export default function TabsLayout() {
  return (
    <TabBarVisibility>
      <TabScreens />
    </TabBarVisibility>
  );
}

function TabScreens() {
  const { hidden } = useTabBarVisibility();
  const { t } = useI18n();

  return (
    <RequireSession requireHome>
        <Tabs
          tabBar={(props) => <GlassTabBar {...props} hidden={hidden} />}
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
