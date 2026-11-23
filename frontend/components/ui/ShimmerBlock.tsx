import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { KEEP_MOTION } from "@/lib/motion";

/** A rounded placeholder bar with a light sheen sweeping across it. */
export function ShimmerBlock({
  width,
  height,
  tone,
  highlight = "rgba(255,255,255,0.72)",
}: {
  width: number;
  height: number;
  tone: string;
  highlight?: string;
}) {
  const travel = useSharedValue(0);
  useEffect(() => {
    travel.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
      undefined,
      // Still sweeps with animations off: it is how loading looks alive.
      KEEP_MOTION,
    );
  }, [travel]);
  const sheen = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(travel.value, [0, 1], [-width * 0.7, width]) },
    ],
  }));

  return (
    <View
      style={{
        width,
        height,
        borderRadius: height / 2,
        overflow: "hidden",
        backgroundColor: tone,
      }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            width: Math.max(36, width * 0.62),
          },
          sheen,
        ]}
      >
        <LinearGradient
          colors={["transparent", highlight, "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}
