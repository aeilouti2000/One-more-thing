import { Image, View } from "react-native";
import { logo } from "@/constants/theme";

type AppLogoProps = {
  size?: number;
};

export function AppLogo({ size = logo.size }: AppLogoProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
      }}
    >
      <Image
        source={require("../../assets/images/icon.png")}
        resizeMode="cover"
        style={{ width: size, height: size }}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
