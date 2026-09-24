import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { BottomTabBarButtonProps } from "expo-router/js-tabs";
import { PlatformPressable } from "expo-router/react-navigation";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RequireSession } from "@/components/auth/RequireSession";
import { fontWeight, spacing, tabBar } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

function TabBarButton({
  children,
  style,
  focused,
  activeBackground,
  activeBorder,
  ...props
}: BottomTabBarButtonProps & {
  focused: boolean;
  activeBackground: string;
  activeBorder: string;
}) {
  return (
    <PlatformPressable {...props} style={[style, { flex: 1 }]}>
      <View
        className="mx-1 my-1.5 flex-1 items-center justify-center rounded-[22px]"
        style={{
          backgroundColor: focused ? activeBackground : "transparent",
          borderWidth: focused ? 1 : 0,
          borderColor: focused ? activeBorder : "transparent",
        }}
      >
        {children}
      </View>
    </PlatformPressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors, scheme, shadow } = useTheme();
  const { t } = useI18n();
  const activeBackground =
    scheme === "dark" ? "rgba(66, 165, 245, 0.22)" : "rgba(33, 150, 243, 0.13)";
  const activeBorder =
    scheme === "dark" ? "rgba(144,202,249,0.28)" : "rgba(33,150,243,0.2)";

  return (
    <RequireSession requireHome>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarHideOnKeyboard: true,
          tabBarButton: (props) => (
            <TabBarButton
              {...props}
              focused={Boolean(props.accessibilityState?.selected)}
              activeBackground={activeBackground}
              activeBorder={activeBorder}
            />
          ),
          tabBarLabelStyle: {
            fontSize: tabBar.labelSize,
            fontWeight: fontWeight.semibold,
            marginTop: 2,
          },
          tabBarIconStyle: {
            marginTop: 0,
            marginBottom: 0,
          },
          tabBarItemStyle: {
            paddingTop: 0,
            paddingBottom: 0,
          },
          tabBarStyle: {
            position: "absolute",
            left: spacing.xl,
            right: spacing.xl,
            bottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
            height: tabBar.height,
            paddingTop: 0,
            paddingBottom: 0,
            borderRadius: tabBar.radius,
            backgroundColor: colors.paper,
            borderTopWidth: tabBar.borderWidth,
            borderWidth: tabBar.borderWidth,
            borderColor: colors.line,
            shadowColor: shadow.color,
            shadowOffset: shadow.offset,
            shadowOpacity: scheme === "dark" ? 0.42 : 0.18,
            shadowRadius: 24,
            elevation: shadow.elevation,
            marginHorizontal: tabBar.inset,
          },
        }}
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
