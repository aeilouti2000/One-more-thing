import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";

/** Refuse decompression bombs: ~50 MP is far above any phone camera. */
export const MAX_INPUT_PIXELS = 50_000_000;
const PHOTO_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);

export class NotAPhotoError extends Error {}

/** A sharp pipeline for an uploaded photo, after checking it really is one. */
export async function openPhoto(buffer: Buffer) {
  const source = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS });
  const { format } = await source.metadata().catch(() => ({ format: undefined }));
  // Photos only: no SVG (it can pull in fonts and huge canvases), GIF or PDF.
  if (!format || !PHOTO_FORMATS.has(format)) throw new NotAPhotoError();
  // rotate() applies the camera's EXIF orientation; outputs carry no metadata,
  // so location and device details are dropped.
  return source.rotate();
}

/**
 * A tiny blurred preview of an image (~30 bytes, base64). The app shows it
 * while the real file loads. See https://evanw.github.io/thumbhash/
 */
export async function thumbHashOf(image: sharp.Sharp) {
  const { data, info } = await image
    .clone()
    .resize({ width: 100, height: 100, fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
}

/** The two sizes stored for an item photo, and its placeholder. */
export async function photoVariants(buffer: Buffer) {
  const image = await openPhoto(buffer);
  const full = await image
    .clone()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await image
    .clone()
    .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  return {
    full: full.data,
    width: full.info.width,
    height: full.info.height,
    thumb,
    thumbhash: await thumbHashOf(image),
  };
}
