import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { tabBar } from "@/constants/theme";
import { hideToast, useToast } from "@/lib/toast";
import { useMotionOff } from "@/providers/MotionProvider";

/** Draws the message card from `showToast` over whatever screen is open. */
export function ToastHost() {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const motionOff = useMotionOff();
  if (!toast) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center px-4"
      style={{ bottom: insets.bottom + tabBar.height + 28 }}
    >
      <Animated.View
        key={toast.id}
        className="w-full items-center"
        entering={motionOff ? undefined : FadeInDown.duration(220)}
        exiting={motionOff ? undefined : FadeOutDown.duration(180)}
      >
        <Pressable onPress={() => hideToast(toast.id)} className="w-full items-center">
          <FloatMessage message={toast.message} tone={toast.tone} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
