import { Ionicons } from "@expo/vector-icons";
import { Dimensions, Modal, Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, DialogGlass, GlassFill } from "@/components/ui/BlurBackdrop";
import { floatedCardStyle, iconSize } from "@/constants/theme";
import { listLabel } from "@/features/items/api/lists";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

export type Anchor = { x: number; y: number; width: number; height: number };

export function OptionMenu({
  visible,
  anchor,
  isRTL,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  anchor: Anchor | null;
  isRTL: boolean;
  options: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { colors, scheme, shadow } = useTheme();
  const motionOff = useMotionOff();
  const frame = menuFrame(anchor, isRTL);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={motionOff ? "none" : "fade"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1">
        <BlurBackdrop onPress={onClose} />
        <View
          className="absolute"
          style={{
            top: frame.top,
            left: frame.left,
            width: frame.width,
            borderRadius: 16,
            shadowColor: shadow.color,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.16,
            shadowRadius: 16,
            elevation: 8,
          }}
        >
          <View
            className="overflow-hidden rounded-2xl"
            style={[floatedCardStyle(scheme, colors), { maxHeight: frame.maxHeight }]}
          >
            <GlassFill soft neutral />
            <DialogGlass />
            <ScrollView
              bounces={false}
              style={{ flexGrow: 0, maxHeight: frame.maxHeight }}
              contentContainerStyle={{ gap: 4, padding: 8 }}
            >
            {options.map((option) => {
              const selected = option.id === selectedId;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    onSelect(option.id);
                    onClose();
                  }}
                  className="flex-row items-center justify-between rounded-2xl px-3 py-3 active:opacity-80"
                  style={{ backgroundColor: selected ? colors.accent : "transparent" }}
                >
                  <AppText
                    numberOfLines={1}
                    className="min-w-0 flex-1 text-sm font-medium"
                    style={{ color: selected ? colors.onAccent : colors.ink }}
                  >
                    {option.label}
                  </AppText>
                  {selected ? (
                    <Ionicons name="checkmark" size={iconSize.sm} color={colors.onAccent} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function historyListLabel(
  list: { name: string; deleted: boolean } | undefined,
  defaultLabel: string,
  deletedLabel: string,
) {
  const name = listLabel(list?.name ?? "", defaultLabel);
  return list?.deleted ? `${name} (${deletedLabel})` : name;
}

function menuFrame(anchor: Anchor | null, isRTL: boolean) {
  const screen = Dimensions.get("window");
  const width = Math.min(240, screen.width - 32);
  const gap = 8;
  const top = anchor ? anchor.y + anchor.height + gap : 96;
  const start = anchor ? (isRTL ? anchor.x + anchor.width - width : anchor.x) : 16;
  return {
    top,
    left: Math.max(16, Math.min(start, screen.width - width - 16)),
    width,
    maxHeight: Math.max(180, screen.height - top - 16),
  };
}
