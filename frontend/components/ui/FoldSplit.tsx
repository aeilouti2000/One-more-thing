import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { LIST_MASTER_WIDTH } from "@/lib/layout";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Side-by-side panes for unfolded fold; phone callers should not render this. */
export function FoldSplit({
  master,
  detail,
  masterWidth = LIST_MASTER_WIDTH,
}: {
  master: ReactNode;
  detail: ReactNode;
  masterWidth?: number;
}) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.ice,
          flexDirection: isRTL ? "row-reverse" : "row",
        },
      ]}
    >
      <View style={{ width: masterWidth }}>{master}</View>
      <View
        style={{
          width: StyleSheet.hairlineWidth,
          backgroundColor: colors.line,
        }}
      />
      <View style={styles.detail}>{detail}</View>
    </View>
  );
}

export function FoldPaneEmpty({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  const { colors } = useTheme();

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View
        className="items-center justify-center rounded-full"
        style={{
          width: 56,
          height: 56,
          backgroundColor: colors.mist,
        }}
      >
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <AppText className="mt-4 text-center text-lg font-semibold text-cove-ink">
        {title}
      </AppText>
      <AppText className="mt-2 text-center text-base leading-6 text-cove-muted">
        {body}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  detail: {
    flex: 1,
    minWidth: 0,
  },
});
