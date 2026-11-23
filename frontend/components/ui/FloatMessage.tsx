import { Image } from "expo-image";
import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { floatedCardStyle } from "@/constants/theme";
import { currentAppIcon } from "@/lib/app-icon";
import { useTheme } from "@/providers/ThemeProvider";

const DARK_ICON = require("@/assets/images/icon.png");
const LIGHT_ICON = require("@/assets/images/ios-icon-light.png");

/**
 * The app's one message card: the app icon and a short line of text, floating
 * over the page. Errors and successes look the same; the words carry the tone.
 */
export function FloatMessage({
  message,
  tone = "error",
}: {
  message: string;
  tone?: "error" | "success";
}) {
  const { colors, scheme } = useTheme();
  // The same icon as on the phone's home screen.
  const choice = currentAppIcon();
  const lightIcon = choice === "light" || (choice === "system" && scheme === "light");

  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      className="w-full max-w-md flex-row items-center gap-3 overflow-hidden px-3 py-2.5"
      style={{ ...floatedCardStyle(scheme, colors), borderRadius: 20 }}
    >
      <GlassFill soft neutral />
      <Image source={lightIcon ? LIGHT_ICON : DARK_ICON} style={{ width: 30, height: 30, borderRadius: 8 }} />
      <AppText className="min-w-0 flex-1 text-sm font-medium leading-5 text-cove-ink">
        {message}
      </AppText>
    </View>
  );
}
