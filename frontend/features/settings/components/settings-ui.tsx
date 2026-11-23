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
  Easing,
  Extrapolation,
  FadeInDown,
  FadeOut,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Pressable, Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { iconSize, withAlpha } from "@/constants/theme";
import { NeedsInternetTag, useNeedsInternet } from "@/features/offline/components/needs-internet";
import { showNeedsInternet } from "@/features/offline/sync-status";
import {
  readSwipeActions,
  subscribeSwipeActions,
  SWIPE_ACTION_IDS,
  SWIPE_ACTION_TONE,
  writeSwipeActions,
  type SwipeAction,
  type SwipeActionPrefs,
} from "@/features/items/utils/swipe-actions";
import { KEEP_MOTION } from "@/lib/motion";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

export function CardBlock({ children }: { children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-3xl bg-cove-paper px-4 py-4">{children}</View>
  );
}

export function SettingsSection({ children }: { children: ReactNode }) {
  return <View className="gap-3">{children}</View>;
}

/** A group of settings under a small heading. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2.5">
      <AppText className="px-1 text-xs font-bold uppercase tracking-widest text-cove-muted">
        {title}
      </AppText>
      {children}
    </View>
  );
}

/** Corner radius of the picture inside a SettingsChoiceTile. */
const CHOICE_TILE_RADIUS = 18;

/**
 * One of a few looks to pick from: a picture of it (the children), its name
 * and a tick when chosen. Put two to a `flex-row gap-3` View, inside a View
 * with accessibilityRole="radiogroup": the tiles share the row's width.
 */
