import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FloatedCard, FloatedCardActions, FloatedCardHeader } from "@/components/ui/FloatedCard";
import { floatedControlRadius, withAlpha } from "@/constants/theme";
import { itemImageUrl, type PickedPhoto } from "@/features/items/api/items";
import { pickItemPhoto, type PhotoSource } from "@/features/items/utils/pick-photo";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** What to show for an item's photo: the local file while it uploads, else the server copy. */
export function itemPhotoUri(item: { imageId?: string | null; localImageUri?: string } | null) {
  if (!item) return null;
  if (item.localImageUri) return item.localImageUri;
  return item.imageId ? itemImageUrl(item.imageId) : null;
}

export function ItemPhotoThumb({
  uri,
  size,
  radius = 12,
  uploading = false,
}: {
  uri: string;
  size: number;
  radius?: number;
  uploading?: boolean;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        backgroundColor: scheme === "dark" ? withAlpha(colors.white, 0.06) : withAlpha("#12141A", 0.05),
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        accessibilityIgnoresInvertColors
      />
      {uploading ? (
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.35)",
          }}
        >
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

/** Full-screen photo. Tap anywhere or the close button to dismiss. */
export function ItemPhotoViewer({
  uri,
  title,
  onClose,
}: {
  uri: string | null;
  title?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={uri !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("close")}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.98)" }}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={{ flex: 1, marginTop: insets.top + 56, marginBottom: insets.bottom + 24 }}
            contentFit="contain"
            transition={120}
            cachePolicy="memory-disk"
            accessibilityLabel={title}
          />
        ) : null}
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: insets.top + 8,
            start: 16,
            end: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <AppText
            className="min-w-0 flex-1 text-base font-semibold"
            style={{ color: "#FFFFFF" }}
            numberOfLines={1}
          >
            {title ?? ""}
          </AppText>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

/**
 * Camera / gallery chooser for an item photo. Hides the open sheet
 * (`covered`) so the native picker can present over it, like receipt scanning.
 */
export function useItemPhotoChooser(options: {
  onPicked: (photo: PickedPhoto) => void;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const [covered, setCovered] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function open() {
    if (covered) return;
    setError(null);
    setCovered(true);
    timer.current = setTimeout(() => setSourceOpen(true), 320);
  }

  function close() {
    setSourceOpen(false);
    setCovered(false);
  }

  function choose(source: PhotoSource) {
    setSourceOpen(false);
    timer.current = setTimeout(() => {
      void run(source);
    }, 450);
  }

  function remove() {
    close();
    latest.current.onRemove?.();
  }

  async function run(source: PhotoSource) {
    try {
      const picked = await pickItemPhoto(source);
      setCovered(false);
      if (picked.ok) latest.current.onPicked(picked.photo);
      else if (picked.denied) setError(t("itemPhotoPermission"));
    } catch {
      setCovered(false);
      setError(t("errorGeneric"));
    }
  }

  return { covered, sourceOpen, error, setError, open, close, choose, remove };
}

export function PhotoSourceSheet({
  visible,
  canRemove,
  onChoose,
  onRemove,
  onClose,
}: {
  visible: boolean;
  canRemove: boolean;
  onChoose: (source: PhotoSource) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const option = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void, tone: "primary" | "plain" | "danger") => {
    const background =
      tone === "primary"
        ? colors.accent
        : tone === "danger"
          ? dark
            ? "rgba(240,113,120,0.14)"
            : "rgba(194,65,74,0.08)"
          : dark
            ? withAlpha(colors.white, 0.08)
            : "#F4F5F7";
    const color =
      tone === "primary" ? colors.onAccent : tone === "danger" ? (dark ? "#F4A3A8" : "#C2414A") : colors.ink;
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="active:opacity-80"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 12,
          borderRadius: floatedControlRadius,
          backgroundColor: background,
        }}
      >
        <Ionicons name={icon} size={18} color={color} />
        <AppText className="text-sm font-semibold" style={{ color }}>
          {label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <FloatedCard size="sm">
        <FloatedCardHeader
          title={canRemove ? t("itemPhotoChange") : t("addPhoto")}
          subtitle={t("itemPhotoChoose")}
          icon="image-outline"
          iconTone="accent"
        />
        <View className="gap-3">
          {option(t("scanReceiptCamera"), "camera-outline", () => onChoose("camera"), "primary")}
          {option(t("scanReceiptLibrary"), "images-outline", () => onChoose("library"), "plain")}
          {canRemove ? option(t("itemPhotoRemove"), "trash-outline", onRemove, "danger") : null}
        </View>
        <FloatedCardActions>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("cancel")}
            className="flex-1 items-center py-2.5 active:opacity-80"
          >
            <AppText className="text-sm font-semibold" style={{ color: colors.muted }}>
              {t("cancel")}
            </AppText>
          </Pressable>
        </FloatedCardActions>
      </FloatedCard>
    </BottomSheet>
  );
}

/**
 * Photo row inside the item form: "Add photo" when empty, otherwise the
 * thumbnail (tap to view) with a change button.
 */
export function ItemPhotoField({
  uri,
  uploading = false,
  onAdd,
  onView,
}: {
  uri: string | null;
  uploading?: boolean;
  onAdd: () => void;
  onView: () => void;
}) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";

  if (!uri) {
    return (
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        className="flex-row items-center gap-1.5 self-start py-1 active:opacity-70"
      >
        <Ionicons name="camera-outline" size={18} color={colors.accent} />
        <AppText className="text-sm font-semibold text-cove-accent">{t("addPhoto")}</AppText>
      </Pressable>
    );
  }

  return (
    <View
      className="flex-row items-center gap-3 rounded-2xl p-2"
      style={{ backgroundColor: dark ? withAlpha(colors.white, 0.05) : withAlpha("#12141A", 0.04) }}
    >
      <Pressable
        onPress={onView}
        disabled={uploading}
        accessibilityRole="imagebutton"
        accessibilityLabel={t("itemPhotoView")}
        className="active:opacity-80"
      >
        <ItemPhotoThumb uri={uri} size={64} radius={12} uploading={uploading} />
      </Pressable>
      <View className="min-w-0 flex-1">
        <AppText className="text-sm font-semibold text-cove-ink" numberOfLines={1}>
          {uploading ? t("itemPhotoUploading") : t("itemPhoto")}
        </AppText>
      </View>
      <Pressable
        onPress={onAdd}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel={t("itemPhotoChange")}
        hitSlop={6}
        className={`h-9 flex-row items-center gap-1 rounded-full px-3 ${uploading ? "opacity-50" : "active:opacity-75"}`}
        style={{ backgroundColor: withAlpha(colors.accent, dark ? 0.18 : 0.12) }}
      >
        <Ionicons name="camera-outline" size={16} color={colors.accent} />
        <AppText className="text-[13px] font-semibold text-cove-accent">{t("itemPhotoChange")}</AppText>
      </Pressable>
    </View>
  );
}
