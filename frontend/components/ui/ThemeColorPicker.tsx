import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import {
  DEFAULT_ACCENT,
  getColors,
  hexToHsl,
  hslToHex,
  withAlpha,
} from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type Hsv = { h: number; s: number; v: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hsvToHex({ h, s, v }: Hsv) {
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);
  const c = val * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = val - c;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string): Hsv {
  const { h, s, l } = hexToHsl(hex);
  const sat = s / 100;
  const light = l / 100;
  const v = light + sat * Math.min(light, 1 - light);
  const hsvS = v === 0 ? 0 : 2 * (1 - light / v);
  return {
    h,
    s: clamp(hsvS, 0, 1),
    v: clamp(v, 0, 1),
  };
}

const HUE_COLORS = [
  "#FF0000",
  "#FFFF00",
  "#00FF00",
  "#00FFFF",
  "#0000FF",
  "#FF00FF",
  "#FF0000",
] as const;

const PANEL_HEIGHT = 168;
const SLIDER_HEIGHT = 28;
const THUMB = 22;

export function ThemeColorPicker() {
  const { t } = useI18n();
  const { accent, colors, scheme, setAccent } = useTheme();
  const [draft, setDraft] = useState<Hsv>(() => hexToHsv(accent));
  const panelSize = useRef({ width: 1, height: PANEL_HEIGHT });
  const hueWidth = useRef(1);

  useEffect(() => {
    setDraft(hexToHsv(accent));
  }, [accent]);

  const draftHex = useMemo(() => hsvToHex(draft), [draft]);
  const draftPalette = useMemo(() => getColors(scheme, draftHex), [scheme, draftHex]);
  const pureHue = useMemo(() => hsvToHex({ h: draft.h, s: 1, v: 1 }), [draft.h]);
  const dirty = draftHex.toUpperCase() !== accent.toUpperCase();

  function updateFromPanel(x: number, y: number) {
    const { width, height } = panelSize.current;
    if (width <= 0 || height <= 0) return;
    setDraft((prev) => ({
      ...prev,
      s: clamp(x / width, 0, 1),
      v: clamp(1 - y / height, 0, 1),
    }));
  }

  function updateFromHue(x: number) {
    const width = hueWidth.current;
    if (width <= 0) return;
    setDraft((prev) => ({
      ...prev,
      h: clamp((x / width) * 360, 0, 359.999),
    }));
  }

  const panelPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        updateFromPanel(event.nativeEvent.locationX, event.nativeEvent.locationY);
      },
      onPanResponderMove: (event) => {
        updateFromPanel(event.nativeEvent.locationX, event.nativeEvent.locationY);
      },
    }),
  ).current;

  const huePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        updateFromHue(event.nativeEvent.locationX);
      },
      onPanResponderMove: (event) => {
        updateFromHue(event.nativeEvent.locationX);
      },
    }),
  ).current;

  function onPanelLayout(event: LayoutChangeEvent) {
    panelSize.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  }

  function onHueLayout(event: LayoutChangeEvent) {
    hueWidth.current = event.nativeEvent.layout.width;
  }

  return (
    <View accessibilityLabel={t("themeColor")}>
      <AppText className="text-sm font-medium text-cove-muted">{t("themeColor")}</AppText>
      <AppText className="mt-1 text-sm text-cove-muted">{t("themeColorBody")}</AppText>

      <View className="mt-4 flex-row items-center gap-3">
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: draftHex,
            borderWidth: 2,
            borderColor: withAlpha(colors.ink, 0.18),
          }}
        />
        <View className="min-w-0 flex-1">
          <AppText className="text-base font-semibold text-cove-ink">{draftHex}</AppText>
          <AppText className="mt-0.5 text-xs text-cove-muted">{t("themeColorPreview")}</AppText>
        </View>
      </View>

      <View
        className="mt-4 overflow-hidden rounded-2xl"
        style={{ height: PANEL_HEIGHT, borderWidth: 1, borderColor: colors.line }}
        onLayout={onPanelLayout}
        {...panelPan.panHandlers}
      >
        <LinearGradient
          colors={["#FFFFFF", pureHue]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0)", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: `${draft.s * 100}%`,
            top: `${(1 - draft.v) * 100}%`,
            width: THUMB,
            height: THUMB,
            marginLeft: -THUMB / 2,
            marginTop: -THUMB / 2,
            borderRadius: THUMB / 2,
            borderWidth: 2,
            borderColor: "#FFFFFF",
            backgroundColor: draftHex,
            shadowColor: "#000000",
            shadowOpacity: 0.35,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
            elevation: 3,
          }}
        />
      </View>

      <View
        className="mt-3 justify-center overflow-hidden rounded-full"
        style={{ height: SLIDER_HEIGHT, borderWidth: 1, borderColor: colors.line }}
        onLayout={onHueLayout}
        {...huePan.panHandlers}
      >
        <LinearGradient
          colors={[...HUE_COLORS]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: `${(draft.h / 360) * 100}%`,
            top: (SLIDER_HEIGHT - THUMB) / 2,
            width: THUMB,
            height: THUMB,
            marginLeft: -THUMB / 2,
            borderRadius: THUMB / 2,
            borderWidth: 2,
            borderColor: "#FFFFFF",
            backgroundColor: pureHue,
            shadowColor: "#000000",
            shadowOpacity: 0.28,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </View>

      <View className="mt-4 overflow-hidden rounded-2xl border border-cove-line">
        <View className="flex-row">
          {[
            draftPalette.ice,
            draftPalette.mist,
            draftPalette.line,
            draftPalette.accent,
            draftPalette.accentDeep,
            draftPalette.ink,
          ].map((shade, index) => (
            <View key={`${shade}-${index}`} style={{ flex: 1, height: 28, backgroundColor: shade }} />
          ))}
        </View>
      </View>

      <View className="mt-4 gap-2">
        <AppButton
          label={t("themeColorApply")}
          disabled={!dirty}
          onPress={() => setAccent(draftHex)}
        />
        {accent.toUpperCase() !== DEFAULT_ACCENT.toUpperCase() || dirty ? (
          <Pressable
            onPress={() => {
              setDraft(hexToHsv(DEFAULT_ACCENT));
              setAccent(DEFAULT_ACCENT);
            }}
            className="items-center py-2 active:opacity-80"
          >
            <AppText className="text-sm font-semibold text-cove-accent">{t("themeColorReset")}</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
