import { BlurTargetView, BlurView } from "expo-blur";
import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

export function BlurScreen({ children }: { children: ReactNode }) {
  const target = useRef<View>(null);

  return (
    <BlurTargetContext.Provider value={target}>
      <BlurTargetView ref={target} style={styles.fill}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  );
}

type BlurBackdropProps = {
  onPress?: () => void;
  disabled?: boolean;
};

export function BlurBackdrop({ onPress, disabled = false }: BlurBackdropProps) {
  const { scheme } = useTheme();
  const blurTarget = useContext(BlurTargetContext);

  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={StyleSheet.absoluteFill}
    >
      <BlurView
        intensity={80}
        tint={scheme === "dark" ? "dark" : "light"}
        blurTarget={blurTarget ?? undefined}
        blurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        blurReductionFactor={2}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
