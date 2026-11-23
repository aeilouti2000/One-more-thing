import { getCategoryLabel } from "@/constants/categories";
import { translate, type Locale, type TranslationKey } from "@/constants/i18n";
import {
  getColors,
  hexToHsl,
  hslToHex,
  type SurfaceDepth,
  type ThemeColors,
} from "@/constants/theme";
import type { Household } from "@/features/homes/types/household";
import type { Pin } from "@/features/items/api/pins";
import type { Purchase } from "@/features/items/types/purchase";
import { currencySymbol } from "@/features/items/utils/currency";
import {
  currentMonth,
  normalizeName,
  summarizeMonth,
  TRIP_TOTALS,
} from "@/features/items/utils/insights";
import { isUnsavedId } from "@/features/widgets/actions";
import {
  WIDGET_GLASS_CLARITY_STEPS,
  type WidgetGlassTint,
  type WidgetStylePrefs,
} from "@/features/widgets/widget-style";
import type { ThemePreference } from "@/lib/theme-storage";

/**
 * Everything the home screen widgets show, as one plain object. The widgets
 * are drawn by Android code that knows nothing about the app (see
 * modules/home-widgets): it gets the finished wording and colours from here.
 */

export type WidgetPalette = {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  fill: string;
  onFill: string;
  urgent: string;
  warn: string;
  danger: string;
  track: string;
};

type Section<T> = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
  items: T[];
};

export type WidgetSnapshot = {
  /** "ready", or a state where the widgets only show the message below. */
  state: "ready" | "signedOut" | "noHome";
  rtl: boolean;
  themeMode: "light" | "dark" | "system";
  light: WidgetPalette;
  dark: WidgetPalette;
  /**
   * Only for glass widgets: how solid (0–1) the background, the tiles on it
   * and the budget ring's track are drawn. The colours themselves stay solid.
   */
  glass?: { bg: number; surface: number; track: number };
  messageTitle: string;
  messageBody: string;
  list: Section<{ id: string; name: string; flag: string; detail: string }>;
  pins: Section<{ id: string; name: string; glyph: string; onList: boolean }>;
  /** `at` (ms): the widget shows it as a clock time, which never goes stale. */
  pulse: Section<{ id: string; initial: string; color: string; text: string; at: number }>;
  budget: {
    /** "message": only title and body (costs are off). */
    mode: "ring" | "message";
    title: string;
    body: string;
    /** 0–1 of the ring to fill. */
    fraction: number;
    tone: "accent" | "warn" | "danger";
    center: string;
    centerSub: string;
    line1: string;
    line2: string;
  };
};

export type WidgetSnapshotInput = {
  now: Date;
  locale: Locale;
  theme: { preference: ThemePreference; accent: string; surfaceDepth: SurfaceDepth };
  /** The Widgets page's own look, separate from the app's theme. */
  style: WidgetStylePrefs;
  /** null: nobody is signed in. */
  user: { id: string } | null;
  /** null: signed in, but not in a home. */
  household: Household | null;
  items: Purchase[];
  /** The list the app last showed; null shows every list's items. */
  list: { id: string; title: string } | null;
  /** More than one list: the widget says which one it shows. */
  listCount: number;
  pins: Pin[];
};

const LIST_ROWS = 60;
const PIN_TILES = 40;
const PULSE_ROWS = 20;
const PULSE_DAYS = 14;
/** Things one person does this close together are one line ("bought 12 items"). */
const PULSE_GROUP_MS = 20 * 60_000;
/** Budget use from which the ring turns to the warning colour (as in History). */
const WARN_AT = 0.8;

const AVATAR_COLORS = ["#2196F3", "#8E6CF0", "#E0823D", "#2FA37C", "#D6517D", "#4C8DAE"];

const UNIT_KEYS: Record<string, TranslationKey> = {
  kg: "unitKg",
  g: "unitG",
  L: "unitL",
  ml: "unitMl",
  pack: "unitPack",
};