export function SettingsChoiceTile({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors, glass } = useTheme();
  // Glass cards are barely there, so an unselected tile needs a visible edge.
  const edge = selected ? colors.accentText : glass ? colors.line : "transparent";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className="min-w-0 flex-1 active:opacity-85"
    >
      <View
        style={{
          borderRadius: CHOICE_TILE_RADIUS + 6,
          padding: 6,
          backgroundColor: colors.paper,
          borderWidth: 2,
          borderColor: edge,
        }}
      >
        <View style={{ borderRadius: CHOICE_TILE_RADIUS, overflow: "hidden" }}>{children}</View>
        <View className="flex-row items-center justify-between gap-1.5 px-2 pb-1.5 pt-3">
          {/* One line that shrinks on narrow tiles instead of wrapping into the check. */}
          <AppText
            className="text-base font-semibold text-cove-ink"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={{ flex: 1, minWidth: 0 }}
          >
            {label}
          </AppText>
          <View
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: selected ? 0 : 1.5,
              borderColor: withAlpha(colors.muted, 0.5),
              backgroundColor: selected ? colors.accent : "transparent",
            }}
          >
            {selected ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function SettingsCardIcon({
  icon,
  communityIcon,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Drawn instead of `icon`, for symbols the app takes from the other icon set (the pin). */
  communityIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  colors: { mist: string; accentText: string };
}) {
  return (
    <View
      className="h-11 w-11 items-center justify-center rounded-2xl"
      style={{ backgroundColor: colors.mist }}
    >
      {communityIcon ? (
        <MaterialCommunityIcons name={communityIcon} size={22} color={colors.accentText} />
      ) : (
        <Ionicons name={icon} size={22} color={colors.accentText} />
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

/**
 * A title and a line of explanation above a control that fills the card's
 * width. (SettingsCardCopy is for the text beside an icon or a switch: in a
 * column it would collapse.)
 */
export function SettingsCardHeading({ title, body }: { title: string; body: string }) {
  return (
    <View className="gap-1">
      <AppText className="text-base font-semibold text-cove-ink">{title}</AppText>
      <AppText className="text-sm text-cove-muted">{body}</AppText>
    </View>
  );
}

export function SettingsNavCard({
  icon,
  title,
  summary,
  onPress,
  colors,
  needsInternet = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  onPress: () => void;
  colors: { mist: string; accent: string; accentText: string; ink: string; muted: string };
  /**
   * Only the server can do this. With no connection the card stays in place,
   * dimmed and tagged, and a tap says why instead of opening it.
   */
  needsInternet?: boolean;
}) {
  const { isRTL } = useI18n();
  const { offline } = useNeedsInternet();
  const blocked = needsInternet && offline;

  return (
    <Pressable
      onPress={blocked ? showNeedsInternet : onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: blocked }}
      className="flex-row items-center gap-3 overflow-hidden rounded-3xl bg-cove-paper px-4 py-4 active:opacity-80"
    >
      <View
        className="min-w-0 flex-1 flex-row items-center gap-3"
        style={blocked ? { opacity: 0.4 } : undefined}
      >
        <SettingsCardIcon icon={icon} colors={colors} />
        <SettingsCardCopy title={title} body={summary} bodyLines={1} />
      </View>
      {blocked ? (
        <NeedsInternetTag />
      ) : (
        <Ionicons
          name={isRTL ? "chevron-back" : "chevron-forward"}
          size={iconSize.sm}
          color={colors.ink}
        />
      )}
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
  colors: { mist: string; accent: string; accentText: string; muted: string };
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
  const { colors, glass, scheme } = useTheme();
  const motionOff = useMotionOff();
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
        // The shake says "only the host can change this", so it stays with animations off.
        KEEP_MOTION,
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
            entering={motionOff ? undefined : FadeInDown.duration(160)}
            exiting={motionOff ? undefined : FadeOut.duration(160)}
            pointerEvents="none"
            className="absolute flex-row items-center gap-1.5 rounded-xl px-3 py-1.5"
            style={{
              bottom: "100%",
              marginBottom: 6,
              [isRTL ? "left" : "right"]: 12,
              // Floats over the next card, so it is solid in Glass too.
              backgroundColor: glass ? colors.overlay : scheme === "dark" ? colors.mist : colors.ink,
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
  const color = active ? colors.accentText : colors.ink;
  return (
    <HostShake>
      <View
        className="flex-row items-center gap-1.5 self-start rounded-xl px-2.5 py-1"
        style={{
          backgroundColor: active
            ? withAlpha(colors.accentText, scheme === "dark" ? 0.2 : 0.14)
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
  colors: { mist: string; accent: string; accentText: string; white: string };
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
  t: (
    key:
      | "markSelectedBought"
      | "pinSelected"
      | "moveSelected"
      | "markSelectedUrgent"
      | "laterAction"
      | "delete",
  ) => string,
) {
  if (action === "buy") return t("markSelectedBought");
  if (action === "pin") return t("pinSelected");
  if (action === "move") return t("moveSelected");
  if (action === "urgent") return t("markSelectedUrgent");
  if (action === "later") return t("laterAction");
  return t("delete");
}

function swipeActionHint(
  action: SwipeAction,
  t: (
    key:
      | "swipeBuyHint"
      | "swipePinHint"
      | "swipeMoveHint"
      | "swipeUrgentHint"
      | "swipeLaterHint"
      | "swipeDeleteHint",
  ) => string,
) {
  if (action === "buy") return t("swipeBuyHint");
  if (action === "pin") return t("swipePinHint");
  if (action === "move") return t("swipeMoveHint");
  if (action === "urgent") return t("swipeUrgentHint");
  if (action === "later") return t("swipeLaterHint");
  return t("swipeDeleteHint");
}

function SwipeActionGlyph({ action, color, size = 18 }: { action: SwipeAction; color: string; size?: number }) {
  if (action === "buy") return <MaterialCommunityIcons name="cart-check" size={size} color={color} />;
  if (action === "pin") return <MaterialCommunityIcons name="pin" size={size} color={color} />;
  if (action === "move") return <Ionicons name="swap-horizontal" size={size} color={color} />;
  if (action === "urgent") return <Ionicons name="flash" size={size} color={color} />;
  if (action === "later") return <Ionicons name="hourglass-outline" size={size} color={color} />;
  return <Ionicons name="trash-outline" size={size} color={color} />;
}

/** Readable action tint on the dark cards; light mode uses the solid lane colour. */
const SWIPE_ACTION_LABEL_DARK: Record<SwipeAction, string> = {
  buy: "#4ADE80",
  pin: "#C4B5FD",
  move: "#93C5FD",
  urgent: "#FCD34D",
  later: "#5EEAD4",
  delete: "#F07178",
};

function swipeActionLabelColor(action: SwipeAction, scheme: "light" | "dark") {
  return scheme === "dark" ? SWIPE_ACTION_LABEL_DARK[action] : SWIPE_ACTION_TONE[action].solid;
}

/** Icon tile: a wash of the lane colour, so the page matches the real swipe. */
function swipeActionTile(action: SwipeAction, scheme: "light" | "dark") {
  return withAlpha(SWIPE_ACTION_TONE[action].solid, scheme === "dark" ? 0.22 : 0.14);
}

const PREVIEW_PULL = 0.44;

/** A small item card that swipes itself, showing the same lanes as the list. */
function SwipePreview({ left, right }: { left: SwipeAction; right: SwipeAction }) {
  const { t } = useI18n();
  const { colors, glass } = useTheme();
  // -1 = pulled left, 1 = pulled right.
  const pull = useSharedValue(0);
  const width = useSharedValue(0);

  useEffect(() => {
    const move = { duration: 520, easing: Easing.inOut(Easing.cubic) };
    pull.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(-1, move),
          withDelay(900, withTiming(0, move)),
          withDelay(500, withTiming(1, move)),
          withDelay(900, withTiming(0, move)),
          withDelay(700, withTiming(0, { duration: 1 })),
        ),
        -1,
        false,
        undefined,
        // This preview exists to show the swipe, so it plays with animations off too.
        KEEP_MOTION,
      ),
      KEEP_MOTION,
    );
    return () => cancelAnimation(pull);
  }, [pull]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pull.value * width.value * PREVIEW_PULL }],
  }));
  // Swiping left opens the lane on the right edge, and the other way round.
  const leftLane = useAnimatedStyle(() => ({
    opacity: interpolate(pull.value, [-0.12, 0], [1, 0], Extrapolation.CLAMP),
  }));
  const rightLane = useAnimatedStyle(() => ({
    opacity: interpolate(pull.value, [0, 0.12], [0, 1], Extrapolation.CLAMP),
  }));

  function lane(action: SwipeAction, edge: "left" | "right", style: typeof leftLane) {
    return (
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: edge === "left" ? "row" : "row-reverse",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
            backgroundColor: SWIPE_ACTION_TONE[action].solid,
          },
          style,
        ]}
      >
        <SwipeActionGlyph action={action} color="#FFFFFF" size={20} />
        <AppText className="text-sm font-semibold" style={{ color: "#FFFFFF" }} numberOfLines={1}>
          {swipeActionName(action, t)}
        </AppText>
      </Animated.View>
    );
  }

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden rounded-2xl"
      style={{ direction: "ltr", height: 56 }}
      onLayout={(event) => {
        width.value = event.nativeEvent.layout.width;
      }}
    >
      {lane(left, "right", leftLane)}
      {lane(right, "left", rightLane)}
      <Animated.View
        className="flex-1 flex-row items-center gap-3 rounded-2xl px-4"
        style={[
          {
            // Solid in Glass too: the lanes lie under this card and would show through it.
            backgroundColor: glass ? colors.overlay : colors.mist,
            borderWidth: 1,
            borderColor: withAlpha(colors.muted, 0.18),
          },
          cardStyle,
        ]}
      >
        <Ionicons name="menu" size={18} color={colors.muted} />
        <View
          className="h-2.5 w-24 rounded-full"
          style={{ backgroundColor: withAlpha(colors.muted, 0.35) }}
        />
        <View className="flex-1" />
        <View
          className="h-5 w-5 rounded-full"
          style={{ borderWidth: 1, borderColor: withAlpha(colors.muted, 0.35) }}
        />
      </Animated.View>
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
            style={{ backgroundColor: swipeActionTile(selected, scheme) }}
          >
            <Ionicons
              name={side === "left" ? "arrow-back" : "arrow-forward"}
              size={18}
              color={swipeActionLabelColor(selected, scheme)}
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
                    opacity: taken && !active ? 0.5 : 1,
                  }}
                >
                  <View
                    className="h-9 w-9 items-center justify-center rounded-xl"
                    style={{ backgroundColor: swipeActionTile(action, scheme) }}
                  >
                    <SwipeActionGlyph action={action} color={swipeActionLabelColor(action, scheme)} />
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
                  ) : taken ? (
                    <View
                      className="rounded-full px-2 py-0.5"
                      style={{ borderWidth: 1, borderColor: withAlpha(colors.muted, 0.4) }}
                    >
                      <AppText className="text-[11px] text-cove-muted">
                        {side === "left" ? t("swipeUsedOnRight") : t("swipeUsedOnLeft")}
                      </AppText>
                    </View>
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
        <SwipePreview left={prefs.left} right={prefs.right} />
        <View className="mt-2.5 flex-row justify-between gap-3" style={{ direction: "ltr" }}>
          {(["left", "right"] as const).map((side) => (
            <View key={side} className="min-w-0 shrink flex-row items-center gap-1">
              {side === "left" ? (
                <Ionicons name="arrow-back" size={12} color={colors.muted} />
              ) : null}
              <AppText className="shrink text-xs text-cove-muted" numberOfLines={1}>
                {side === "left" ? t("swipeLeft") : t("swipeRight")}
                {": "}
                <AppText
                  className="text-xs font-semibold"
                  style={{ color: swipeActionLabelColor(prefs[side], scheme) }}
                >
                  {label(prefs[side])}
                </AppText>
              </AppText>
              {side === "right" ? (
                <Ionicons name="arrow-forward" size={12} color={colors.muted} />
              ) : null}
            </View>
          ))}
        </View>
      </CardBlock>

      {sideCard("left")}
      {sideCard("right")}
    </View>
  );
}
