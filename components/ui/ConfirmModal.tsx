import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
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
  error,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();

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
        <Pressable
          onPress={() => {
            if (!loading) onCancel();
          }}
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        />

        <View
          className="w-full max-w-md gap-4 rounded-3xl p-5"
          style={{ backgroundColor: colors.paper }}
        >
          <View
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "#FEE2E2" }}
          >
            <AppText style={{ color: "#DC2626", fontSize: 22 }}>!</AppText>
          </View>

          <View className="gap-2">
            <AppText
              className="text-xl font-semibold"
              style={{ color: colors.ink }}
            >
              {title}
            </AppText>
            <AppText
              className="text-sm leading-5"
              style={{ color: colors.muted }}
            >
              {message}
            </AppText>
          </View>

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
              className="flex-1 items-center rounded-2xl bg-red-600 px-3 py-3 active:opacity-80"
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