function mix(from: string, to: string, amount: number) {
  const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const blend = (index: number) =>
    Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${blend(0)}${blend(1)}${blend(2)}`.toUpperCase();
}

/** The widget's colours for one theme, from the app's own palette. */
export function widgetPalette(colors: ThemeColors, scheme: "light" | "dark"): WidgetPalette {
  const dark = scheme === "dark";
  return {
    bg: colors.paper,
    surface: colors.mist,
    ink: colors.ink,
    muted: colors.muted,
    accent: colors.accentText,
    fill: colors.accent,
    onFill: colors.onAccent,
    urgent: dark ? "#FCA5A5" : "#B91C1C",
    warn: dark ? "#E6B450" : "#B7791F",
    danger: dark ? "#F07178" : "#C2414A",
    track: mix(colors.paper, colors.muted, 0.2),
  };
}

/** The most and the least solid a glass widget's background gets. */
const GLASS_BG_ALPHA = { solid: 0.9, clear: 0.5 };
/** Tiles and the ring's track: a faint wash over the glass. */
const GLASS_SURFACE_ALPHA = 0.14;
const GLASS_TRACK_ALPHA = 0.22;

const GLASS_THEME_MODE: Record<WidgetGlassTint, WidgetSnapshot["themeMode"]> = {
  auto: "system",
  light: "light",
  dark: "dark",
};

/**
 * A glass widget's colours for one tint. The wallpaper behind it is unknown,
 * so text is near white on the dark tint and near black on the light one.
 * That reads on most wallpapers; at the most see-through settings a very
 * bright wallpaper under the dark tint (or a very dark one under the light
 * tint) leaves the smaller grey text faint, which is what the slider is for.
 */
function glassWidgetPalette(colors: ThemeColors, scheme: "light" | "dark"): WidgetPalette {
  const themed = widgetPalette(colors, scheme);
  const { h, s } = hexToHsl(colors.accent);
  const tint = s < 12 ? 0 : 32;
  if (scheme === "dark") {
    return {
      ...themed,
      bg: hslToHex(h, tint, 9),
      surface: "#FFFFFF",
      ink: "#F6F8FB",
      muted: hslToHex(h, tint * 0.5, 82),
      track: "#FFFFFF",
    };
  }
  const ink = hslToHex(h, tint, 10);
  return {
    ...themed,
    bg: "#FFFFFF",
    surface: ink,
    ink,
    muted: hslToHex(h, tint * 0.7, 24),
    // The accent itself is too pale to read on see-through white.
    accent: colors.accentDeep,
    track: ink,
  };
}

/**
 * Both themes' colours and how the widgets switch between them: the part of
 * the snapshot that the Widgets page also draws its preview from.
 */
export function widgetLook({
  theme,
  style,
}: Pick<WidgetSnapshotInput, "theme" | "style">): Pick<
  WidgetSnapshot,
  "themeMode" | "light" | "dark" | "glass"
> {
  const light = getColors("light", theme.accent, theme.surfaceDepth);
  const dark = getColors("dark", theme.accent, theme.surfaceDepth);
  if (style.style !== "glass") {
    return {
      // The app's glass theme is drawn on dark.
      themeMode: theme.preference === "glass" ? "dark" : theme.preference,
      light: widgetPalette(light, "light"),
      dark: widgetPalette(dark, "dark"),
    };
  }
  const clarity = style.clarity / (WIDGET_GLASS_CLARITY_STEPS - 1);
  const bg = GLASS_BG_ALPHA.solid + (GLASS_BG_ALPHA.clear - GLASS_BG_ALPHA.solid) * clarity;
  return {
    themeMode: GLASS_THEME_MODE[style.tint],
    light: glassWidgetPalette(light, "light"),
    dark: glassWidgetPalette(dark, "dark"),
    glass: {
      bg: Math.round(bg * 100) / 100,
      surface: GLASS_SURFACE_ALPHA,
      track: GLASS_TRACK_ALPHA,
    },
  };
}

/**
 * Invisible marks that fix the reading direction of a line. Without one,
 * Android takes it from the first letter, so an Arabic sentence that starts
 * with a Latin name ("Sara أضاف Yogurt") would be laid out backwards.
 */
const LTR_MARK = "\u200E";
const RTL_MARK = "\u200F";

function directed(text: string, locale: Locale) {
  return `${locale === "ar" ? RTL_MARK : LTR_MARK}${text}`;
}

function firstLetter(text: string) {
  const first = Array.from(text.trim())[0] ?? "";
  return first.toLocaleUpperCase();
}

function hash(text: string) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) >>> 0;
  }
  return value;
}

/** 312.4 → "312", 17.25 → "17.3", 8 → "8": short enough for a small widget. */
export function compactNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 100) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

function compactMoney(value: number, currency: string) {
  return `${currencySymbol(currency)} ${compactNumber(value)}`;
}

function quantityLabel(item: { quantity: number; unit?: string }, locale: Locale) {
  const unit = (item.unit ?? "").trim();
  if (unit) {
    const key = UNIT_KEYS[unit];
    return `${item.quantity} ${key ? translate(key, undefined, locale) : unit}`;
  }
  // Kept left-to-right, so Arabic does not turn it into "2×".
  return item.quantity === 1 ? "" : `${LTR_MARK}×${item.quantity}`;
}

function isWaiting(item: Purchase) {
  return item.status === "needed" && !item.laterAt;
}

function listSection(input: WidgetSnapshotInput, home: Household): WidgetSnapshot["list"] {
  const { locale, list } = input;
  const rows = input.items.filter(
    (item) =>
      isWaiting(item) &&
      // Still being saved: it has no id the server knows yet.
      !isUnsavedId(item.id) &&
      (!list || item.listId === list.id),
  );
  const count = translate("widgetToBuy", { count: rows.length }, locale);
  return {
    title: home.name,
    subtitle: list && input.listCount > 1 ? `${list.title} · ${count}` : count,
    emptyTitle: translate("widgetListEmptyTitle", undefined, locale),
    emptyBody: translate("widgetListEmptyBody", undefined, locale),
    items: rows.slice(0, LIST_ROWS).map((item) => {
      const category = item.category === "other" ? "" : getCategoryLabel(item.category, locale);
      return {
        id: item.id,
        name: item.name,
        flag: item.urgent ? translate("urgent", undefined, locale) : "",
        detail: quantityLabel(item, locale) || category,
      };
    }),
  };
}

function pinsSection(input: WidgetSnapshotInput): WidgetSnapshot["pins"] {
  const { locale } = input;
  const waiting = new Set(input.items.filter(isWaiting).map((item) => normalizeName(item.name)));
  return {
    title: translate("widgetPinsTitle", undefined, locale),
    subtitle: translate("widgetPinsHint", undefined, locale),
    emptyTitle: translate("widgetPinsEmptyTitle", undefined, locale),
    emptyBody: translate("widgetPinsEmptyBody", undefined, locale),
    items: input.pins.slice(0, PIN_TILES).map((pin) => ({
      id: pin.id,
      name: pin.name,
      glyph: firstLetter(pin.name),
      onList: waiting.has(normalizeName(pin.name)),
    })),
  };
}

type PulseEvent = {
  type: "added" | "bought" | "notFound";
  at: number;
  actorKey: string;
  actorName: string;
  mine: boolean;
  itemId: string;
  itemName: string;
};

function pulseEvents(input: WidgetSnapshotInput): PulseEvent[] {
  const since = input.now.getTime() - PULSE_DAYS * 24 * 60 * 60_000;
  const userId = input.user?.id;
  const events: PulseEvent[] = [];
  const add = (
    type: PulseEvent["type"],
    when: string | undefined,
    actorId: string | undefined,
    actorName: string | undefined,
    item: Purchase,
  ) => {
    const name = (actorName ?? "").trim();
    const at = when ? new Date(when).getTime() : NaN;
    if (!name || Number.isNaN(at) || at < since || at > input.now.getTime() + 60_000) return;
    events.push({
      type,
      at,
      actorKey: actorId ?? name,
      actorName: name,
      mine: Boolean(actorId) && actorId === userId,
      itemId: item.id,
      itemName: item.name,
    });
  };
  for (const item of input.items) {
    if (isUnsavedId(item.id)) continue;
    add("added", item.createdAt, item.addedById, item.addedByName, item);
    if (item.status === "bought") add("bought", item.boughtAt, item.boughtById, item.boughtByName, item);
    if (item.status === "needed") add("notFound", item.notFoundAt, item.notFoundById, item.notFoundByName, item);
  }
  // Newest first; the id keeps the order the same on every run.
  return events.sort((a, b) => b.at - a.at || a.itemId.localeCompare(b.itemId));
}

function pulseText(group: PulseEvent[], locale: Locale) {
  const [latest] = group;
  const vars = { name: latest.actorName, item: latest.itemName, count: group.length, more: group.length - 1 };
  const many = group.length > 1;
  const key: TranslationKey =
    latest.type === "added"
      ? many
        ? latest.mine ? "widgetPulseYouAddedMore" : "widgetPulseAddedMore"
        : latest.mine ? "widgetPulseYouAdded" : "widgetPulseAdded"
      : latest.type === "bought"
        ? many
          ? latest.mine ? "widgetPulseYouBoughtMany" : "widgetPulseBoughtMany"
          : latest.mine ? "widgetPulseYouBought" : "widgetPulseBought"
        : latest.mine ? "widgetPulseYouNotFound" : "widgetPulseNotFound";
  return directed(translate(key, vars, locale), locale);
}

function pulseSection(input: WidgetSnapshotInput, home: Household): WidgetSnapshot["pulse"] {
  const { locale } = input;
  const groups: PulseEvent[][] = [];
  for (const event of pulseEvents(input)) {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1];
    const joins =
      previous !== undefined &&
      event.type !== "notFound" &&
      previous.type === event.type &&
      previous.actorKey === event.actorKey &&
      previous.at - event.at <= PULSE_GROUP_MS;
    if (joins) group.push(event);
    else if (groups.length < PULSE_ROWS) groups.push([event]);
    else break;
  }
  return {
    title: translate("widgetPulseTitle", undefined, locale),
    subtitle: home.name,
    emptyTitle: translate("widgetPulseEmptyTitle", undefined, locale),
    emptyBody: translate("widgetPulseEmptyBody", undefined, locale),
    items: groups.map((group) => {
      const [latest] = group;
      return {
        id: `${latest.type}-${latest.itemId}`,
        initial: firstLetter(latest.actorName),
        color: AVATAR_COLORS[hash(latest.actorKey) % AVATAR_COLORS.length],
        text: pulseText(group, locale),
        at: latest.at,
      };
    }),
  };
}

function budgetSection(input: WidgetSnapshotInput, home: Household): WidgetSnapshot["budget"] {
  const { locale, now } = input;
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(key, vars, locale);
  const base = { title: "", body: "", fraction: 0, center: "", centerSub: "", line1: "", line2: "" };
  if (!home.costsEnabled) {
    return {
      ...base,
      mode: "message",
      tone: "accent",
      title: t("widgetBudgetOffTitle"),
      body: t("widgetBudgetOffBody"),
    };
  }

  const summary = summarizeMonth(input.items, currentMonth(now));
  const spent = summary.total;
  const budget = home.monthlyBudget;
  const center = compactNumber(spent);

  if (!budget) {
    const month = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { month: "long" }).format(now);
    return {
      ...base,
      mode: "ring",
      tone: "accent",
      center,
      centerSub: month,
      line1: t("widgetBudgetNone"),
      line2: t("widgetBudgetSetHint"),
    };
  }

  const centerSub = t("widgetBudgetOf", { budget: compactMoney(budget, home.currency) });
  if (spent > budget) {
    const top = summary.byCategory.find((row) => row.category !== TRIP_TOTALS);
    return {
      ...base,
      mode: "ring",
      tone: "danger",
      fraction: 1,
      center,
      centerSub,
      line1: t("widgetBudgetOver", { amount: compactMoney(spent - budget, home.currency) }),
      line2: top ? t("widgetBudgetMost", { category: getCategoryLabel(top.category, locale) }) : "",
    };
  }

  const used = spent / budget;
  const left = budget - spent;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // Today counts: on the last day there is one day left to spend in.
  const daysLeft = daysInMonth - now.getDate() + 1;
  return {
    ...base,
    mode: "ring",
    tone: used >= WARN_AT ? "warn" : "accent",
    fraction: used,
    center,
    centerSub,
    line1: t("widgetBudgetLeft", { amount: compactMoney(left, home.currency) }),
    line2:
      daysLeft <= 1
        ? t("widgetBudgetLastDay")
        : t("widgetBudgetPace", {
            days: daysLeft,
            amount: compactMoney(left / daysLeft, home.currency),
          }),
  };
}

function emptySection<T>(): Section<T> {
  return { title: "", subtitle: "", emptyTitle: "", emptyBody: "", items: [] };
}

export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const { locale, household } = input;
  const t = (key: TranslationKey) => translate(key, undefined, locale);
  const shell = { rtl: locale === "ar", ...widgetLook(input) };
  const blank = {
    list: emptySection<WidgetSnapshot["list"]["items"][number]>(),
    pins: emptySection<WidgetSnapshot["pins"]["items"][number]>(),
    pulse: emptySection<WidgetSnapshot["pulse"]["items"][number]>(),
    budget: {
      mode: "message" as const,
      title: "",
      body: "",
      fraction: 0,
      tone: "accent" as const,
      center: "",
      centerSub: "",
      line1: "",
      line2: "",
    },
  };

  if (!input.user) {
    return {
      ...shell,
      ...blank,
      state: "signedOut",
      messageTitle: t("widgetSignedOutTitle"),
      messageBody: t("widgetSignedOutBody"),
    };
  }
  if (!household) {
    return {
      ...shell,
      ...blank,
      state: "noHome",
      messageTitle: t("widgetNoHomeTitle"),
      messageBody: t("widgetNoHomeBody"),
    };
  }
  return {
    ...shell,
    state: "ready",
    messageTitle: "",
    messageBody: "",
    list: listSection(input, household),
    pins: pinsSection(input),
    pulse: pulseSection(input, household),
    budget: budgetSection(input, household),
  };
}
