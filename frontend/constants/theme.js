const DEFAULT_ACCENT = "#2196F3";
const DEFAULT_SURFACE_DEPTH = "default";
const SURFACE_DEPTH_LEVELS = ["soft", "default", "deep", "true"];
const DEFAULT_GLASS_FROST = "frosted";
const GLASS_FROST_LEVELS = ["clear", "frosted", "milky"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSurfaceDepth(value) {
  if (SURFACE_DEPTH_LEVELS.includes(value)) return value;
  return DEFAULT_SURFACE_DEPTH;
}

function normalizeGlassFrost(value) {
  if (GLASS_FROST_LEVELS.includes(value)) return value;
  return DEFAULT_GLASS_FROST;
}

/** 0 = soft (lifted), 1 = true dark. */
function surfaceDepthAmount(depth) {
  switch (normalizeSurfaceDepth(depth)) {
    case "soft":
      return 0;
    case "deep":
      return 0.7;
    case "true":
      return 1;
    default:
      return 0.35;
  }
}

function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => char + char)
          .join("")
      : raw;
  return `#${hex.toUpperCase()}`;
}

const RGBA_PATTERN =
  /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

/**
 * Channels and alpha of "#RGB", "#RRGGBB", "rgb()" or "rgba()". Glass
 * surfaces are see-through, so a palette colour is not always a hex.
 * Null when the text is not a colour.
 */
function parseColor(value) {
  const hex = normalizeHex(value);
  if (hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
      a: 1,
    };
  }
  const match = typeof value === "string" ? value.trim().match(RGBA_PATTERN) : null;
  if (!match) return null;
  return {
    r: clamp(Number(match[1]), 0, 255),
    g: clamp(Number(match[2]), 0, 255),
    b: clamp(Number(match[3]), 0, 255),
    a: match[4] === undefined ? 1 : clamp(Number(match[4]), 0, 1),
  };
}

/** The channels of a colour; a see-through colour's alpha is left out. */
function hexToRgb(color) {
  const { r, g, b } = parseColor(color) ?? parseColor(DEFAULT_ACCENT);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  const toHex = (channel) =>
    Math.round(clamp(channel, 0, 255))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex) {
  let { r, g, b } = hexToRgb(hex);
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (max !== min) {
    const delta = max - min;
    saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r:
        hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        hue = ((b - r) / delta + 2) / 6;
        break;
      default:
        hue = ((r - g) / delta + 4) / 6;
        break;
    }
  }

  return {
    h: hue * 360,
    s: saturation * 100,
    l: lightness * 100,
  };
}

function hslToHex(h, s, l) {
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const color =
      lightness - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return rgbToHex(channel(0), channel(8), channel(4));
}

function mixHex(from, to, amount) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = clamp(amount, 0, 1);
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

