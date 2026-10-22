import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { BlurBackdrop } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import {
  FloatedCard,
  FloatedCardActions,
  FloatedCardHeader,
} from "@/components/ui/FloatedCard";
import { FormMessage } from "@/components/ui/FormMessage";
import { floatedControlRadius, withAlpha } from "@/constants/theme";
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

        <FloatedCard>
          <FloatedCardHeader
            title={title}
            icon={icon}
            iconTone="danger"
            accent={false}
            className="mb-3"
          />

          <AppText
            className="mb-1 text-sm leading-5"
            style={{
              color: colors.muted,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {message}
          </AppText>

          {children}

          <FormMessage message={error} />

          {alert ? (
            <Pressable
              onPress={onCancel}
              className="mt-4 items-center px-3 py-3 active:opacity-80"
              style={{
                backgroundColor: colors.accent,
                borderRadius: floatedControlRadius,
              }}
            >
              <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                {cancelLabel}
              </AppText>
            </Pressable>
          ) : (
            <FloatedCardActions className="mt-4">
              <Pressable
                disabled={loading}
                onPress={onCancel}
                className="flex-1 items-center px-3 py-3 active:opacity-80"
                style={{
                  backgroundColor:
                    scheme === "dark" ? withAlpha(colors.white, 0.08) : "#F4F5F7",
                  borderRadius: floatedControlRadius,
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
                className="flex-1 items-center px-3 py-3 active:opacity-80"
                style={{
                  backgroundColor: danger,
                  borderRadius: floatedControlRadius,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <AppText className="text-sm font-semibold text-white">
                    {confirmLabel}
                  </AppText>
                )}
              </Pressable>
            </FloatedCardActions>
          )}
        </FloatedCard>
      </View>
    </Modal>
  );
}
