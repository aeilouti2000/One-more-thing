import { View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { tabBar } from "@/constants/theme";
import { useOfflineUi } from "@/features/offline/sync-status";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";

/**
 * Short messages about offline work, floating over whatever screen is open:
 * a change that could not be saved after all, or a tap on something that
 * needs internet.
 */
export function OfflineNotices() {
  const { notice } = useOfflineUi();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const motionOff = useMotionOff();
  if (!notice) return null;

  const message =
    notice.kind === "needsInternet"
      ? t("needsInternetMessage")
      : notice.count > 1
        ? t("syncChangesRefused", { count: notice.count })
        : t("syncChangeRefused");

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 items-center px-6"
      style={{ bottom: insets.bottom + tabBar.height + 28 }}
    >
      <Animated.View
        key={notice.id}
        entering={motionOff ? undefined : FadeInDown.duration(220)}
        exiting={motionOff ? undefined : FadeOutDown.duration(180)}
      >
        <FloatMessage message={message} tone="error" />
      </Animated.View>
    </View>
  );
}
