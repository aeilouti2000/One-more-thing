import { ActivityIndicator, Pressable, Text, View } from "react-native";

type ProblemScreenProps = {
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  busy?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

// Fixed colours (the splash screen's) and plain views: this also shows when the
// app itself failed to render, where the theme and language providers are gone.
const BACKGROUND = "#071633";
const ACCENT = "#2196F3";

/** A full page for "this didn't work": what happened, and a way to try again. */
export function ProblemScreen({
  title,
  body,
  primaryLabel,
  onPrimary,
  busy = false,
  secondaryLabel,
  onSecondary,
}: ProblemScreenProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
        backgroundColor: BACKGROUND,
      }}
    >
      <View style={{ width: "100%", maxWidth: 420, gap: 12 }}>
        <Text
          accessibilityRole="header"
          style={{
            color: "#FFFFFF",
            fontFamily: "ReadexPro_700Bold",
            fontSize: 22,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.72)",
            fontFamily: "ReadexPro_400Regular",
            fontSize: 15,
            lineHeight: 22,
            textAlign: "center",
          }}
        >
          {body}
        </Text>
        <Pressable
          onPress={onPrimary}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => ({
            marginTop: 16,
            height: 52,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: ACCENT,
            opacity: pressed || busy ? 0.8 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ color: "#FFFFFF", fontFamily: "ReadexPro_600SemiBold", fontSize: 15 }}>
              {primaryLabel}
            </Text>
          )}
        </Pressable>
        {secondaryLabel && onSecondary ? (
          <Pressable
            onPress={onSecondary}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => ({
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.72)",
                fontFamily: "ReadexPro_500Medium",
                fontSize: 14,
              }}
            >
              {secondaryLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
