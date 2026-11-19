import { Image } from "expo-image";
import { View } from "react-native";
import { headerIconFrameStyle } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

const lightIcon = require("../../assets/images/lists-header-light.png");
const darkIcon = require("../../assets/images/lists-header-dark.png");

export function ListsHeaderIcon() {
  const { colors, scheme } = useTheme();

  return (
    <View
      className="items-center justify-center"
      style={[headerIconFrameStyle(scheme, colors), { overflow: "hidden" }]}
    >
      {/* The badge is a full circle with its own background, so it fills the frame. */}
      <Image
        source={scheme === "dark" ? darkIcon : lightIcon}
        contentFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}
