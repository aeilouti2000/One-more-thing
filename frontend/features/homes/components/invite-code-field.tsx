import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { SheetField } from "@/components/ui/SheetField";
import {
  INVITE_LENGTH,
  INVITE_PREFIX,
  invitePart,
  isInviteComplete,
} from "@/features/homes/utils/invite-code";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * Invite code entry. "OMT-" is already there, letters turn into capitals, and
 * anything that can't be part of a code is ignored, so the user types (or
 * pastes) only the eight characters that matter.
 */
export function InviteCodeField({
  value,
  onChange,
  onSubmit,
  autoFocus,
}: {
  /** The eight characters after "OMT-". */
  value: string;
  onChange: (part: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const complete = isInviteComplete(value);

  async function paste() {
    try {
      const text = await Clipboard.getStringAsync();
      const part = invitePart(text);
      if (!part) return;
      onChange(part);
      void Haptics.selectionAsync();
    } catch {
      // Clipboard not readable; the user can still type the code.
    }
  }

  return (
    <View className="gap-2">
      <AppText className="text-sm font-medium text-cove-muted">{t("inviteCode")}</AppText>
      <SheetField
        value={value}
        onChangeText={(text) => onChange(invitePart(text))}
        placeholder={"0".repeat(INVITE_LENGTH)}
        chip={INVITE_PREFIX}
        code
        autoCapitalize="characters"
        autoCorrect={false}
        // Android: a plain keyboard with no word suggestions over the code.
        keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
        // Room for a full pasted code or message; invitePart trims it.
        maxLength={200}
        autoFocus={autoFocus}
        onSubmitEditing={complete ? onSubmit : undefined}
        trailing={
          complete ? null : (
            <Pressable
              onPress={() => void paste()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("pasteCode")}
              className="ms-2 rounded-full px-3 py-1.5 active:opacity-70"
              style={{ backgroundColor: colors.mist }}
            >
              <AppText className="text-xs font-semibold" style={{ color: colors.accentText }}>
                {t("pasteCode")}
              </AppText>
            </Pressable>
          )
        }
      />
      <AppText className="text-xs text-cove-muted">
        {complete
          ? t("inviteCodeReady")
          : t("inviteCodeProgress", { count: value.length, total: INVITE_LENGTH })}
      </AppText>
    </View>
  );
}
