import { Image } from "expo-image";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { iconImageUrl } from "@/features/icons/api";
import { resolveIcon } from "@/features/icons/resolve";
import { useHomeIcons } from "@/features/icons/use-icons";
import { normalizeName } from "@/features/items/utils/insights";
import { useTheme } from "@/providers/ThemeProvider";

type HomeIconProps = (
  | { kind: "category"; id: string }
  /** A trip's name as typed; null or empty for a trip with no name. */
  | { kind: "shop"; name: string | null | undefined }
) & {
  size?: number;
  /** Corner radius; a rounded square by default. */
  radius?: number;
  /** Tile colour; the page's quiet surface by default. "transparent" for none. */
  background?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The icon of a category or a shop: the home's uploaded image, else its
 * emoji, else the default (constants/icons.ts). Follows the icons that sync
 * and the change sheet keep in the saved copy.
 */
export function HomeIcon(props: HomeIconProps) {
  const { size = 34, radius, background, style } = props;
  const { colors, scheme } = useTheme();
  const icons = useHomeIcons();
  const key = props.kind === "shop" ? normalizeName(props.name ?? "") : props.id;
  const icon = resolveIcon(icons, props.kind, key);
  const corner = radius ?? Math.round(size * 0.32);

  return (
    <View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: corner,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: background ?? (scheme === "dark" ? colors.mist : colors.ice),
        },
        style,
      ]}
    >
      {icon.type === "image" ? (
        <Image
          // The id changes with every upload, so the cached file is never stale.
          source={{ uri: iconImageUrl(icon.imageId), cacheKey: icon.imageId }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={icon.imageId}
          transition={null}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          allowFontScaling={false}
          style={{
            fontSize: Math.round(size * 0.5),
            lineHeight: Math.round(size * 0.66),
            textAlign: "center",
            includeFontPadding: false,
          }}
        >
          {icon.emoji}
        </Text>
      )}
    </View>
  );
}
