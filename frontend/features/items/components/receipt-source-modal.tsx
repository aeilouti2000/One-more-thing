import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, GlassFill } from "@/components/ui/BlurBackdrop";
import { floatedCardStyle, iconSize, withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type ReceiptSourceModalProps = {
  visible: boolean;
  reading?: boolean;
  onCamera: () => void;
  onLibrary: () => void;
  onClose: () => void;
};

export function ReceiptSourceModal({
  visible,
  reading = false,
  onCamera,
  onLibrary,
  onClose,
}: ReceiptSourceModalProps) {
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const accentSoft = withAlpha(colors.accent, scheme === "dark" ? 0.16 : 0.12);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!reading) onClose();
      }}
    >
      <View className="flex-1 items-center justify-center px-6">
        <BlurBackdrop onPress={reading ? undefined : onClose} />
        <View
          className="w-full max-w-sm gap-4 overflow-hidden rounded-3xl p-5"
          style={floatedCardStyle(scheme, colors)}
        >
          <GlassFill soft neutral />
          <View
            className="items-center gap-3"
            style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
          >
            <View
              className="h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: accentSoft }}
            >
              <Ionicons name="scan-outline" size={iconSize.sm} color={colors.accent} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <AppText
                className="text-lg font-semibold"
                style={{ color: colors.ink, textAlign: isRTL ? "right" : "left" }}
              >
                {reading ? t("scanReceiptWorking") : t("scanReceipt")}
              </AppText>
              {reading ? null : (
                <AppText
                  className="text-xs leading-4"
                  style={{ color: colors.muted, textAlign: isRTL ? "right" : "left" }}
                >
                  {t("scanReceiptChoose")}
                </AppText>
              )}
            </View>
          </View>

          {reading ? (
            <View className="items-center py-2">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View className="gap-2">
              <Pressable
                onPress={onCamera}
                accessibilityRole="button"
                accessibilityLabel={t("scanReceiptCamera")}
                className="items-center rounded-2xl px-4 py-3 active:opacity-80"
                style={{ backgroundColor: colors.accent }}
              >
                <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                  {t("scanReceiptCamera")}
                </AppText>
              </Pressable>
              <Pressable
                onPress={onLibrary}
                accessibilityRole="button"
                accessibilityLabel={t("scanReceiptLibrary")}
                className="items-center rounded-2xl px-4 py-3 active:opacity-80"
                style={{
                  backgroundColor: scheme === "dark" ? withAlpha(colors.white, 0.08) : "#F4F5F7",
                }}
              >
                <AppText className="text-sm font-semibold" style={{ color: colors.ink }}>
                  {t("scanReceiptLibrary")}
                </AppText>
              </Pressable>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t("cancel")}
                className="items-center rounded-2xl px-3 py-2.5 active:opacity-80"
              >
                <AppText className="text-xs font-semibold" style={{ color: colors.muted }}>
                  {t("cancel")}
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