/** A see-through colour stays see-through: its own alpha is multiplied in. */
function withAlpha(color, alpha) {
  const { r, g, b, a } = parseColor(color) ?? parseColor(DEFAULT_ACCENT);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1) * a})`;
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  );
}

function onAccentFor(accentHex) {
  return relativeLuminance(accentHex) > 0.55 ? "#121212" : "#FFFFFF";
}

/**
 * The accent for text, icons and outlines. A dark pick is fine as a button
 * fill, but drawn on a dark surface it disappears, so dark mode lifts it to a
 * readable shade of the same hue. Light mode uses the accent as is.
 */
function accentTextFor(accentHex, scheme) {
  if (scheme !== "dark") return accentHex;
  // Bright enough to read on a dark surface already.
  if (relativeLuminance(accentHex) >= 0.2) return accentHex;
  const { h, s } = hexToHsl(accentHex);
  return s < 12 ? hslToHex(0, 0, 80) : hslToHex(h, Math.min(s, 70), 68);
}

function withOnAccent(palette, scheme = "light") {
  return {
    ...palette,
    // Light and dark surfaces are solid already; only Glass needs its own.
    overlay: palette.paper,
    onAccent: onAccentFor(palette.accent),
    accentText: accentTextFor(palette.accent, scheme),
  };
}

function darkSurface(tint, softHex, deepHex, tintSoft, tintDeep, depth) {
  const base = mixHex(softHex, deepHex, depth);
  const tintAmount = tintSoft + (tintDeep - tintSoft) * depth;
  return mixHex(base, tint, tintAmount);
}

function buildColors(scheme, accentHex, surfaceDepth = DEFAULT_SURFACE_DEPTH) {
  const accent = normalizeHex(accentHex) ?? DEFAULT_ACCENT;
  const { h, s, l } = hexToHsl(accent);
  const neutral = s < 12;
  const depth = surfaceDepthAmount(surfaceDepth);

  if (neutral) {
    if (scheme === "dark") {
      return withOnAccent({
        ice: mixHex("#121212", "#050505", depth),
        paper: mixHex("#1E1E1E", "#0A0A0A", depth),
        mist: mixHex("#2E2E2E", "#141414", depth),
        line: mixHex("#404040", "#1E1E1E", depth),
        muted: mixHex("#B0B0B0", "#9A9A9A", depth),
        ink: "#F2F2F2",
        // Respect a dark grey pick for buttons; keep a readability floor.
        accent: hslToHex(0, 0, clamp(l, 22, 88)),
        accentDeep: hslToHex(0, 0, clamp(l + 14, 36, 92)),
        soft: mixHex("#181818", "#080808", depth),
        deep: mixHex("#101010", "#030303", depth),
        white: "#FFFFFF",
        transparent: "transparent",
      }, "dark");
    }

    return withOnAccent({
      ice: "#F5F5F5",
      paper: "#FFFFFF",
      mist: "#EEEEEE",
      line: "#D6D6D6",
      muted: "#616161",
      ink: "#212121",
      accent: "#212121",
      accentDeep: "#000000",
      soft: "#F5F5F5",
      deep: "#212121",
      white: "#FFFFFF",
      transparent: "transparent",
    });
  }

  const sat = clamp(s, 42, 88);

  if (scheme === "dark") {
    // Surfaces stay near-neutral charcoal; depth darkens them.
    // Accent follows the user's pick (including darker blues) with a contrast floor.
    const tint = hslToHex(h, clamp(sat * 0.4, 14, 32), 28);
    const accentL = clamp(l, 24, 64);
    return withOnAccent({
      ice: darkSurface(tint, "#0B0D10", "#030405", 0.1, 0.05, depth),
      paper: darkSurface(tint, "#14171C", "#07090C", 0.14, 0.07, depth),
      mist: darkSurface(tint, "#1C2128", "#0C1014", 0.16, 0.09, depth),
      line: darkSurface(tint, "#2A313A", "#141A22", 0.18, 0.1, depth),
      muted: hslToHex(h, clamp(sat * 0.28, 10, 24), mixHexLightness(68, 62, depth)),
      ink: hslToHex(h, clamp(sat * 0.1, 4, 14), 93),
      accent: hslToHex(h, sat, accentL),
      accentDeep: hslToHex(h, clamp(sat * 0.7, 28, 56), clamp(accentL + 12, 36, 78)),
      soft: darkSurface(tint, "#101318", "#06080A", 0.12, 0.06, depth),
      deep: darkSurface(tint, "#090B0E", "#020304", 0.08, 0.04, depth),
      white: "#FFFFFF",
      transparent: "transparent",
    }, "dark");
  }

  // Light scheme: keep surfaces derived from hue; accent respects pick within a usable band.
  const accentL = clamp(l, 38, 58);
  return withOnAccent({
    ice: hslToHex(h, clamp(sat, 40, 72), 94),
    paper: "#FFFFFF",
    mist: hslToHex(h, clamp(sat, 38, 68), 88),
    line: hslToHex(h, clamp(sat, 40, 72), 78),
    muted: hslToHex(h, clamp(sat + 8, 48, 86), 38),
    ink: hslToHex(h, clamp(sat + 12, 52, 90), 28),
    accent: hslToHex(h, sat, accentL),
    accentDeep: hslToHex(h, clamp(sat + 12, 52, 90), 28),
    soft: hslToHex(h, clamp(sat, 40, 72), 94),
    deep: hslToHex(h, clamp(sat + 12, 52, 90), 28),
    white: "#FFFFFF",
    transparent: "transparent",
  });
}

function mixHexLightness(from, to, amount) {
  return from + (to - from) * clamp(amount, 0, 1);
}

/** How much white each glass layer carries, per frost level. */
const GLASS_WASH = {
  clear: { paper: 0.055, mist: 0.09, line: 0.12 },
  frosted: { paper: 0.09, mist: 0.13, line: 0.16 },
  milky: { paper: 0.15, mist: 0.19, line: 0.22 },
};

/** The hue the glass theme is built around, and how strongly it shows. */
function glassTint(accentHex) {
  const { h, s } = hexToHsl(normalizeHex(accentHex) ?? DEFAULT_ACCENT);
  // A grey pick gives smoked glass with no colour of its own.
  return { h, sat: s < 12 ? 0 : clamp(s * 0.55, 26, 46) };
}

/** Lightness of the near-black shade the page fades into. */
const GLASS_BASE_LIGHTNESS = 7;

/** How bright accent-coloured text must be to read on a lit glass card. */
const GLASS_ACCENT_TEXT_LUMINANCE = 0.55;

/**
 * The accent for text and icons on glass: the same hue, lightened until it
 * reads on a card with the page's colour showing through it. Blues and purples need
 * a lot of lifting; yellows and greens are bright enough nearly as they are.
 */
function glassAccentText(accentHex) {
  const { h, s, l } = hexToHsl(normalizeHex(accentHex) ?? DEFAULT_ACCENT);
  if (s < 12) return hslToHex(0, 0, 86);
  const sat = clamp(s, 45, 90);
  for (let lightness = clamp(l, 50, 90); lightness < 90; lightness += 2) {
    const color = hslToHex(h, sat, lightness);
    if (relativeLuminance(color) >= GLASS_ACCENT_TEXT_LUMINANCE) return color;
  }
  return hslToHex(h, sat, 90);
}

/**
 * Glass: the dark theme's text and accent, on see-through surfaces. `ice` is
 * the solid colour under the page's fade (see glassBackdropStyle); `paper`, `mist`,
 * `soft` and `line` are washes of white that let it show through.
 */
function buildGlassColors(accentHex, frost = DEFAULT_GLASS_FROST) {
  const dark = buildColors("dark", accentHex, DEFAULT_SURFACE_DEPTH);
  const { h, sat } = glassTint(accentHex);
  const wash = GLASS_WASH[normalizeGlassFrost(frost)];
  return {
    ...dark,
    ice: hslToHex(h, sat, GLASS_BASE_LIGHTNESS),
    deep: hslToHex(h, sat, GLASS_BASE_LIGHTNESS - 2),
    // Sheets, dialogs and menus cover other content, so they stay solid.
    overlay: hslToHex(h, sat * 0.7, 13),
    paper: withAlpha("#FFFFFF", wash.paper),
    mist: withAlpha("#FFFFFF", wash.mist),
    soft: withAlpha("#FFFFFF", wash.paper * 0.6),
    line: withAlpha("#FFFFFF", wash.line),
    // Both brighter than dark mode's: they also have to read at the bright top of the page.
    muted: hslToHex(h, sat * 0.5, 77),
    accentText: glassAccentText(accentHex),
  };
}

/** How strongly the theme colour shows at the top of the page, before the limit below. */
const GLASS_FADE_STRENGTH = 0.47;
/** Brightest the fade may make the page, so white text on it stays readable. */
const GLASS_FADE_LUMINANCE = 0.13;
/** How much of that strength is left at each point down the page. */
const GLASS_FADE_STOPS = [
  { at: "0%", share: 1 },
  { at: "34%", share: 0.5 },
  { at: "68%", share: 0.13 },
  // The same colour at zero alpha: fading to "transparent" turns grey.
  { at: "100%", share: 0 },
];

/**
 * The page background of the glass theme: the theme colour at the top of the
 * page, fading straight down into a near-black shade of the same hue.
 * A style object for a plain View.
 */
function glassBackdropStyle(accentHex) {
  const { h, sat } = glassTint(accentHex);
  const color = sat === 0 ? hslToHex(0, 0, 62) : hslToHex(h, 80, 52);
  // Yellows and greens are far brighter than blues at the same strength.
  const strength = Math.min(
    GLASS_FADE_STRENGTH,
    GLASS_FADE_LUMINANCE / relativeLuminance(color),
  );
  return {
    backgroundColor: hslToHex(h, sat, GLASS_BASE_LIGHTNESS),
    backgroundImage: [
      {
        type: "linear-gradient",
        direction: "to bottom",
        colorStops: GLASS_FADE_STOPS.map((stop) => ({
          color: withAlpha(color, Math.round(strength * stop.share * 100) / 100),
          positions: [stop.at],
        })),
      },
    ],
  };
}

const lightColors = buildColors("light", DEFAULT_ACCENT);
const darkColors = buildColors("dark", DEFAULT_ACCENT);
const colors = lightColors;

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  screen: 16,
};

const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 28,
  full: 999,
};

const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 19,
  display: 26,
};

const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
};

const fonts = {
  sans: "ReadexPro_400Regular",
  medium: "ReadexPro_500Medium",
  semibold: "ReadexPro_600SemiBold",
  bold: "ReadexPro_700Bold",
};

const iconSize = {
  sm: 22,
  md: 26,
};

const logo = {
  size: 72,
  radius: 999,
};

const tabBar = {
  height: 68,
  inset: 20,
  radius: 34,
  borderWidth: 0.3,
  labelSize: 12,
  itemPaddingTop: 4,
  /** On wide/fold layouts the bar is centered and capped to this width. */
  maxWidth: 440,
};

const shadow = {
  color: lightColors.ink,
  offset: { width: 0, height: 10 },
  opacity: 0.12,
  radius: 20,
  elevation: 12,
};

function getColors(
  scheme,
  accentHex = DEFAULT_ACCENT,
  surfaceDepth = DEFAULT_SURFACE_DEPTH,
) {
  return buildColors(scheme, accentHex, surfaceDepth);
}

function getGlassColors(accentHex = DEFAULT_ACCENT, frost = DEFAULT_GLASS_FROST) {
  return buildGlassColors(accentHex, frost);
}

/**
 * How far a card is lifted off the page, as style: spread it last. A
 * see-through (glass) card casts no shadow, because Android draws the shadow
 * under the whole card, where it shows through as a grey slab.
 */
function cardLift(seeThrough, elevation) {
  return seeThrough ? { elevation: 0, shadowOpacity: 0 } : { elevation };
}

/** Outer floated sheet corner radius. */
const floatedRadius = 20;
/**
 * Fields / buttons / badges inside floated sheets.
 * Shorter than the sheet so the same number reads as a pill — keep this
 * closer to a soft rectangle to match the container.
 */
const floatedControlRadius = 12;

function glassFieldStyle(scheme, palette = getColors(scheme)) {
  if (scheme === "dark") {
    return {
      borderRadius: floatedControlRadius,
      backgroundColor: withAlpha(palette.white, 0.05),
      borderColor: withAlpha(palette.white, 0.1),
    };
  }

  return {
    borderRadius: floatedControlRadius,
    backgroundColor: "#F4F5F7",
    borderColor: withAlpha("#12141A", 0.08),
  };
}

function floatedCardStyle(scheme, palette = getColors(scheme)) {
  const dark = scheme === "dark";
  return {
    borderRadius: floatedRadius,
    borderWidth: 1,
    borderColor: dark ? withAlpha(palette.white, 0.1) : withAlpha("#12141A", 0.08),
    backgroundColor: dark ? palette.overlay : palette.white,
    shadowColor: "#12141A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: dark ? 0.48 : 0.14,
    shadowRadius: 32,
    elevation: 14,
  };
}

/** Soft grouped block inside a floated card (Option B sections). */
function floatedSectionStyle(scheme, palette = getColors(scheme)) {
  const dark = scheme === "dark";
  return {
    borderRadius: floatedControlRadius + 2,
    borderWidth: 1,
    borderColor: dark ? withAlpha(palette.white, 0.08) : withAlpha("#12141A", 0.06),
    backgroundColor: dark ? withAlpha(palette.white, 0.035) : "#F6F7F9",
  };
}

function headerIconFrameStyle(scheme, palette = getColors(scheme)) {
  return {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor:
      scheme === "dark"
        ? withAlpha(palette.muted, 0.55)
        : withAlpha(palette.white, 0.55),
    backgroundColor: withAlpha(palette.white, 0.2),
  };
}

/** Chip colors for actions sitting on the ScreenHeader band. */
function headerActionStyle(scheme, palette = getColors(scheme)) {
  if (scheme === "dark") {
    // Neutral/dark palettes use a light accent — prefer a raised surface so the
    // chip stays readable instead of a near-white pill with washed-out label.
    if (relativeLuminance(palette.accent) > 0.55) {
      return {
        backgroundColor: palette.mist,
        color: palette.ink,
      };
    }
    return {
      backgroundColor: palette.accent,
      color: palette.onAccent,
    };
  }

  // Light headers are accent-filled; a white chip with accent label contrasts.
  return {
    backgroundColor: palette.white,
    color: palette.accent,
  };
}

function getCssVars(palette) {
  return {
    "--color-cove-ice": palette.ice,
    "--color-cove-paper": palette.paper,
    "--color-cove-mist": palette.mist,
    "--color-cove-line": palette.line,
    "--color-cove-muted": palette.muted,
    "--color-cove-ink": palette.ink,
    "--color-cove-accent": palette.accent,
    "--color-cove-accent-deep": palette.accentDeep,
    "--color-cove-accent-text": palette.accentText,
    "--color-cove-on-accent": palette.onAccent,
    "--color-cove-soft": palette.soft,
    "--color-cove-deep": palette.deep,
  };
}

const theme = {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  fonts,
  iconSize,
  logo,
  tabBar,
  shadow,
};

module.exports = {
  DEFAULT_ACCENT,
  DEFAULT_SURFACE_DEPTH,
  SURFACE_DEPTH_LEVELS,
  colors,
  lightColors,
  darkColors,
  DEFAULT_GLASS_FROST,
  GLASS_FROST_LEVELS,
  getColors,
  getGlassColors,
  glassBackdropStyle,
  getCssVars,
  normalizeHex,
  normalizeSurfaceDepth,
  normalizeGlassFrost,
  hexToHsl,
  hslToHex,
  withAlpha,
  glassFieldStyle,
  cardLift,
  floatedCardStyle,
  floatedSectionStyle,
  floatedRadius,
  floatedControlRadius,
  headerIconFrameStyle,
  headerActionStyle,
  spacing,
  radius,
  fontSize,
  fontWeight,
  fonts,
  iconSize,
  logo,
  tabBar,
  shadow,
  theme,
};
