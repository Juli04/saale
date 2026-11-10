/**
 * The site icon an admin uploads, stored under `<uploads>/branding/<name>`.
 *
 * One upload becomes a whole set: the favicon, the apple-touch icon, the two
 * sizes the web app manifest names, a pair of maskable variants for Android and
 * the small mark the sidebar draws. They share one directory name, so a new
 * upload is a new URL and the browser cannot keep serving the old picture.
 *
 * Only the directory name is kept in the database, and it is checked against the
 * pattern we generate before it is ever joined onto a path.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isBrandingIconName } from "@/lib/branding/icon-name";
import { getUploadsDir } from "@/lib/uploads";

/**
 * Every size the store writes and the icon route serves.
 *
 * `maskable-*` are the padded Android variants: the safe zone is a circle of
 * 80% of the square, so the inner picture is inset by a tenth on each side.
 */
export const BRANDING_ICON_SIZES = [
  "16",
  "32",
  "64",
  "180",
  "192",
  "512",
  "maskable-192",
  "maskable-512",
] as const;

export type BrandingIconSize = (typeof BRANDING_ICON_SIZES)[number];

/** Whether a path segment is a size this module writes. */
export function isBrandingIconSize(value: string): value is BrandingIconSize {
  return (BRANDING_ICON_SIZES as readonly string[]).includes(value);
}

/** The square sizes rendered straight from the upload. */
const PLAIN_SIZES = [16, 32, 64, 180, 192, 512] as const;

/** The padded sizes, and the square they are padded into. */
const MASKABLE_SIZES = [192, 512] as const;

/** Uploads above this are refused before decoding. */
export const ICON_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/** The folder icons live in. */
function iconRoot(): string {
  return path.join(getUploadsDir(), "branding");
}

/** Absolute directory for a stored icon, or `null` for a name we did not write. */
function iconDir(dirName: string): string | null {
  if (!isBrandingIconName(dirName)) return null;
  return path.join(iconRoot(), dirName);
}

/** Why an upload was refused, or `null` when it is fine. */
export function validateIconUpload(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return `Unsupported image type: ${file.type || "unknown"}`;
  }
  if (file.size === 0) return "The image is empty";
  if (file.size > ICON_MAX_UPLOAD_BYTES) {
    const limit = (ICON_MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0);
    return `The image is larger than ${limit}MB`;
  }
  return null;
}

/** `#rrggbb` for sharp's `extend({ background })`. */
function hex(rgb: { r: number; g: number; b: number }): string {
  const part = (value: number) => value.toString(16).padStart(2, "0");
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

/**
 * Decode, square every size and store the set. Returns the directory name.
 *
 * A mark with its own background is padded with its dominant colour, so the
 * Android mask cuts into something that belongs to the icon rather than into a
 * dark ring for a light mark.
 */
export async function storeBrandingIcon(buffer: Buffer): Promise<string> {
  const dirName = `icon-${randomUUID()}`;
  const directory = path.join(iconRoot(), dirName);
  await fs.mkdir(directory, { recursive: true });

  const stats = await sharp(buffer).stats();
  const background = hex(stats.dominant);

  for (const size of PLAIN_SIZES) {
    await sharp(buffer)
      .rotate()
      .resize(size, size, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toFile(path.join(directory, `${size}.png`));
  }

  for (const size of MASKABLE_SIZES) {
    const inner = Math.round(size * 0.8);
    const offset = Math.floor((size - inner) / 2);
    await sharp(buffer)
      .rotate()
      .resize(inner, inner, { fit: "cover" })
      .extend({
        top: offset,
        bottom: size - inner - offset,
        left: offset,
        right: size - inner - offset,
        background,
      })
      .png({ compressionLevel: 9 })
      .toFile(path.join(directory, `maskable-${size}.png`));
  }

  return dirName;
}

/** Delete a stored icon set. A name we did not write is ignored. */
export async function removeBrandingIcon(dirName: string): Promise<void> {
  const directory = iconDir(dirName);
  if (!directory) return;
  await fs.rm(directory, { recursive: true, force: true });
}

/** The bytes of one size, or `null` when the name or the file is gone. */
export async function readBrandingIcon(
  dirName: string,
  size: BrandingIconSize,
): Promise<Buffer | null> {
  const directory = iconDir(dirName);
  if (!directory) return null;
  try {
    return await fs.readFile(path.join(directory, `${size}.png`));
  } catch (err) {
    // A row pointing at a deleted icon is a missing icon, not a failure.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
