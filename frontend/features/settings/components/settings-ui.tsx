import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Animated, {
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Pressable, Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { iconSize, withAlpha } from "@/constants/theme";
import {
  readSwipeActions,
  subscribeSwipeActions,
  SWIPE_ACTION_IDS,
  SWIPE_ACTION_TONE,
  writeSwipeActions,
  type SwipeAction,
  type SwipeActionPrefs,
} from "@/features/items/utils/swipe-actions";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export function CardBlock({ children }: { children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-3xl bg-cove-paper px-4 py-4">{children}</View>
  );
}

export function SettingsSection({ children }: { children: ReactNode }) {
  return <View className="gap-3">{children}</View>;
}

export function SettingsCardIcon({
  icon,
  communityIcon,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Drawn instead of `icon`, for symbols the app takes from the other icon set (the pin). */
  communityIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  colors: { mist: string; accent: string };
}) {
  return (
    <View
      className="h-11 w-11 items-center justify-center rounded-2xl"
      style={{ backgroundColor: colors.mist }}
    >
      {communityIcon ? (
        <MaterialCommunityIcons name={communityIcon} size={22} color={colors.accent} />
      ) : (
        <Ionicons name={icon} size={22} color={colors.accent} />
      )}
    </View>
  );
}

export function SettingsCardCopy({
  title,
  body,
  bodyLines,
}: {
  title: string;
  body?: string;
  bodyLines?: number;
}) {
  return (
    <View className="min-w-0 flex-1">
      <AppText className="text-base font-semibold text-cove-ink">{title}</AppText>
      {body ? (
        <AppText
          className="mt-1 text-sm text-cove-muted"
          numberOfLines={bodyLines}
        >
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

export function SettingsNavCard({
  icon,
  title,
  summary,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  onPress: () => void;
  colors: { mist: string; accent: string; ink: string; muted: string };
}) {
  const { isRTL } = useI18n();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row items-center gap-3 overflow-hidden rounded-3xl bg-cove-paper px-4 py-4 active:opacity-80"
    >
      <SettingsCardIcon icon={icon} colors={colors} />
      <SettingsCardCopy title={title} body={summary} bodyLines={1} />
      <Ionicons
        name={isRTL ? "chevron-back" : "chevron-forward"}
        size={iconSize.sm}
        color={colors.ink}
      />
    </Pressable>
  );
}

export function SettingsLinkCard({
  icon,
  communityIcon,
  title,
  body,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  communityIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
  colors: { mist: string; accent: string; muted: string };
}) {
  const { isRTL } = useI18n();

  return (
    <CardBlock>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        className="flex-row items-center gap-3 active:opacity-80"
      >
        <SettingsCardIcon icon={icon} communityIcon={communityIcon} colors={colors} />
        <SettingsCardCopy title={title} body={body} />
        <Ionicons
          name={isRTL ? "chevron-back" : "chevron-forward"}
          size={iconSize.sm}
          color={colors.muted}
        />
      </Pressable>
    </CardBlock>
  );
}

type HostLock = { shake: SharedValue<number> };
const HostLockContext = createContext<HostLock | null>(null);
const HOST_TIP_MS = 2000;

/**
 * Wraps a host-only card. For the host it's the card itself. For anyone else
 * the card is view-only: a tap anywhere shakes its lock pill and shows a small
 * note just above it, so it never looks like the app is stuck.
 */
export function HostOnly({
  locked,
  children,
}: {
  locked: boolean;
  children: ReactNode;
}) {
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const shake = useSharedValue(0);
  const [tipShown, setTipShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lock = useMemo(() => ({ shake }), [shake]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!locked) return <>{children}</>;

  function blocked() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    shake.set(
      withSequence(
        withTiming(-5, { duration: 50 }),
        withTiming(5, { duration: 70 }),
        withTiming(-4, { duration: 70 }),
        withTiming(3, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      ),
    );
    setTipShown(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTipShown(false), HOST_TIP_MS);
  }

  return (
    <HostLockContext.Provider value={lock}>
      <View style={{ zIndex: tipShown ? 10 : 0, elevation: tipShown ? 10 : 0 }}>
        {/* No accessibilityState.disabled here: on Android it calls setEnabled(false),
            which stops the view receiving touches, so the tap would never reach us. */}
        <Pressable
          onPress={blocked}
          accessibilityRole="button"
          accessibilityHint={t("hostOnlyToast")}
        >
          <View pointerEvents="none">{children}</View>
        </Pressable>
        {tipShown ? (
          <Animated.View
            entering={FadeInDown.duration(160)}
            exiting={FadeOut.duration(160)}
            pointerEvents="none"
            className="absolute flex-row items-center gap-1.5 rounded-xl px-3 py-1.5"
            style={{
              bottom: "100%",
              marginBottom: 6,
              [isRTL ? "left" : "right"]: 12,
              backgroundColor: scheme === "dark" ? colors.mist : colors.ink,
              shadowColor: "#000000",
              shadowOpacity: 0.3,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 12,
            }}
          >
            <Ionicons name="lock-closed" size={12} color={HOST_LOCK_TINT} />
            <AppText
              className="text-xs font-semibold"
              style={{ color: scheme === "dark" ? colors.ink : colors.white }}
            >
              {t("hostOnlyToast")}
            </AppText>
          </Animated.View>
        ) : null}
      </View>
    </HostLockContext.Provider>
  );
}

const HOST_LOCK_TINT = "#F0B04A";

/** Shakes when its HostOnly card is tapped by someone who isn't the host. */
function HostShake({ children }: { children: ReactNode }) {
  const lock = useContext(HostLockContext);
  const fallback = useSharedValue(0);
  const shake = lock?.shake ?? fallback;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** A read-only value with a lock, shown to members in place of a control. */
export function HostLockPill({ label, active = false }: { label: string; active?: boolean }) {
  const { colors, scheme } = useTheme();
  const color = active ? colors.accent : colors.ink;
  return (
    <HostShake>
      <View
        className="flex-row items-center gap-1.5 self-start rounded-xl px-2.5 py-1"
        style={{
          backgroundColor: active
            ? withAlpha(colors.accent, scheme === "dark" ? 0.2 : 0.14)
            : colors.mist,
        }}
      >
        <Ionicons name="lock-closed" size={12} color={color} />
        <AppText className="text-sm font-semibold" style={{ color }}>
          {label}
        </AppText>
      </View>
    </HostShake>
  );
}

/** A read-only value field with a lock where the chevron or pencil would be. */
export function HostLockField({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <HostShake>
      <View className="mt-3 flex-row items-center justify-between gap-3 rounded-2xl bg-cove-mist px-4 py-3">
        <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
          {label}
        </AppText>
        <Ionicons name="lock-closed" size={iconSize.sm} color={colors.muted} />
      </View>
    </HostShake>
  );
}

export function CostAskToggle({
  title,
  body,
  value,
  disabled,
  onChange,
  colors,
  locked = false,
}: {
  title: string;
  body: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  colors: { mist: string; accent: string; white: string };
  /** View-only (not the host): the value as a lock pill instead of a switch. */
  locked?: boolean;
}) {
  const { t } = useI18n();
  return (
    <CardBlock>
      <View className="flex-row items-center justify-between gap-3">
        <SettingsCardCopy title={title} body={body} />
        {locked ? (
          <HostLockPill label={value ? t("settingOn") : t("settingOff")} active={value} />
        ) : (
          <Switch
            value={value}
            disabled={disabled}
            onValueChange={onChange}
            trackColor={{ false: colors.mist, true: colors.accent }}
            thumbColor={colors.white}
          />
        )}
      </View>
    </CardBlock>
  );
}

export function swipeActionName(
  action: SwipeAction,
  t: (key: "markSelectedBought" | "pinSelected" | "moveSelected" | "markSelectedUrgent" | "delete") => string,
) {
  if (action === "buy") return t("markSelectedBought");
  if (action === "pin") return t("pinSelected");
  if (action === "move") return t("moveSelected");
  if (action === "urgent") return t("markSelectedUrgent");
  return t("delete");
}

function swipeActionHint(
  action: SwipeAction,
  t: (
    key: "swipeBuyHint" | "swipePinHint" | "swipeMoveHint" | "swipeUrgentHint" | "swipeDeleteHint",
  ) => string,
) {
  if (action === "buy") return t("swipeBuyHint");
  if (action === "pin") return t("swipePinHint");
  if (action === "move") return t("swipeMoveHint");
  if (action === "urgent") return t("swipeUrgentHint");
  return t("swipeDeleteHint");
}

function SwipeActionGlyph({ action, color, size = 18 }: { action: SwipeAction; color: string; size?: number }) {
  if (action === "buy") return <MaterialCommunityIcons name="cart-check" size={size} color={color} />;
  if (action === "pin") return <MaterialCommunityIcons name="pin" size={size} color={color} />;
  if (action === "move") return <Ionicons name="swap-horizontal" size={size} color={color} />;
  if (action === "urgent") return <Ionicons name="flash" size={size} color={color} />;
  return <Ionicons name="trash-outline" size={size} color={color} />;
}

/** Readable action tint on paper/mist; chip faces keep SWIPE_ACTION_TONE.fg. */
const SWIPE_ACTION_LABEL_DARK: Record<SwipeAction, string> = {
  buy: "#4ADE80",
  pin: "#C4B5FD",
  move: "#93C5FD",
  urgent: "#FCD34D",
  delete: "#F07178",
};

function swipeActionLabelColor(action: SwipeAction, scheme: "light" | "dark") {
  return scheme === "dark" ? SWIPE_ACTION_LABEL_DARK[action] : SWIPE_ACTION_TONE[action].fg;
}

function SwipePreviewEdge({
  action,
  side,
  label,
}: {
  action: SwipeAction;
  side: "left" | "right";
  label: string;
}) {
  const tone = SWIPE_ACTION_TONE[action];
  return (
    <View
      className="w-[72px] items-center justify-center gap-1 px-1"
      style={{ backgroundColor: tone.bg }}
    >
      <SwipeActionGlyph action={action} color={tone.fg} size={20} />
      <AppText
        className="text-center text-[11px] font-semibold"
        style={{ color: tone.fg }}
        numberOfLines={1}
      >
        {label}
      </AppText>
      <Ionicons
        name={side === "left" ? "arrow-back" : "arrow-forward"}
        size={12}
        color={withAlpha(tone.fg, 0.7)}
      />
    </View>
  );
}

export function SwipeActionSettings() {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const [prefs, setPrefs] = useState<SwipeActionPrefs>(readSwipeActions);
  const [openSide, setOpenSide] = useState<"left" | "right" | null>(null);

  useEffect(() => subscribeSwipeActions(setPrefs), []);

  function label(action: SwipeAction) {
    return swipeActionName(action, t);
  }

  function choose(side: "left" | "right", action: SwipeAction) {
    if (prefs[side] === action) return;
    void Haptics.selectionAsync();
    const other = side === "left" ? "right" : "left";
    const next: SwipeActionPrefs =
      prefs[other] === action
        ? { left: prefs.right, right: prefs.left }
        : { ...prefs, [side]: action };
    setPrefs(writeSwipeActions(next));
  }

  function sideCard(side: "left" | "right") {
    const selected = prefs[side];
    const tone = SWIPE_ACTION_TONE[selected];
    const expanded = openSide === side;
    const title = side === "left" ? t("swipeLeft") : t("swipeRight");
    return (
      <CardBlock>
        <Pressable
          onPress={() => setOpenSide(expanded ? null : side)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={title}
          className="flex-row items-center gap-3 active:opacity-80"
        >
          <View
            className="h-10 w-10 items-center justify-center rounded-2xl"
            style={{ backgroundColor: tone.bg }}
          >
            <Ionicons
              name={side === "left" ? "arrow-back" : "arrow-forward"}
              size={18}
              color={tone.fg}
            />
          </View>
          <View className="min-w-0 flex-1">
            <AppText className="text-base font-semibold text-cove-ink">{title}</AppText>
            <AppText
              className="mt-0.5 text-sm font-medium"
              style={{ color: swipeActionLabelColor(selected, scheme) }}
              numberOfLines={1}
            >
              {label(selected)}
            </AppText>
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={iconSize.sm}
            color={colors.ink}
          />
        </Pressable>

        {expanded ? (
          <View className="mt-3 gap-1.5">
            {SWIPE_ACTION_IDS.map((action) => {
              const active = selected === action;
              const meta = SWIPE_ACTION_TONE[action];
              const taken = prefs[side === "left" ? "right" : "left"] === action;
              return (
                <Pressable
                  key={action}
                  onPress={() => choose(side, action)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${title}, ${label(action)}`}
                  className="flex-row items-center gap-3 rounded-2xl px-2.5 py-2.5 active:opacity-80"
                  style={{
                    backgroundColor: colors.mist,
                    opacity: taken && !active ? 0.55 : 1,
                  }}
                >
                  <View
                    className="h-9 w-9 items-center justify-center rounded-xl"
                    style={{ backgroundColor: meta.bg }}
                  >
                    <SwipeActionGlyph action={action} color={meta.fg} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <AppText className="text-sm font-semibold text-cove-ink">{label(action)}</AppText>
                    <AppText className="text-xs text-cove-muted">{swipeActionHint(action, t)}</AppText>
                  </View>
                  {active ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={swipeActionLabelColor(action, scheme)}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </CardBlock>
    );
  }

  return (
    <View className="gap-3">
      <CardBlock>
        <View className="mb-3 flex-row items-center gap-3">
          <SettingsCardIcon icon="swap-horizontal-outline" colors={colors} />
          <SettingsCardCopy title={t("swipeActions")} body={t("swipeActionsBody")} />
        </View>
        <View
          className="overflow-hidden rounded-2xl"
          style={{ direction: "ltr", backgroundColor: colors.mist }}
        >
          <View className="flex-row" style={{ minHeight: 76 }}>
            <SwipePreviewEdge action={prefs.left} side="left" label={label(prefs.left)} />
            <View
              className="min-w-0 flex-1 justify-center gap-1 px-4"
              style={{ backgroundColor: colors.paper }}
            >
              <View className="h-2.5 w-24 rounded-full" style={{ backgroundColor: colors.mist }} />
              <View className="h-2 w-16 rounded-full" style={{ backgroundColor: withAlpha(colors.mist, 0.7) }} />
            </View>
            <SwipePreviewEdge action={prefs.right} side="right" label={label(prefs.right)} />
          </View>
        </View>
      </CardBlock>

      {sideCard("left")}
      {sideCard("right")}
    </View>
  );
}
