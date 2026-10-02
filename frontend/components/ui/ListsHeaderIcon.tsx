import { Image } from "expo-image";
import { View } from "react-native";
import { headerIconFrameStyle } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

const lightIcon = require("../../assets/images/lists-header-light.png");
const darkIcon = require("../../assets/images/lists-header-dark.png");

export function ListsHeaderIcon() {
  const { scheme } = useTheme();

  return (
    <View
      className="items-center justify-center"
      style={headerIconFrameStyle(scheme)}
    >
      <Image
        source={scheme === "dark" ? darkIcon : lightIcon}
        contentFit="contain"
        style={{ width: 36, height: 36 }}
      />
    </View>
  );
}
