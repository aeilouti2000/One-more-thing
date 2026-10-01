import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { BlurBackdrop, GlassFill } from "@/components/ui/BlurBackdrop";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { iconSize } from "@/constants/theme";
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
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const dark = scheme === "dark";
  const danger = dark ? "#F87171" : "#DC2626";
  const dangerSoft = dark ? "rgba(248, 113, 113, 0.18)" : "#FEE2E2";

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

        <View className="w-full max-w-md gap-4 overflow-hidden rounded-3xl border border-cove-line p-5">
          <GlassFill />
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

          <FormMessage message={error} />

          <View
            className="gap-3"
            style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
          >
            <Pressable
              disabled={loading}
              onPress={onCancel}
              className="flex-1 items-center rounded-2xl px-3 py-3 active:opacity-80"
              style={{ backgroundColor: colors.mist }}
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
        </View>
      </View>
    </Modal>
  );
}
