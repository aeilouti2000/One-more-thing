import { Ionicons } from "@expo/vector-icons";
import { BlurTargetView, BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { useRef } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RequireSession } from "@/components/auth/RequireSession";
import { fontWeight, spacing, tabBar } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const absoluteFill = {
  position: "absolute" as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const blurTargetRef = useRef<View>(null);
  const { colors, scheme, shadow } = useTheme();
  const { t } = useI18n();
  const glassColor =
    scheme === "dark" ? "rgba(10, 25, 47, 0.55)" : "rgba(255, 255, 255, 0.4)";
  const activeGlass =
    scheme === "dark" ? "rgba(66, 165, 245, 0.22)" : "rgba(33, 150, 243, 0.13)";
  const glassBorder =
    scheme === "dark" ? "rgba(144, 202, 249, 0.14)" : "rgba(33, 150, 243, 0.2)";

  return (
    <RequireSession requireHome>
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarActiveBackgroundColor: colors.transparent,
          tabBarInactiveTintColor: colors.muted,
          tabBarHideOnKeyboard: true,
          tabBarBackground: () => (
            <View
              pointerEvents="none"
              style={[
                absoluteFill,
                {
                  overflow: "hidden",
                  borderRadius: tabBar.radius,
                  backgroundColor: glassColor,
                },
              ]}
            >
              <BlurView
                blurTarget={blurTargetRef}
                blurMethod="dimezisBlurViewSdk31Plus"
                intensity={95}
                tint={scheme === "dark" ? "dark" : "light"}
                style={absoluteFill}
              />
            </View>
          ),
          tabBarLabelStyle: {
            fontSize: tabBar.labelSize,
            fontWeight: fontWeight.semibold,
          },
          tabBarIconStyle: {
            width: 42,
            height: 30,
          },
          tabBarItemStyle: {
            marginHorizontal: 3,
            marginVertical: 7,
            paddingTop: 1,
          },
          tabBarStyle: {
            position: "absolute",
            left: spacing.xl,
            right: spacing.xl,
            bottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
            height: tabBar.height,
            borderRadius: tabBar.radius,
            backgroundColor: colors.transparent,
            borderTopWidth: tabBar.borderWidth,
            borderWidth: tabBar.borderWidth,
            borderColor: glassBorder,
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
              <View
                className="h-[30px] w-[42px] items-center justify-center rounded-full"
                style={{
                  backgroundColor: focused ? activeGlass : "transparent",
                  borderWidth: focused ? 1 : 0,
                  borderColor:
                    scheme === "dark"
                      ? "rgba(144,202,249,0.2)"
                      : "rgba(33,150,243,0.14)",
                }}
              >
                <Ionicons
                  name={focused ? "list" : "list-outline"}
                  size={size}
                  color={color}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: t("tabHistory"),
            tabBarIcon: ({ color, size, focused }) => (
              <View
                className="h-[30px] w-[42px] items-center justify-center rounded-full"
                style={{
                  backgroundColor: focused ? activeGlass : "transparent",
                  borderWidth: focused ? 1 : 0,
                  borderColor:
                    scheme === "dark"
                      ? "rgba(144,202,249,0.2)"
                      : "rgba(33,150,243,0.14)",
                }}
              >
                <Ionicons
                  name={focused ? "time" : "time-outline"}
                  size={size}
                  color={color}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="home"
          options={{
            title: t("tabHome"),
            tabBarIcon: ({ color, size, focused }) => (
              <View
                className="h-[30px] w-[42px] items-center justify-center rounded-full"
                style={{
                  backgroundColor: focused ? activeGlass : "transparent",
                  borderWidth: focused ? 1 : 0,
                  borderColor:
                    scheme === "dark"
                      ? "rgba(144,202,249,0.2)"
                      : "rgba(33,150,243,0.14)",
                }}
              >
                <Ionicons
                  name={focused ? "home" : "home-outline"}
                  size={size}
                  color={color}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t("tabSettings"),
            tabBarIcon: ({ color, size, focused }) => (
              <View
                className="h-[30px] w-[42px] items-center justify-center rounded-full"
                style={{
                  backgroundColor: focused ? activeGlass : "transparent",
                  borderWidth: focused ? 1 : 0,
                  borderColor:
                    scheme === "dark"
                      ? "rgba(144,202,249,0.2)"
                      : "rgba(33,150,243,0.14)",
                }}
              >
                <Ionicons
                  name={focused ? "settings" : "settings-outline"}
                  size={size}
                  color={color}
                />
              </View>
            ),
          }}
        />
        </Tabs>
      </BlurTargetView>
    </RequireSession>
  );
}
