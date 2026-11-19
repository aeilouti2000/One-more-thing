// Regenerates the app icon PNGs from one vector definition.
// Usage: node scripts/build-icons.mjs   (needs `rsvg-convert` on PATH)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../assets/images");
const TMP = mkdtempSync(join(tmpdir(), "omt-icons-"));

const NAVY = "#071633";
const AMBER = "#FFB020";
const WHITE = "#FFFFFF";
const SOFT_BLUE = "#8FAEE6";
const PAPER = "#F3F6FB";

const stroke = (d, color, width) =>
  `<path d="${d}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
const pill = (x, y, w, h, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" ${extra}/>`;
const tick = (cx, cy, color) => stroke(`M${cx - 2.8} ${cy + 0.2}l2 2l3.6-4.2`, color, 1.9);
const omt = (color) =>
  `<circle cx="32.7" cy="69" r="4.6" fill="none" stroke="${color}" stroke-width="3.6"/>` +
  stroke("M45.4 73.6V64.4L50 71.3L54.6 64.4V73.6", color, 3.6) +
  stroke("M62.7 64.4H71.9M67.3 64.4V73.6", color, 3.6);

/** The mark on a 100x100 canvas: two ticked rows, then the amber OMT row. */
function glyph({ row1, row2, ink, letters = NAVY, amber = AMBER }) {
  return (
    `<circle cx="24.5" cy="26.5" r="6.5" fill="${row1}"/>` +
    tick(24.5, 26.5, ink) +
    pill(36, 20, 24, 13, row1) +
    `<circle cx="24.5" cy="45.5" r="6.5" fill="${row2}"/>` +
    tick(24.5, 45.5, ink) +
    pill(36, 39, 36, 13, row2) +
    pill(18, 58, 64, 22, amber) +
    omt(letters)
  );
}

/** Single-colour version with the ticks and letters cut out, for Android themed icons. */
function monochromeGlyph() {
  const shapes =
    `<g opacity=".6"><circle cx="24.5" cy="26.5" r="6.5" fill="#fff"/>${pill(36, 20, 24, 13, "#fff")}</g>` +
    `<circle cx="24.5" cy="45.5" r="6.5" fill="#fff"/>` +
    pill(36, 39, 36, 13, "#fff") +
    pill(18, 58, 64, 22, "#fff") +
    tick(24.5, 26.5, "#000") +
    tick(24.5, 45.5, "#000") +
    omt("#000");
  return `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">${shapes}</mask></defs><rect width="100" height="100" fill="#fff" mask="url(#m)"/>`;
}

function svg({ body, background, scale = 1 }) {
  const bg = background ? `<rect width="100" height="100" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg}<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${body}</g></svg>`;
}

const dark = glyph({ row1: SOFT_BLUE, row2: WHITE, ink: NAVY });
const light = glyph({ row1: SOFT_BLUE, row2: NAVY, ink: PAPER });
// iOS tints this one itself, so it only needs greys on black.
const tinted = glyph({ row1: "#8C8C8C", row2: "#FFFFFF", ink: "#000000", letters: "#000000", amber: "#D9D9D9" });

// Android crops adaptive icons to the middle of the canvas, and the system
// splash crops to a circle, so those marks are drawn smaller than the tile.
const ADAPTIVE = 0.7;
const SPLASH = 0.86;

const files = [
  ["icon.png", 1024, { body: dark, background: NAVY }],
  ["ios-icon-light.png", 1024, { body: light, background: PAPER }],
  ["ios-icon-tinted.png", 1024, { body: tinted, background: "#000000" }],
  ["android-icon-foreground.png", 1024, { body: dark, scale: ADAPTIVE }],
  ["android-icon-monochrome.png", 1024, { body: monochromeGlyph(), scale: ADAPTIVE }],
  ["splash-icon.png", 1024, { body: dark, background: NAVY, scale: SPLASH }],
  ["splash-glyph.png", 1024, { body: dark, scale: SPLASH }],
  ["favicon.png", 192, { body: dark, background: NAVY }],
];

for (const [name, size, options] of files) {
  const source = join(TMP, name.replace(".png", ".svg"));
  writeFileSync(source, svg(options));
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), source, "-o", join(OUT, name)]);
  console.log(`wrote ${name} (${size}px)`);
}
