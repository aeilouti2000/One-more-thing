import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop } from "@/components/ui/BlurBackdrop";
import {
  FloatedCard,
  FloatedCardActions,
  FloatedCardHeader,
} from "@/components/ui/FloatedCard";
import { floatedControlRadius, withAlpha } from "@/constants/theme";
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
        <FloatedCard size="sm">
          <FloatedCardHeader
            title={reading ? t("scanReceiptWorking") : t("scanReceipt")}
            subtitle={reading ? undefined : t("scanReceiptChoose")}
            icon="scan-outline"
            iconTone="accent"
          />

          {reading ? (
            <View className="items-center py-4">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <>
              <View className="gap-3">
                <Pressable
                  onPress={onCamera}
                  accessibilityRole="button"
                  accessibilityLabel={t("scanReceiptCamera")}
                  className="active:opacity-80"
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 12,
                    borderRadius: floatedControlRadius,
                    backgroundColor: colors.accent,
                  }}
                >
                  <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                    {t("scanReceiptCamera")}
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={onLibrary}
                  accessibilityRole="button"
                  accessibilityLabel={t("scanReceiptLibrary")}
                  className="active:opacity-80"
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 12,
                    borderRadius: floatedControlRadius,
                    backgroundColor:
                      scheme === "dark" ? withAlpha(colors.white, 0.08) : "#F4F5F7",
                  }}
                >
                  <AppText className="text-sm font-semibold" style={{ color: colors.ink }}>
                    {t("scanReceiptLibrary")}
                  </AppText>
                </Pressable>
              </View>

              <FloatedCardActions>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={t("cancel")}
                  className="flex-1 items-center py-2.5 active:opacity-80"
                >
                  <AppText className="text-sm font-semibold" style={{ color: colors.muted }}>
                    {t("cancel")}
                  </AppText>
                </Pressable>
              </FloatedCardActions>
            </>
          )}
        </FloatedCard>
      </View>
    </Modal>
  );
}
