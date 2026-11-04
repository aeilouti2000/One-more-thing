import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { AppText } from "@/components/ui/AppText";
import {
  FloatedCard,
  FloatedCardHeader,
} from "@/components/ui/FloatedCard";
import { FormMessage } from "@/components/ui/FormMessage";
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const SHEET_BUTTON_RADIUS = 16;

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
    <BottomSheet visible={visible} onClose={onCancel} locked={loading}>
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
              className="mt-5 h-[52px] items-center justify-center px-4 active:opacity-80"
              style={{
                backgroundColor: colors.accent,
                borderRadius: SHEET_BUTTON_RADIUS,
              }}
            >
              <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                {cancelLabel}
              </AppText>
            </Pressable>
          ) : (
            <View className="mt-5 gap-3">
              <Pressable
                disabled={loading}
                onPress={onConfirm}
                className="h-[52px] items-center justify-center px-4 active:opacity-80"
                style={{ backgroundColor: danger, borderRadius: SHEET_BUTTON_RADIUS }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <AppText className="text-[15px] font-semibold text-white">
                    {confirmLabel}
                  </AppText>
                )}
              </Pressable>
              <Pressable
                disabled={loading}
                onPress={onCancel}
                className="h-[52px] items-center justify-center px-4 active:opacity-70"
                style={{
                  borderRadius: SHEET_BUTTON_RADIUS,
                  borderWidth: 1.5,
                  borderColor:
                    scheme === "dark" ? withAlpha(colors.white, 0.22) : withAlpha("#12141A", 0.18),
                }}
              >
                <AppText className="text-[15px] font-semibold" style={{ color: colors.ink }}>
                  {cancelLabel}
                </AppText>
              </Pressable>
            </View>
          )}
        </FloatedCard>
    </BottomSheet>
  );
}
