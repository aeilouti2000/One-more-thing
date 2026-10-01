import { Image } from "expo-image";
import { View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

const lightIcon = require("../../assets/images/lists-header-light.png");
const darkIcon = require("../../assets/images/lists-header-dark.png");

export function ListsHeaderIcon() {
  const { scheme } = useTheme();

  return (
    <View
      className="items-center justify-center bg-white/20"
      style={{ width: 56, height: 56, borderRadius: 28 }}
    >
      <Image
        source={scheme === "dark" ? darkIcon : lightIcon}
        contentFit="contain"
        style={{ width: 36, height: 36 }}
      />
    </View>
  );
}
