import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { BlurBackdrop, GlassFill } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { floatedCardStyle, iconSize, withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  loading?: boolean;
  alert?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  icon = "warning-outline",
  error,
  loading = false,
  alert = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const danger = scheme === "dark" ? "#F07178" : "#C2414A";
  const dangerSoft = scheme === "dark" ? "rgba(240, 113, 120, 0.16)" : "rgba(194, 65, 74, 0.1)";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      <View className="flex-1 items-center justify-center px-6">
        <BlurBackdrop onPress={onCancel} disabled={loading} />

        <View
          className="w-full max-w-md gap-4 overflow-hidden rounded-3xl p-5"
          style={floatedCardStyle(scheme, colors)}
        >
          <GlassFill soft neutral />
          <View className="flex-row items-center gap-3">
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: dangerSoft }}
            >
              <Ionicons name={icon} size={iconSize.md} color={danger} />
            </View>
            <AppText
              className="min-w-0 flex-1 text-xl font-semibold"
              style={{ color: colors.ink }}
            >
              {title}
            </AppText>
          </View>

          <AppText
            className="text-sm leading-5"
            style={{ color: colors.muted }}
          >
            {message}
          </AppText>

          {children}

          <FormMessage message={error} />

          {alert ? (
            <Pressable
              onPress={onCancel}
              className="items-center rounded-2xl px-3 py-3 active:opacity-80"
              style={{ backgroundColor: colors.accent }}
            >
              <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                {cancelLabel}
              </AppText>
            </Pressable>
          ) : (
          <View
            className="gap-3"
            style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
          >
            <Pressable
              disabled={loading}
              onPress={onCancel}
              className="flex-1 items-center rounded-2xl px-3 py-3 active:opacity-80"
              style={{
                backgroundColor:
                  scheme === "dark" ? withAlpha(colors.white, 0.08) : "#F4F5F7",
              }}
            >
              <AppText
                className="text-sm font-semibold"
                style={{ color: colors.ink }}
              >
                {cancelLabel}
              </AppText>
            </Pressable>
            <Pressable
              disabled={loading}
              onPress={onConfirm}
              className="flex-1 items-center rounded-2xl px-3 py-3 active:opacity-80"
              style={{ backgroundColor: danger }}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <AppText className="text-sm font-semibold text-white">
                  {confirmLabel}
                </AppText>
              )}
            </Pressable>
          </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
